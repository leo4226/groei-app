import json
import os
from datetime import date, datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import db_dep, get_db

router = APIRouter()

TREFLE_TOKEN       = os.getenv("TREFLE_TOKEN") or ""
TREFLE_BASE        = "https://trefle.io/api/v1"
ANTHROPIC_API_KEY  = os.getenv("ANTHROPIC_API_KEY") or ""
ANTHROPIC_URL      = "https://api.anthropic.com/v1/messages"

_grow_here_cache: dict = {}  # key: (sun_hours_rounded, month) → response dict

OPEN_METEO_URL = (
    "https://api.open-meteo.com/v1/forecast"
    "?latitude=52.3715&longitude=4.8499"
    "&daily=precipitation_sum"
    "&past_days=14&forecast_days=0"
    "&timezone=Europe%2FAmsterdam"
)

OPEN_METEO_TEMP_URL = (
    "https://api.open-meteo.com/v1/forecast"
    "?latitude=52.3715&longitude=4.8499"
    "&daily=temperature_2m_max,temperature_2m_min"
    "&past_days=7&forecast_days=0"
    "&timezone=Europe%2FAmsterdam"
)

_rain_cache: dict = {}
_temp_cache: dict = {}

# ── curated fallback data ────────────────────────────────────────────────────
# Growth fields sourced from RHS, Missouri Botanical Garden, Gardenia.net.
# Used to fill null fields when Trefle has no growth data for a species.

_CURATED: dict[str, dict] = {
    "Fargesia murielae": {
        "light_raw": 5, "light_label": "partial",
        "precip_min_mm": 600, "precip_max_mm": 1500,
        "bloom_months": [],
        "flower_colors": [],
        "avg_height_cm": 350, "max_height_cm": 450,
        "duration": "perennial", "leaf_retention": True,
        "toxicity": "none", "edible": False,
    },
    "Camellia japonica": {
        "light_raw": 4, "light_label": "partial",
        "precip_min_mm": 800, "precip_max_mm": 1200,
        "bloom_months": ["january", "february", "march", "april"],
        "flower_colors": ["red", "pink", "white"],
        "avg_height_cm": 200, "max_height_cm": 300,
        "duration": "perennial", "leaf_retention": True,
        "toxicity": "none", "edible": False,
    },
    "Miscanthus sinensis": {
        "light_raw": 8, "light_label": "full_sun",
        "precip_min_mm": 500, "precip_max_mm": 1200,
        "bloom_months": ["august", "september", "october"],
        "flower_colors": ["silver", "white"],
        "avg_height_cm": 150, "max_height_cm": 200,
        "duration": "perennial", "leaf_retention": False,
        "toxicity": "none", "edible": False,
    },
    "Quercus robur": {
        "light_raw": 7, "light_label": "full_sun",
        "precip_min_mm": 600, "precip_max_mm": 900,
        "bloom_months": ["april", "may"],
        "flower_colors": ["yellow", "green"],
        "avg_height_cm": 2500, "max_height_cm": 4000,
        "duration": "perennial", "leaf_retention": False,
        "toxicity": "low", "edible": False,
    },
    "Rubus idaeus": {
        "light_raw": 7, "light_label": "full_sun",
        "precip_min_mm": 600, "precip_max_mm": 1000,
        "bloom_months": ["may", "june"],
        "flower_colors": ["white", "pink"],
        "avg_height_cm": 150, "max_height_cm": 200,
        "duration": "perennial", "leaf_retention": False,
        "toxicity": "none", "edible": True,
    },
    "Nerium oleander": {
        "light_raw": 9, "light_label": "full_sun",
        "precip_min_mm": 300, "precip_max_mm": 700,
        "bloom_months": ["june", "july", "august", "september"],
        "flower_colors": ["pink", "red", "white", "yellow"],
        "avg_height_cm": 200, "max_height_cm": 300,
        "duration": "perennial", "leaf_retention": True,
        "toxicity": "high", "edible": False,
    },
    "Verbena bonariensis": {
        "light_raw": 9, "light_label": "full_sun",
        "precip_min_mm": 400, "precip_max_mm": 800,
        "bloom_months": ["june", "july", "august", "september", "october"],
        "flower_colors": ["purple"],
        "avg_height_cm": 120, "max_height_cm": 150,
        "duration": "perennial", "leaf_retention": False,
        "toxicity": "none", "edible": False,
    },
    "Persea americana": {
        "light_raw": 8, "light_label": "full_sun",
        "precip_min_mm": 1000, "precip_max_mm": 2000,
        "bloom_months": ["january", "february", "march"],
        "flower_colors": ["yellow", "green"],
        "avg_height_cm": 200, "max_height_cm": 400,
        "duration": "perennial", "leaf_retention": True,
        "toxicity": "none", "edible": True,
    },
    "Phaseolus vulgaris": {
        "light_raw": 8, "light_label": "full_sun",
        "precip_min_mm": 600, "precip_max_mm": 1000,
        "bloom_months": ["june", "july", "august"],
        "flower_colors": ["white", "red", "purple"],
        "avg_height_cm": 100, "max_height_cm": 200,
        "duration": "annual", "leaf_retention": False,
        "toxicity": "none", "edible": False,
    },
    "Populus nigra 'Italica'": {
        "light_raw": 9, "light_label": "full_sun",
        "precip_min_mm": 500, "precip_max_mm": 900,
        "bloom_months": ["march", "april"],
        "flower_colors": ["yellow", "green"],
        "avg_height_cm": 3000, "max_height_cm": 4500,
        "duration": "perennial", "leaf_retention": False,
        "toxicity": "none", "edible": False,
    },
}

