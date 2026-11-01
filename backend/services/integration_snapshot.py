"""One read-only snapshot of a household, for personal dashboards (LAveren).

A dashboard on someone's own computer pulls this instead of calling a dozen
app endpoints. It holds what a "home screen" tile needs: care that is due,
recent activity, the latest photos, the plants and spaces, with an absolute
`url` into floreren.app on everything so a click opens the real app.

Two rules shape it:

* **Database only, few queries.** No weather, LLM or R2 calls: a dashboard
  refresh must never cost a quota or wait on a third party.
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
import os
import time
from typing import Any

from care_types import CARE_TYPES

SCHEMA_VERSION = 1
SNAPSHOT_CACHE_TTL_S = 15 * 60
SNAPSHOT_CACHE_MAX_ENTRIES = 64
UPCOMING_DAYS = 7
CARE_LIST_LIMIT = 50
RECENT_ACTIVITY_LIMIT = 15
RECENT_PHOTOS_LIMIT = 12


def app_url() -> str:
    return os.environ.get("APP_URL", "https://floreren.app").rstrip("/")


# ── cache ────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class CachedSnapshot:
    body: bytes
    etag: str
    account_id: int
    day: date
    expires_at: float


_entries: dict[tuple[str, str], CachedSnapshot] = {}
# Bumped by every forget, so a snapshot built while its token was being
# revoked cannot be stored afterwards and outlive the revocation.
_generation = 0


def cache_generation() -> int:
    return _generation


def get_cached(token_hash: str, lang: str, *, today: date) -> CachedSnapshot | None:
    """The cached snapshot, unless it expired or was built on an earlier day
    ("due today" must roll over at midnight, not up to 15 minutes later)."""
    key = (token_hash, lang)
    entry = _entries.get(key)
    if entry is None:
        return None
    if entry.day != today or entry.expires_at <= time.monotonic():
        _entries.pop(key, None)
        return None
    return entry


def store(
    token_hash: str,
    lang: str,
    body: bytes,
    *,
    account_id: int,
    today: date,
    generation: int,
) -> CachedSnapshot:
    entry = CachedSnapshot(
        body=body,
        etag=f'"{sha256(body).hexdigest()[:32]}"',
        account_id=account_id,
        day=today,
        expires_at=time.monotonic() + SNAPSHOT_CACHE_TTL_S,
    )
    if generation != _generation:
        return entry
    key = (token_hash, lang)
    if key not in _entries and len(_entries) >= SNAPSHOT_CACHE_MAX_ENTRIES:
        oldest = min(_entries, key=lambda k: _entries[k].expires_at)
        _entries.pop(oldest, None)
    _entries[key] = entry
    return entry


def forget_account(account_id: int) -> None:
    """Drop every cached snapshot of one account (a token revoked or deleted)."""
    global _generation
    _generation += 1
    for key in [k for k, entry in _entries.items() if entry.account_id == account_id]:
        _entries.pop(key, None)


def clear_cache() -> None:
    global _generation
    _generation += 1
    _entries.clear()


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
        """SELECT m.id, m.name, m.slug, m.map_type
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
            }
            for m in maps
        ],
        "plants": plants_out,
    }


def encode(snapshot: dict[str, Any]) -> bytes:
    return json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
