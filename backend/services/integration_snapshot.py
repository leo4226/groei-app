"""One read-only snapshot of a household, for personal dashboards (LAveren).

A dashboard on someone's own computer pulls this instead of calling a dozen
app endpoints. It holds what a "home screen" tile needs: care that is due,
recent activity, the latest photos, the plants and spaces, with an absolute
`url` into floreren.app on everything so a click opens the real app.

Two rules shape it:

* **No paid or quota-limited calls.** No LLM, R2 or PlantNet. Weather comes
  from the shared Open-Meteo forecast cache (one fetch per garden location per
  hour, fail-soft), and the biodiversity score is the app's own DB-only
  calculation. Either one failing yields null, never a failed snapshot.
* **Cached in-process, keyed by the token hash.** Neon bills compute per
  wake-up, so a dashboard polling this must not keep it awake. A hit is served
  without a single query (the same trade-off as calendar_feed_cache: a revoked
  token can keep reading the cached copy on another Fly machine for at most
  SNAPSHOT_CACHE_TTL_S).

Language follows the bilingual-data rules: species names and care labels come
from the `*_nl`/`*_en` column for the requested language and are null when that
language is missing — never silently filled from the other one. `latin_name`
is always there as the stable fallback.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from hashlib import sha256
import json
import logging
import os
import time
from typing import Any

logger = logging.getLogger(__name__)

from care_types import CARE_TYPES
from services import weather_forecast

SCHEMA_VERSION = 1
SNAPSHOT_CACHE_TTL_S = 15 * 60
SNAPSHOT_CACHE_MAX_ENTRIES = 256
UPCOMING_DAYS = 7
CARE_LIST_LIMIT = 50
RECENT_ACTIVITY_LIMIT = 15
RECENT_PHOTOS_LIMIT = 12


WEATHER_DAYS = 5


def app_url() -> str:
    return os.environ.get("APP_URL", "https://floreren.app").rstrip("/")


def api_base() -> str:
    return os.environ.get("PUBLIC_API_BASE_URL", "https://api.floreren.app/api").rstrip("/")


def thumbnail_url(map_id: int) -> str:
    return f"{api_base()}/integrations/maps/{map_id}/thumbnail.svg"


# ── cache ────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class CachedSnapshot:
    body: bytes
    etag: str
    media_type: str
    account_id: int
    household_id: int
    day: date
    expires_at: float


# Keyed by (token hash, variant): the variant is the snapshot language ("" =
# the account's own) or "map:<id>" for a thumbnail.
_entries: dict[tuple[str, str], CachedSnapshot] = {}
# Bumped by every forget, so a snapshot built while its token was being
# revoked cannot be stored afterwards and outlive the revocation.
_generation = 0


def cache_generation() -> int:
    return _generation


def get_cached(token_hash: str, variant: str, *, today: date) -> CachedSnapshot | None:
    """The cached entry, unless it expired or was built on an earlier day
    ("due today" must roll over at midnight, not up to 15 minutes later)."""
    key = (token_hash, variant)
    entry = _entries.get(key)
    if entry is None:
        return None
    if entry.day != today or entry.expires_at <= time.monotonic():
        _entries.pop(key, None)
        return None
    return entry


def store(
    token_hash: str,
    variant: str,
    body: bytes,
    *,
    account_id: int,
    household_id: int,
    today: date,
    generation: int,
    media_type: str = "application/json",
) -> CachedSnapshot:
    entry = CachedSnapshot(
        body=body,
        etag=f'"{sha256(body).hexdigest()[:32]}"',
        media_type=media_type,
        account_id=account_id,
        household_id=household_id,
        day=today,
        expires_at=time.monotonic() + SNAPSHOT_CACHE_TTL_S,
    )
    if generation != _generation:
        return entry
    key = (token_hash, variant)
    if key not in _entries and len(_entries) >= SNAPSHOT_CACHE_MAX_ENTRIES:
        oldest = min(_entries, key=lambda k: _entries[k].expires_at)
        _entries.pop(oldest, None)
    _entries[key] = entry
    return entry


def _forget(match) -> None:
    global _generation
    _generation += 1
    for key in [k for k, entry in _entries.items() if match(entry)]:
        _entries.pop(key, None)


def forget_account(account_id: int) -> None:
    """Drop every cached entry of one account (a token revoked or deleted)."""
    _forget(lambda entry: entry.account_id == account_id)


def forget_household(household_id: int) -> None:
    """Drop every member's cached entries after care was logged from a
    dashboard, so the next pull shows it done rather than 15 minutes later."""
    _forget(lambda entry: entry.household_id == household_id)


def clear_cache() -> None:
    _forget(lambda entry: True)


# ── building ─────────────────────────────────────────────────────────────────


def _as_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _iso(value: Any) -> str | None:
    """Timestamps out as ISO-8601 UTC ("Z"); they are stored naive UTC."""
    if value is None:
        return None
    if isinstance(value, datetime):
        moment = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return moment.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    if isinstance(value, date):
        return value.isoformat()
    text = str(value)
    try:
        return _iso(datetime.fromisoformat(text.replace(" ", "T").replace("Z", "+00:00")))
    except ValueError:
        return text


def _care_label(care_type: str, lang: str) -> dict[str, str | None]:
    definition = CARE_TYPES.get(care_type) or {}
    return {
        "label": definition.get(f"label_{lang}"),
        "icon": definition.get("icon"),
    }


async def _rows(db, sql: str, params: tuple) -> list[dict]:
    return [dict(row) for row in await db.execute_fetchall(sql, params)]


# WMO weather codes (Open-Meteo) → one coarse, language-free condition key.
def weather_condition(code: Any) -> str | None:
    try:
        code = int(code)
    except (TypeError, ValueError):
        return None
    if code == 0:
        return "clear"
    if code in (1, 2):
        return "partly_cloudy"
    if code == 3:
        return "cloudy"
    if code in (45, 48):
        return "fog"
    if 51 <= code <= 57:
        return "drizzle"
    if 61 <= code <= 67 or 80 <= code <= 82:
        return "rain"
    if 71 <= code <= 77 or code in (85, 86):
        return "snow"
    if 95 <= code <= 99:
        return "thunderstorm"
    return None


def _at(values: Any, index: int) -> Any:
    return values[index] if isinstance(values, list) and index < len(values) else None


async def build_weather(lat: float, lon: float) -> dict[str, Any] | None:
    """Today plus the next few days at the garden, from the shared forecast
    cache. None when there is no forecast at all (an outage with nothing
    cached); a stale-but-cached forecast is returned with stale=true."""
    try:
        forecast = await weather_forecast.get_map_forecast(lat, lon)
    except Exception:  # fail-soft: the snapshot must not die on weather
        logger.warning("integration snapshot: weather lookup failed", exc_info=True)
        return None
    if not forecast or not forecast.get("available"):
        return None
    daily = forecast.get("daily") or {}
    days = []
    for index, day in enumerate((daily.get("time") or [])[:WEATHER_DAYS]):
        code = _at(daily.get("weather_code"), index)
        days.append({
            "date": day,
            "min_c": _at(daily.get("temperature_2m_min"), index),
            "max_c": _at(daily.get("temperature_2m_max"), index),
            "precipitation_mm": _at(daily.get("precipitation_sum"), index),
            "weather_code": code,
            "condition": weather_condition(code),
        })
    current = forecast.get("current") or {}
    soon = days[:3]
    lows = [d["min_c"] for d in soon if isinstance(d["min_c"], (int, float))]
    highs = [d["max_c"] for d in soon if isinstance(d["max_c"], (int, float))]
    return {
        "stale": bool(forecast.get("stale")),
        "source_timestamp": forecast.get("source_timestamp"),
        "location": forecast.get("location"),
        "current": {
            "temperature_c": current.get("temperature_2m"),
            "humidity_pct": current.get("relative_humidity_2m"),
            "weather_code": current.get("weather_code"),
            "condition": weather_condition(current.get("weather_code")),
        } if current else None,
        "days": days,
        # The next three days, today included: what a tile should warn about.
        "frost_risk": bool(lows) and min(lows) <= 0,
        "heat": bool(highs) and max(highs) >= 30,
    }


async def build_biodiversity(db, map_id: int) -> dict[str, Any] | None:
    """The garden's biodiversity score, exactly as the map page shows it."""
    from services.garden_biodiversity import compute_for_map

    try:
        profile = await compute_for_map(db, map_id)
    except Exception:  # fail-soft: an odd garden must not break the snapshot
        logger.warning("integration snapshot: biodiversity failed for map %s", map_id, exc_info=True)
        return None
    return {
        "score": profile.score,
        "species_count": profile.species_count,
        "native_count": profile.native_count,
        "invasive_count": profile.invasive_count,
        "drachtplant_count": profile.drachtplant_count,
        "pollinator_months": sum(1 for month in profile.pollinator_coverage_months if month),
        "pollinator_coverage_months": list(profile.pollinator_coverage_months),
        "streek_name": profile.streek_name,
    }