CURATED_FIELDS = [
    "light_raw", "light_label", "precip_min_mm", "precip_max_mm",
    "bloom_months", "flower_colors", "avg_height_cm", "max_height_cm",
    "duration", "leaf_retention", "toxicity", "edible",
]


def _merge_curated(data: dict, scientific_name: str) -> dict:
    """Fill missing/empty growth fields from curated data."""
    curated = _CURATED.get(scientific_name, {})
    for field in CURATED_FIELDS:
        val = data.get(field)
        # Fill if None, or if it's an empty list (Trefle returned no data)
        if field not in curated:
            continue
        if val is None or val == []:
            data[field] = curated[field]
    return data


# ── normalisation helpers ────────────────────────────────────────────────────

def _normalise_light(light) -> str | None:
    if light is None:
        return None
    try:
        v = int(light)
    except (TypeError, ValueError):
        return None
    if v <= 3:
        return "shade"
    if v <= 6:
        return "partial"
    return "full_sun"


_MONTH_EXPAND = {
    "jan": "january",  "feb": "february", "mar": "march",    "apr": "april",
    "may": "may",      "jun": "june",     "jul": "july",     "aug": "august",
    "sep": "september","oct": "october",  "nov": "november", "dec": "december",
}

def _expand_months(months: list) -> list[str]:
    out = []
    for m in months:
        if isinstance(m, str):
            key = m.lower()[:3]
            out.append(_MONTH_EXPAND.get(key, m.lower()))
    return out


def _normalise_duration(duration) -> str | None:
    if not duration or not isinstance(duration, list):
        return None
    return duration[0].lower()


def _assessment(total_mm: float) -> str:
    """Categorise 14-day rainfall total for Dutch growing conditions."""
    if total_mm >= 30:
        return "well_watered"
    if total_mm >= 16:
        return "moderate"
    if total_mm >= 5:
        return "dry"
    return "very_dry"


# ── Trefle fetch ──────────────────────────────────────────────────────────────

