"""Environment service — weather data for Leon's garden in Amsterdam.

Public API:
    get_rain_data(db) -> dict   (14-day rainfall with 7-day and 14-day totals)
    get_temp_data(db) -> dict   (7-day temperature data)

Both are async, cached in DB (1-hour TTL) + in-memory hot cache, and fall back
to a stable empty shape on network errors so callers never need to handle exceptions.

They never make a page wait for Open-Meteo once a value is known: data older
than REFRESH_AHEAD is served while one background request refreshes it, and
data past its TTL is served as-is (rain and temperature an hour or two old are
still right for care advice) while it refreshes. Only a cold process with no
cache anywhere waits, and then for at most FETCH_TIMEOUT_S. A failed fetch is
not retried for FAILURE_BACKOFF: it used to be retried, with a 10-second
timeout, by every request while Open-Meteo was down.
"""
import asyncio
import json
from datetime import datetime, timedelta, timezone
import logging
logger = logging.getLogger(__name__)

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
    "&past_days=0&forecast_days=7"
    "&timezone=Europe%2FAmsterdam"
)

CACHE_TTL = timedelta(hours=1)
REFRESH_AHEAD = timedelta(minutes=50)
FAILURE_BACKOFF = timedelta(minutes=2)
FETCH_TIMEOUT_S = 5

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


def _parse_rain(raw: dict) -> dict:
    daily  = raw.get("daily", {})
    times  = daily.get("time", [])
    precip = daily.get("precipitation_sum", [])

    days = [{"date": t, "mm": round(p, 1) if p is not None else 0.0}
            for t, p in zip(times, precip)]
    total_14d = round(sum(d["mm"] for d in days), 1)
    total_7d  = round(sum(d["mm"] for d in days[-7:]), 1) if len(days) >= 7 else total_14d

    return {
        "days": days,
        "total_7day_mm": total_7d,
        "total_14day_mm": total_14d,
        "assessment": _rain_assessment(total_14d),
    }


def _parse_temp(raw: dict) -> dict:
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
    return {"days": days, "avg_max_7day": avg_max, "assessment": _temp_assessment(avg_max)}


# kind -> (url, parser, hot cache, db cache key, fallback)
_SOURCES = {
    "rain": (OPEN_METEO_URL, _parse_rain, _rain_cache, RAIN_CACHE_KEY, _RAIN_FALLBACK),
    "temp": (OPEN_METEO_TEMP_URL, _parse_temp, _temp_cache, TEMP_CACHE_KEY, _TEMP_FALLBACK),
}
_inflight: dict[str, asyncio.Task] = {}
_last_failure: dict[str, datetime] = {}
# Background refreshes are held here so they are not garbage-collected mid-flight.
_background: set[asyncio.Task] = set()


async def _fetch_and_store(kind: str) -> dict | None:
    url, parse, hot, _key, _fallback = _SOURCES[kind]
    try:
        async with httpx.AsyncClient(timeout=FETCH_TIMEOUT_S) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            result = parse(resp.json())
    except Exception:
        logger.warning("Open-Meteo %s fetch failed, returning cached/fallback", kind)
        _last_failure[kind] = datetime.now(timezone.utc)
        return None
    hot["fetched_at"] = datetime.now(timezone.utc)
    hot["data"] = result
    _last_failure.pop(kind, None)
    return result


def _fetch_once(kind: str) -> asyncio.Task | None:
    """The one in-flight fetch for `kind`, started if needed. None while a
    recent failure is backing off."""
    task = _inflight.get(kind)
    if task is not None and not task.done():
        return task
    failed_at = _last_failure.get(kind)
    if failed_at is not None and datetime.now(timezone.utc) - failed_at < FAILURE_BACKOFF:
        return None
    task = asyncio.get_running_loop().create_task(_fetch_and_store(kind))
    _inflight[kind] = task
    _background.add(task)
    task.add_done_callback(_background.discard)
    return task


async def _get(kind: str, db) -> dict:
    _url, _parse, hot, cache_key, fallback = _SOURCES[kind]
    now = datetime.now(timezone.utc)

    # Layer 1: in-memory. Anything known is served at once; old data also
    # starts one background refresh.
    if hot.get("fetched_at"):
        if now - hot["fetched_at"] >= REFRESH_AHEAD:
            _fetch_once(kind)
        return hot["data"]

    # Layer 2: DB cache (if db available)
    if db is not None:
        db_cached = await _read_db_cache(db, cache_key)
        if db_cached is not None:
            hot["fetched_at"] = now
            hot["data"] = db_cached
            return db_cached

    # Layer 3: nothing known yet, so this request waits for Open-Meteo.
    task = _fetch_once(kind)
    if task is None:
        return fallback
    result = await asyncio.shield(task)
    if result is None:
        return fallback
    if db is not None:
        await _write_db_cache(db, cache_key, result)
    return result


async def get_rain_data(db=None) -> dict:
    """14-day rainfall with both 7d and 14d totals.

    Caching layers (checked in order):
      1. In-memory (served at once; refreshed in the background when old)
      2. DB (weather_cache table, survives restarts, 1-hour TTL)
      3. Open-Meteo API → stored in both caches
    """
    return await _get("rain", db)


async def get_temp_data(db=None) -> dict:
    """7-day temperature data. Same caching as get_rain_data."""
    return await _get("temp", db)


def clear_environment_cache() -> None:
    """Forget every cached reading and failure (tests)."""
    for _url, _parse, hot, _key, _fallback in _SOURCES.values():
        hot.clear()
    _inflight.clear()
    _last_failure.clear()
