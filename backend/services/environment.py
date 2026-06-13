"""Environment service — weather data for Leon's garden in Amsterdam.

Public API:
    get_rain_data(db) -> dict   (14-day rainfall with 7-day and 14-day totals)
    get_temp_data(db) -> dict   (7-day temperature data)

Both are async, cached in DB (1-hour TTL) + in-memory hot cache, and fall back
to a stable empty shape on network errors so callers never need to handle exceptions.
"""
import json
from datetime import datetime, timedelta, timezone

import httpx

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

CACHE_TTL = timedelta(hours=1)

_RAIN_FALLBACK = {"days": [], "total_7day_mm": 0.0, "total_14day_mm": 0.0, "assessment": "unknown"}
_TEMP_FALLBACK = {"days": [], "avg_max_7day": 0.0, "assessment": "unknown"}

# In-memory hot cache (layer 1, checked before DB)
_rain_cache: dict = {}
_temp_cache: dict = {}

RAIN_CACHE_KEY = "rain_7day"
TEMP_CACHE_KEY = "temp_7day"


async def _read_db_cache(db, cache_key: str) -> dict | None:
    """Read from DB weather_cache. Returns parsed dict or None if stale/missing."""
    rows = await db.execute_fetchall(
        "SELECT data_json, fetched_at FROM weather_cache WHERE cache_key = ?",
        (cache_key,),
    )
    if not rows:
        return None
    row = rows[0]
    fetched_at = row["fetched_at"]
    if isinstance(fetched_at, str):
        fetched_at = datetime.fromisoformat(fetched_at)
    now = datetime.now(timezone.utc)
    # Make naive for comparison if needed
    if fetched_at.tzinfo is not None:
        fetched_at = fetched_at.replace(tzinfo=None)
    if now.replace(tzinfo=None) - fetched_at > CACHE_TTL:
        return None  # stale
    try:
        return json.loads(row["data_json"])
    except (json.JSONDecodeError, TypeError):
        return None


async def _write_db_cache(db, cache_key: str, data: dict) -> None:
    """Persist weather data to DB cache.

    Use execute_fetchall + RETURNING to avoid DbAdapter.execute() appending
    ``RETURNING id``. The weather_cache table is keyed by cache_key and has no
    numeric id column.
    """
    await db.execute_fetchall(
        "INSERT INTO weather_cache (cache_key, data_json, fetched_at) VALUES (?, ?, CURRENT_TIMESTAMP) "
        "ON CONFLICT (cache_key) DO UPDATE SET data_json = EXCLUDED.data_json, fetched_at = CURRENT_TIMESTAMP "
        "RETURNING cache_key",
        (cache_key, json.dumps(data)),
    )
    await db.commit()


def _rain_assessment(total_mm: float) -> str:
    """Categorise 14-day rainfall total for Dutch growing conditions."""
    if total_mm >= 30:
        return "well_watered"
    if total_mm >= 16:
        return "moderate"
    if total_mm >= 5:
        return "dry"
    return "very_dry"


def _temp_assessment(avg_max: float) -> str:
    if avg_max >= 25: return "hot"
    if avg_max >= 18: return "warm"
    if avg_max >= 12: return "mild"
    if avg_max >= 5:  return "cool"
    return "cold"


async def get_rain_data(db=None) -> dict:
    """Fetch (or return cached) 14-day rainfall data with both 7d and 14d totals.

    Caching layers (checked in order):
      1. In-memory (hot cache, 1-hour TTL)
      2. DB (weather_cache table, survives restarts, 1-hour TTL)
      3. Open-Meteo API → stored in both caches
    """
    global _rain_cache
    now = datetime.now(timezone.utc)

    # Layer 1: in-memory hot cache
    if _rain_cache.get("fetched_at") and (now - _rain_cache["fetched_at"]) < CACHE_TTL:
        return _rain_cache["data"]

    # Layer 2: DB cache (if db available)
    if db is not None:
        db_cached = await _read_db_cache(db, RAIN_CACHE_KEY)
        if db_cached is not None:
            _rain_cache = {"fetched_at": now, "data": db_cached}
            return db_cached

    # Layer 3: fetch from Open-Meteo
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

    days = [{"date": t, "mm": round(p, 1) if p is not None else 0.0}
            for t, p in zip(times, precip)]
    total_14d = round(sum(d["mm"] for d in days), 1)
    total_7d  = round(sum(d["mm"] for d in days[-7:]), 1) if len(days) >= 7 else total_14d

    result = {
        "days": days,
        "total_7day_mm": total_7d,
        "total_14day_mm": total_14d,
        "assessment": _rain_assessment(total_14d),
    }
    _rain_cache = {"fetched_at": now, "data": result}

    # Persist to DB
    if db is not None:
        await _write_db_cache(db, RAIN_CACHE_KEY, result)

    return result


async def get_temp_data(db=None) -> dict:
    """Fetch (or return cached) 7-day temperature data.

    Caching layers (checked in order):
      1. In-memory (hot cache, 1-hour TTL)
      2. DB (weather_cache table, survives restarts, 1-hour TTL)
      3. Open-Meteo API → stored in both caches
    """
    global _temp_cache
    now = datetime.now(timezone.utc)

    # Layer 1: in-memory hot cache
    if _temp_cache.get("fetched_at") and (now - _temp_cache["fetched_at"]) < CACHE_TTL:
        return _temp_cache["data"]

    # Layer 2: DB cache (if db available)
    if db is not None:
        db_cached = await _read_db_cache(db, TEMP_CACHE_KEY)
        if db_cached is not None:
            _temp_cache = {"fetched_at": now, "data": db_cached}
            return db_cached

    # Layer 3: fetch from Open-Meteo
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(OPEN_METEO_TEMP_URL)
            resp.raise_for_status()
            raw = resp.json()
    except Exception:
        return _temp_cache.get("data", _TEMP_FALLBACK)

    daily = raw.get("daily", {})
    times = daily.get("time", [])
    t_max = daily.get("temperature_2m_max", [])
    t_min = daily.get("temperature_2m_min", [])

    days = [
        {"date": t,
         "min": round(mn, 1) if mn is not None else 0.0,
         "max": round(mx, 1) if mx is not None else 0.0}
        for t, mn, mx in zip(times, t_min, t_max)
    ]
    avg_max = round(sum(d["max"] for d in days) / len(days), 1) if days else 0.0

    result = {"days": days, "avg_max_7day": avg_max, "assessment": _temp_assessment(avg_max)}
    _temp_cache = {"fetched_at": now, "data": result}

    # Persist to DB
    if db is not None:
        await _write_db_cache(db, TEMP_CACHE_KEY, result)

    return result