async def _fetch_trefle(scientific_name: str) -> dict | None:
    """Search Trefle by species name, fall back to genus only."""
    async with httpx.AsyncClient(timeout=12) as client:
        for query in [scientific_name, scientific_name.split()[0]]:
            # 1. Search
            search_resp = await client.get(
                f"{TREFLE_BASE}/species/search",
                params={"q": query, "token": TREFLE_TOKEN},
            )
            if search_resp.status_code != 200:
                continue
            results = search_resp.json().get("data") or []
            if not results:
                continue

            # Prefer accepted status; fall back to first result
            accepted = next(
                (r for r in results if r.get("status") == "accepted"),
                results[0],
            )
            slug = accepted.get("slug")
            if not slug:
                continue

            # 2. Detail
            detail_resp = await client.get(
                f"{TREFLE_BASE}/species/{slug}",
                params={"token": TREFLE_TOKEN},
            )
            if detail_resp.status_code != 200:
                continue
            d = (detail_resp.json().get("data") or {})

            growth  = d.get("growth")  or {}
            specs   = d.get("specifications") or {}
            foliage = d.get("foliage")  or {}
            flower  = d.get("flower")   or {}

            precip_min = (growth.get("minimum_precipitation") or {}).get("value")
            precip_max = (growth.get("maximum_precipitation") or {}).get("value")
            avg_h      = (specs.get("average_height") or {}).get("value")
            max_h      = (specs.get("maximum_height") or {}).get("value")
            bloom      = growth.get("bloom_months") or []
            colors     = flower.get("color") or []
            light_raw  = growth.get("light")

            result = {
                "trefle_slug":    slug,
                "common_name":    d.get("common_name") or accepted.get("common_name"),
                "family":         d.get("family"),
                "duration":       _normalise_duration(d.get("duration")),
                "leaf_retention": foliage.get("leaf_retention"),
                "light_raw":      light_raw,
                "light_label":    _normalise_light(light_raw),
                "humidity_raw":   growth.get("atmospheric_humidity"),
                "precip_min_mm":  int(precip_min) if precip_min is not None else None,
                "precip_max_mm":  int(precip_max) if precip_max is not None else None,
                "bloom_months":   _expand_months(bloom),
                "flower_colors":  [c.lower() for c in colors if isinstance(c, str)],
                "avg_height_cm":  int(avg_h) if avg_h is not None else None,
                "max_height_cm":  int(max_h) if max_h is not None else None,
                "toxicity":       specs.get("toxicity"),
                "edible":         d.get("edible"),
                "image_url":      d.get("image_url"),
            }
            return _merge_curated(result, scientific_name)

    return None


async def _fetch_claude_species(scientific_name: str) -> dict | None:
    """Ask Claude for care data when Trefle has no results."""
    if not ANTHROPIC_API_KEY:
        return None

    prompt = f"""Geef verzorgingsdata voor de plantensoort: {scientific_name}

Geef alleen geldige JSON terug met dit formaat:
{{
  "common_name": "string (Nederlandse naam)",
  "family": "string (familienaam)",
  "duration": "perennial" of "annual" of "biennial",
  "leaf_retention": true of false,
  "light_raw": getal 0-10,
  "light_label": "shade" of "partial" of "full_sun",
  "precip_min_mm": getal (jaarlijkse neerslag minimum in mm),
  "precip_max_mm": getal (jaarlijkse neerslag maximum in mm),
  "bloom_months": ["month", ...] (lowercase Engelse maandnamen),
  "flower_colors": ["color", ...] (lowercase Engels),
  "avg_height_cm": getal,
  "max_height_cm": getal,
  "toxicity": "none" of "low" of "medium" of "high",
  "edible": true of false
}}"""

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            ANTHROPIC_URL,
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 600,
                "messages": [{"role": "user", "content": prompt}],
            },
        )

    if resp.status_code != 200:
        return None

    raw = resp.json()["content"][0]["text"].strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]

    try:
        d = json.loads(raw)
    except json.JSONDecodeError:
        return None

    return {
        "trefle_slug":   None,
        "common_name":   d.get("common_name"),
        "family":        d.get("family"),
        "duration":      d.get("duration"),
        "leaf_retention": d.get("leaf_retention"),
        "light_raw":     d.get("light_raw"),
        "light_label":   d.get("light_label"),
        "humidity_raw":  None,
        "precip_min_mm": d.get("precip_min_mm"),
        "precip_max_mm": d.get("precip_max_mm"),
        "bloom_months":  d.get("bloom_months") or [],
        "flower_colors": d.get("flower_colors") or [],
        "avg_height_cm": d.get("avg_height_cm"),
        "max_height_cm": d.get("max_height_cm"),
        "toxicity":      d.get("toxicity"),
        "edible":        d.get("edible"),
        "image_url":     None,
    }


# ── endpoints ────────────────────────────────────────────────────────────────