def _care_status(due: date | None, today: date) -> str:
    if due is None or due > today:
        return "ok"
    return "overdue" if due < today else "due_today"


async def plant_care_status(db, *, household_id: int, today: date, now_utc: datetime) -> dict[int, str]:
    """plant id → 'overdue' | 'due_today' for plants with unsnoozed care due."""
    rows = await _rows(
        db,
        """SELECT cs.plant_id, MIN(cs.next_due) AS next_due
           FROM care_schedules cs
           JOIN plants p ON p.id = cs.plant_id
           WHERE p.household_id = ? AND p.is_active = 1 AND cs.is_active = 1
             AND cs.next_due IS NOT NULL AND cs.next_due <= ?
             AND (cs.snoozed_until IS NULL OR cs.snoozed_until <= ?)
           GROUP BY cs.plant_id""",
        (household_id, today, now_utc.replace(tzinfo=None)),
    )
    return {row["plant_id"]: _care_status(_as_date(row["next_due"]), today) for row in rows}


async def build_map_thumbnail(
    db, *, household_id: int, map_id: int, today: date, now_utc: datetime,
) -> str | None:
    """SVG for one of the household's maps, or None when it is not theirs."""
    from services.map_thumbnail import render_map_svg

    maps = await _rows(
        db,
        "SELECT id, viewbox, canvas_data, map_type FROM maps WHERE id = ? AND household_id = ?",
        (map_id, household_id),
    )
    if not maps:
        return None
    plants = await _rows(
        db,
        """SELECT id, map_x, map_y FROM plants
           WHERE household_id = ? AND map_id = ? AND is_active = 1""",
        (household_id, map_id),
    )
    status = await plant_care_status(db, household_id=household_id, today=today, now_utc=now_utc)
    return render_map_svg(
        viewbox=maps[0]["viewbox"],
        canvas_data=maps[0]["canvas_data"],
        map_type=maps[0]["map_type"],
        plants=[{**p, "status": status.get(p["id"], "ok")} for p in plants],
    )