@router.get("/plants/{plant_id}/care-info")
async def get_plant_care_info(plant_id: int, db = Depends(db_dep)):
    row = await db.execute_fetchall(
        "SELECT species, notes FROM plants WHERE id = ?", (plant_id,)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Plant not found")

    scientific_name = row[0]["species"]
    plant_notes     = row[0]["notes"]
    if not scientific_name:
        return {"source": "not_found", "scientific_name": None, "plant_notes": plant_notes}

    # Cache check — 30 days
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    cached = await db.execute_fetchall(
        "SELECT * FROM plant_care_cache WHERE scientific_name = ? AND fetched_at > ?",
        (scientific_name, cutoff),
    )
    if cached:
        c = cached[0]
        return {
            "scientific_name": scientific_name,
            "common_name":     c["common_name"],
            "family":          c["family"],
            "duration":        c["duration"],
            "leaf_retention":  bool(c["leaf_retention"]) if c["leaf_retention"] is not None else None,
            "light_label":     c["light_label"],
            "light_raw":       c["light_raw"],
            "precip_min_mm":   c["precip_min_mm"],
            "precip_max_mm":   c["precip_max_mm"],
            "bloom_months":    json.loads(c["bloom_months"]) if c["bloom_months"] else [],
            "flower_colors":   json.loads(c["flower_colors"]) if c["flower_colors"] else [],
            "avg_height_cm":   c["avg_height_cm"],
            "toxicity":        c["toxicity"],
            "edible":          bool(c["edible"]) if c["edible"] is not None else None,
            "image_url":       c["image_url"],
            "source":          "cache",
            "cached_at":       c["fetched_at"],
            "plant_notes":     plant_notes,
        }

    # Fetch from Trefle (or use curated fallback if token missing)
    if not TREFLE_TOKEN:
        curated = _CURATED.get(scientific_name)
        if curated:
            data = {"trefle_slug": None, "common_name": None, "family": None,
                    "humidity_raw": None, "image_url": None, **curated}
        else:
            data = await _fetch_claude_species(scientific_name)
        if not data:
            return {"source": "not_found", "scientific_name": scientific_name, "plant_notes": plant_notes}
    else:
        data = await _fetch_trefle(scientific_name)

    if not data:
        # Trefle found nothing — try curated, then Claude
        curated = _CURATED.get(scientific_name)
        if curated:
            data = {"trefle_slug": None, "common_name": None, "family": None,
                    "humidity_raw": None, "image_url": None, **curated}
        else:
            data = await _fetch_claude_species(scientific_name)
        if not data:
            return {"source": "not_found", "scientific_name": scientific_name, "plant_notes": plant_notes}

    fetched_at = datetime.now(timezone.utc).isoformat()
    await db.execute(
        """INSERT OR REPLACE INTO plant_care_cache
           (scientific_name, trefle_slug, common_name, family, duration,
            leaf_retention, light_raw, light_label, humidity_raw,
            precip_min_mm, precip_max_mm, bloom_months, flower_colors,
            avg_height_cm, max_height_cm, toxicity, edible, image_url, fetched_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            scientific_name,
            data["trefle_slug"],
            data["common_name"],
            data["family"],
            data["duration"],
            data["leaf_retention"],
            data["light_raw"],
            data["light_label"],
            data["humidity_raw"],
            data["precip_min_mm"],
            data["precip_max_mm"],
            json.dumps(data["bloom_months"]),
            json.dumps(data["flower_colors"]),
            data["avg_height_cm"],
            data["max_height_cm"],
            data["toxicity"],
            data["edible"],
            data["image_url"],
            fetched_at,
        ),
    )
    await db.commit()

    return {
        "scientific_name": scientific_name,
        "common_name":     data["common_name"],
        "family":          data["family"],
        "duration":        data["duration"],
        "leaf_retention":  data["leaf_retention"],
        "light_label":     data["light_label"],
        "light_raw":       data["light_raw"],
        "precip_min_mm":   data["precip_min_mm"],
        "precip_max_mm":   data["precip_max_mm"],
        "bloom_months":    data["bloom_months"],
        "flower_colors":   data["flower_colors"],
        "avg_height_cm":   data["avg_height_cm"],
        "toxicity":        data["toxicity"],
        "edible":          data["edible"],
        "image_url":       data["image_url"],
        "source":          "trefle",
        "cached_at":       fetched_at,
        "plant_notes":     plant_notes,
    }


class GrowHereRequest(BaseModel):
    sun_hours: float
    selected_month: int          # 1-12
    existing_plants: list[str]   # plant names already in the garden


MONTH_NAMES_NL = [
    "januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december",
]


@router.post("/garden/grow-here")
async def grow_here(req: GrowHereRequest):
    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="AI service not configured")

    cache_key = (round(req.sun_hours, 1), req.selected_month)
    if cache_key in _grow_here_cache:
        return _grow_here_cache[cache_key]

    month_name = MONTH_NAMES_NL[req.selected_month - 1]
    plants_str = ", ".join(req.existing_plants) if req.existing_plants else "geen"

    system = (
        "Je bent een tuinadviseur voor tuinen in Amsterdam, Nederland (52.37°N). "
        "De tuin is oost-noordoost-gericht, met de huismuur aan de west-zuidwestzijde (langs de Hoofdweg, richting NNW–ZZO). "
        "Reageer volledig in het Nederlands. "
        "Geef alleen geldige JSON terug, zonder markdown omheen."
    )

    prompt = f"""Dit tuinpunt krijgt ~{req.sun_hours:.1f} uur directe zon per dag in {month_name}.

De gebruiker heeft al de volgende planten in de tuin: {plants_str}.

Stel 5 tot 7 planten voor die goed gedijen op dit punt. Houd rekening met het Amsterdamse klimaat
(koude winters, natte lentes, stedelijk hitte-eilandeffect).

Geef je antwoord als JSON met dit formaat:
{{
  "suggestions": [
    {{
      "commonName": "string",
      "latinName": "string",
      "dutchName": "string",
      "sunFit": "perfect | good | acceptable",
      "reasoning": "string (2-3 zinnen waarom dit punt geschikt is)",
      "caveat": "string | null",
      "companionNote": "string | null"
    }}
  ],
  "spotSummary": "string (1 zin die dit tuinpunt typeert)"
}}

Stel geen planten voor die al in de tuin staan. Geef alleen geldige JSON terug."""

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            ANTHROPIC_URL,
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-sonnet-4-6",
                "max_tokens": 1500,
                "system": system,
                "messages": [{"role": "user", "content": prompt}],
            },
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="AI request failed")

    raw_text = resp.json()["content"][0]["text"]
    # Strip markdown fences if present
    text = raw_text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        text = text.rsplit("```", 1)[0]

    result = json.loads(text)
    _grow_here_cache[cache_key] = result
    return result


_RAIN_FALLBACK = {"days": [], "total_7day_mm": 0.0, "total_14day_mm": 0.0, "assessment": "unknown"}
_TEMP_FALLBACK = {"days": [], "avg_max_7day": 0.0, "assessment": "unknown"}


async def _get_rain_data() -> dict:
    """Fetch (or return cached) 14-day rainfall data with both 7d and 14d totals."""
    global _rain_cache
    now = datetime.now(timezone.utc)

    if _rain_cache.get("fetched_at") and (now - _rain_cache["fetched_at"]) < timedelta(hours=1):
        return _rain_cache["data"]

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(OPEN_METEO_URL)
            resp.raise_for_status()
            raw = resp.json()
    except Exception:
        return _rain_cache.get("data", _RAIN_FALLBACK)

    daily  = raw.get("daily", {})
    times  = daily.get("time", [])
    precip = daily.get("precipitation_sum", [])

    days  = [{"date": t, "mm": round(p, 1) if p is not None else 0.0}
             for t, p in zip(times, precip)]
    total_14d = round(sum(d["mm"] for d in days), 1)
    total_7d  = round(sum(d["mm"] for d in days[-7:]), 1) if len(days) >= 7 else total_14d

    result = {
        "days": days,
        "total_7day_mm": total_7d,
        "total_14day_mm": total_14d,
        "assessment": _assessment(total_14d),
    }
    _rain_cache = {"fetched_at": now, "data": result}
    return result


async def _get_temp_data() -> dict:
    """Fetch (or return cached) 7-day temperature data. Returns fallback on error."""
    global _temp_cache
    now = datetime.now(timezone.utc)

    if _temp_cache.get("fetched_at") and (now - _temp_cache["fetched_at"]) < timedelta(hours=1):
        return _temp_cache["data"]

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(OPEN_METEO_TEMP_URL)
            resp.raise_for_status()
            raw = resp.json()
    except Exception:
        return _temp_cache.get("data", _TEMP_FALLBACK)

    daily   = raw.get("daily", {})
    times   = daily.get("time", [])
    t_max   = daily.get("temperature_2m_max", [])
    t_min   = daily.get("temperature_2m_min", [])

    days = [
        {"date": t, "min": round(mn, 1) if mn is not None else 0.0,
                    "max": round(mx, 1) if mx is not None else 0.0}
        for t, mn, mx in zip(times, t_min, t_max)
    ]
    avg_max = round(sum(d["max"] for d in days) / len(days), 1) if days else 0.0

    if avg_max >= 25:   assessment = "hot"
    elif avg_max >= 18: assessment = "warm"
    elif avg_max >= 12: assessment = "mild"
    elif avg_max >= 5:  assessment = "cool"
    else:               assessment = "cold"

    result = {"days": days, "avg_max_7day": avg_max, "assessment": assessment}
    _temp_cache = {"fetched_at": now, "data": result}
    return result


@router.get("/garden/rain-context")
async def get_rain_context():
    return await _get_rain_data()


@router.get("/garden/temperature-context")
async def get_temperature_context():
    return await _get_temp_data()


# ── Garden water log ─────────────────────────────────────────────────────────

class WaterLogCreate(BaseModel):
    watered_by: int | None = None
    watered_at: date | None = None  # defaults to today if omitted


async def get_last_garden_watered() -> date | None:
    """Return the most recent garden watering date, or None."""
    async with get_db() as db:
        rows = await db.execute_fetchall(
            "SELECT id, watered_at FROM garden_water_log ORDER BY watered_at DESC LIMIT 1"
        )
    if not rows:
        return None
    return date.fromisoformat(rows[0]["watered_at"])


@router.post("/garden/water-log")
async def log_garden_watering(body: WaterLogCreate, db = Depends(db_dep)):
    watered_at = (body.watered_at or date.today()).isoformat()
    await db.execute("DELETE FROM garden_water_log")
    await db.execute(
        "INSERT INTO garden_water_log (watered_at, watered_by) VALUES (?, ?)",
        (watered_at, body.watered_by),
    )

    # Mark all active water schedules as done
    from services.scheduling import calculate_next_due
    schedules = await db.execute_fetchall(
        """SELECT cs.id, cs.interval_days, cs.season_adjust
           FROM care_schedules cs
           JOIN plants p ON cs.plant_id = p.id
           WHERE cs.care_type = 'water' AND cs.is_active = 1 AND p.is_active = 1"""
    )
    today_str = date.today().isoformat()
    updated = 0
    for s in schedules:
        next_due = calculate_next_due(
            date.today(), s["interval_days"], s["season_adjust"]
        )
        await db.execute(
            "UPDATE care_schedules SET last_done = ?, next_due = ? WHERE id = ?",
            (today_str, str(next_due), s["id"]),
        )
        updated += 1

    await db.commit()
    return {"watered_at": watered_at, "schedules_updated": updated}


@router.get("/garden/water-log/latest")
async def latest_garden_watering():
    last = await get_last_garden_watered()
    return {"watered_at": last.isoformat() if last else None}


_WEEKLY_ET_BUDGET: dict[str, float] = {
    "winter":  5,
    "spring": 18,
    "summer": 25,
    "autumn": 10,
}


def _get_weekly_et_budget(season: str) -> float:
    return _WEEKLY_ET_BUDGET[season]


def _compute_water_status(rain_14d: float, rain_7d: float, days_since_watered: int | None) -> dict:
    """Compute garden water status from 14-day rainfall against a biweekly ET budget."""
    from services.scheduling import get_current_season
    season = get_current_season()
    weekly_budget = _get_weekly_et_budget(season)
    biweekly_budget = weekly_budget * 2
    covered = rain_14d / biweekly_budget if biweekly_budget else 1.0
    watered_recently = days_since_watered is not None and days_since_watered <= 3

    if covered >= 0.8 or (covered >= 0.5 and watered_recently):
        status = "hydrated"
    elif covered >= 0.4 or watered_recently:
        status = "thirsty"
    else:
        status = "dry"

    return {
        "status": status,
        "rain_7day_mm": round(rain_7d, 1),
        "rain_14day_mm": round(rain_14d, 1),
        "weekly_budget_mm": weekly_budget,
        "biweekly_budget_mm": biweekly_budget,
        "season": season,
    }


@router.get("/garden/water-status")
async def get_garden_water_status():
    """
    Returns a garden-wide water status driven by 7-day Amsterdam rainfall
    against a season-aware evapotranspiration budget.
    """
    rain         = await _get_rain_data()
    last_watered = await get_last_garden_watered()
    total_14d    = rain.get("total_14day_mm", 0)
    total_7d     = rain.get("total_7day_mm", 0)
    days_since   = (date.today() - last_watered).days if last_watered else None

    result = _compute_water_status(total_14d, total_7d, days_since)
    result["watered_at"] = last_watered.isoformat() if last_watered else None
    return result


@router.delete("/garden/water-log/latest")
async def delete_latest_garden_watering(db = Depends(db_dep)):
    rows = await db.execute_fetchall(
        "SELECT id FROM garden_water_log ORDER BY watered_at DESC LIMIT 1"
    )
    if rows:
        await db.execute("DELETE FROM garden_water_log WHERE id = ?", (rows[0]["id"],))
        await db.commit()
    return {"ok": True}


# ── Garden fertilize log ──────────────────────────────────────────────────────


async def get_last_garden_fertilized() -> date | None:
    """Return the most recent garden fertilize date, or None."""
    async with get_db() as db:
        rows = await db.execute_fetchall(
            "SELECT id, fertilized_at FROM garden_fertilize_log ORDER BY fertilized_at DESC LIMIT 1"
        )
    if not rows:
        return None
    return date.fromisoformat(rows[0]["fertilized_at"])


class FertilizeLogCreate(BaseModel):
    fertilized_by: int | None = None
    fertilized_at: date | None = None


@router.post("/garden/fertilize-log")
async def log_garden_fertilizing(body: FertilizeLogCreate, db = Depends(db_dep)):
    """Log a garden-wide fertilize and mark all active fertilize schedules as done."""
    fertilized_at = (body.fertilized_at or date.today()).isoformat()

    # Log the garden fertilize event
    await db.execute("DELETE FROM garden_fertilize_log")
    await db.execute(
        "INSERT INTO garden_fertilize_log (fertilized_at, fertilized_by) VALUES (?, ?)",
        (fertilized_at, body.fertilized_by),
    )

    # Mark all active fertilize schedules as done
    from services.scheduling import calculate_next_due
    schedules = await db.execute_fetchall(
        """SELECT cs.id, cs.interval_days, cs.season_adjust
           FROM care_schedules cs
           JOIN plants p ON cs.plant_id = p.id
           WHERE cs.care_type = 'fertilize' AND cs.is_active = 1 AND p.is_active = 1"""
    )
    today_str = date.today().isoformat()
    updated = 0
    for s in schedules:
        next_due = calculate_next_due(
            date.today(), s["interval_days"], s["season_adjust"]
        )
        await db.execute(
            "UPDATE care_schedules SET last_done = ?, next_due = ? WHERE id = ?",
            (today_str, str(next_due), s["id"]),
        )
        updated += 1

    await db.commit()
    return {"fertilized_at": fertilized_at, "schedules_updated": updated}


@router.get("/garden/fertilize-status")
async def get_garden_fertilize_status():
    """Return garden-wide fertilize status and count of pending schedules."""
    last = await get_last_garden_fertilized()
    async with get_db() as db:
        pending = await db.execute_fetchall(
            """SELECT COUNT(*) as cnt FROM care_schedules cs
               JOIN plants p ON cs.plant_id = p.id
               WHERE cs.care_type = 'fertilize' AND cs.is_active = 1
               AND p.is_active = 1 AND cs.next_due <= date('now')"""
        )
    return {
        "fertilized_at": last.isoformat() if last else None,
        "pending_count": pending[0]["cnt"] if pending else 0,
    }


@router.delete("/garden/fertilize-log/latest")
async def delete_latest_garden_fertilizing(db = Depends(db_dep)):
    rows = await db.execute_fetchall(
        "SELECT id FROM garden_fertilize_log ORDER BY fertilized_at DESC LIMIT 1"
    )
    if rows:
        await db.execute("DELETE FROM garden_fertilize_log WHERE id = ?", (rows[0]["id"],))
        await db.commit()
    return {"ok": True}