async def build_snapshot(
    db,
    *,
    household_id: int,
    lang: str,
    today: date,
    now_utc: datetime,
) -> dict[str, Any]:
    base = app_url()

    household = await _rows(db, "SELECT name FROM households WHERE id = ?", (household_id,))

    maps = await _rows(
        db,
        """SELECT m.id, m.name, m.slug, m.map_type, m.lat, m.lon
           FROM maps m
           WHERE m.household_id = ?
           ORDER BY m.id""",
        (household_id,),
    )

    plants = await _rows(
        db,
        """SELECT p.id, p.name, p.species, p.photo_path, p.plant_type, p.phase,
                  p.map_id, p.species_id,
                  ps.latin_name, ps.common_name_nl, ps.common_name_en
           FROM plants p
           LEFT JOIN plant_species ps ON ps.id = p.species_id
           WHERE p.household_id = ? AND p.is_active = 1
           ORDER BY LOWER(p.name), p.id""",
        (household_id,),
    )

    horizon = today + timedelta(days=UPCOMING_DAYS)
    schedules = await _rows(
        db,
        """SELECT cs.id, cs.plant_id, cs.care_type, cs.next_due, cs.is_ephemeral
           FROM care_schedules cs
           JOIN plants p ON p.id = cs.plant_id
           WHERE p.household_id = ? AND p.is_active = 1 AND cs.is_active = 1
             AND cs.next_due IS NOT NULL AND cs.next_due <= ?
             AND (cs.snoozed_until IS NULL OR cs.snoozed_until <= ?)
           ORDER BY cs.next_due, cs.id""",
        (household_id, horizon, now_utc.replace(tzinfo=None)),
    )

    activity = await _rows(
        db,
        """SELECT cl.id, cl.plant_id, p.name AS plant_name, cl.care_type,
                  cl.done_at, cl.skipped, u.name AS done_by_name
           FROM care_log cl
           JOIN plants p ON p.id = cl.plant_id
           LEFT JOIN users u ON u.id = cl.done_by
           WHERE p.household_id = ?
           ORDER BY cl.done_at DESC, cl.id DESC
           LIMIT ?""",
        (household_id, RECENT_ACTIVITY_LIMIT),
    )

    photos = await _rows(
        db,
        """SELECT ph.id, ph.plant_id, p.name AS plant_name, ph.url, ph.note, ph.taken_at
           FROM plant_photos ph
           JOIN plants p ON p.id = ph.plant_id
           WHERE ph.household_id = ? AND p.is_active = 1
           ORDER BY ph.taken_at DESC, ph.id DESC
           LIMIT ?""",
        (household_id, RECENT_PHOTOS_LIMIT),
    )
    photo_count = await _rows(
        db,
        "SELECT COUNT(*) AS n FROM plant_photos WHERE household_id = ?",
        (household_id,),
    )

    outdoor = [m for m in maps if m["map_type"] != "indoor"]
    located = next((m for m in outdoor if m["lat"] is not None and m["lon"] is not None), None)
    weather = await build_weather(float(located["lat"]), float(located["lon"])) if located else None
    biodiversity = {m["id"]: await build_biodiversity(db, m["id"]) for m in outdoor}

    map_by_id = {m["id"]: m for m in maps}
    plant_by_id = {p["id"]: p for p in plants}

    def plant_url(plant_id: int) -> str:
        return f"{base}/plants/{plant_id}"

    def map_url(slug: str | None) -> str | None:
        return f"{base}/map/{slug}" if slug else None

    overdue: list[dict] = []
    due_today: list[dict] = []
    upcoming: list[dict] = []
    next_care_by_plant: dict[int, dict] = {}
    for row in schedules:
        due = _as_date(row["next_due"])
        plant = plant_by_id.get(row["plant_id"])
        if due is None or plant is None:
            continue
        space = map_by_id.get(plant["map_id"])
        item = {
            "schedule_id": row["id"],
            "plant_id": plant["id"],
            "plant_name": plant["name"],
            "care_type": row["care_type"],
            **_care_label(row["care_type"], lang),
            "due": due.isoformat(),
            "days_overdue": max((today - due).days, 0),
            "weather_driven": bool(row["is_ephemeral"]),
            "photo_url": plant["photo_path"],
            "map_name": space["name"] if space else None,
            "url": plant_url(plant["id"]),
        }
        next_care_by_plant.setdefault(plant["id"], item)
        if due < today:
            overdue.append(item)
        elif due == today:
            due_today.append(item)
        else:
            upcoming.append(item)

    plant_counts: dict[int, int] = {}
    for plant in plants:
        if plant["map_id"] is not None:
            plant_counts[plant["map_id"]] = plant_counts.get(plant["map_id"], 0) + 1

    plants_out = []
    for plant in plants:
        space = map_by_id.get(plant["map_id"])
        next_care = next_care_by_plant.get(plant["id"])
        plants_out.append({
            "id": plant["id"],
            "name": plant["name"],
            "common_name": plant.get(f"common_name_{lang}"),
            "latin_name": plant.get("latin_name") or plant.get("species"),
            "plant_type": plant["plant_type"],
            "phase": plant["phase"],
            "photo_url": plant["photo_path"],
            "map_id": plant["map_id"],
            "map_name": space["name"] if space else None,
            "next_care": (
                {k: next_care[k] for k in ("care_type", "label", "icon", "due")}
                if next_care else None
            ),
            "url": plant_url(plant["id"]),
        })

    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": _iso(now_utc),
        "today": today.isoformat(),
        "language": lang,
        "app_url": base,
        "household": {"name": household[0]["name"] if household else None},
        "weather": weather,
        "counts": {
            "plants": len(plants),
            "species": len({p["species_id"] for p in plants if p["species_id"] is not None}),
            "maps": len(maps),
            "photos": int(photo_count[0]["n"]) if photo_count else 0,
            "care_overdue": len(overdue),
            "care_due_today": len(due_today),
            "care_upcoming": len(upcoming),
        },
        "care": {
            "overdue": overdue[:CARE_LIST_LIMIT],
            "due_today": due_today[:CARE_LIST_LIMIT],
            "upcoming": upcoming[:CARE_LIST_LIMIT],
        },
        "recent_activity": [
            {
                "plant_id": row["plant_id"],
                "plant_name": row["plant_name"],
                "care_type": row["care_type"],
                **_care_label(row["care_type"], lang),
                "done_at": _iso(row["done_at"]),
                "done_by": row["done_by_name"],
                "skipped": bool(row["skipped"]),
                "url": plant_url(row["plant_id"]),
            }
            for row in activity
        ],
        "recent_photos": [
            {
                "id": row["id"],
                "plant_id": row["plant_id"],
                "plant_name": row["plant_name"],
                "url": row["url"],
                "note": row["note"],
                "taken_at": _iso(row["taken_at"]),
                "plant_url": plant_url(row["plant_id"]),
            }
            for row in photos
        ],
        "maps": [
            {
                "id": m["id"],
                "name": m["name"],
                "type": "indoor" if m["map_type"] == "indoor" else "outdoor",
                "plant_count": plant_counts.get(m["id"], 0),
                "url": map_url(m["slug"]),
                "thumbnail_url": thumbnail_url(m["id"]),
                # Outdoor only: indoor plants have no Dutch ecological role.
                "biodiversity": biodiversity.get(m["id"]),
            }
            for m in maps
        ],
        "plants": plants_out,
    }


def encode(snapshot: dict[str, Any]) -> bytes:
    return json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
