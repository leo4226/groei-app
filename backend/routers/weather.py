"""Weather proxy — wraps Open-Meteo API with caching + fallback.

Frontend calls GET /api/weather?lat=52.37&lon=4.85 instead of hitting
api.open-meteo.com directly. The backend caches for 1 hour and degrades
gracefully when Open-Meteo is down (instead of showing forever-loading).

Shares the same 1-hour TTL as services/environment.py but fetches the
full current+daily forecast (not just temperature).
"""
import httpx
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Query

router = APIRouter(tags=["weather"])

OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast"

_CACHE_TTL = timedelta(hours=1)
_cache: dict[str, object] = {}  # {fetched_at: datetime, data: dict}

_FALLBACK = {
    "current": None,
    "daily": {
        "time": [],
        "weather_code": [],
        "temperature_2m_max": [],
        "temperature_2m_min": [],
        "precipitation_sum": [],
        "wind_speed_10m_max": [],
        "sunrise": [],
        "sunset": [],
    },
    "error": "Open-Meteo tijdelijk niet beschikbaar",
}


@router.get("/weather")
async def get_weather(
    lat: float = Query(default=52.3715),
    lon: float = Query(default=4.8499),
):
    global _cache
    now = datetime.now(timezone.utc)

    # Use cached if fresh — cache keyed by "default" since lat/lon
    # are always Amsterdam (Leon's garden). Future: cache per lat/lon
    # if we support multiple locations.
    if _cache.get("fetched_at") and (now - _cache["fetched_at"]) < _CACHE_TTL:
        return _cache["data"]

    params = (
        f"?latitude={lat}&longitude={lon}"
        "&current=temperature_2m,relative_humidity_2m,weather_code"
        "&daily=weather_code,temperature_2m_max,temperature_2m_min,"
        "precipitation_sum,wind_speed_10m_max,sunrise,sunset"
        "&timezone=Europe%2FAmsterdam"
        "&forecast_days=7"
    )

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(OPEN_METEO_BASE + params)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        # Return stale cache or graceful fallback
        return _cache.get("data", _FALLBACK)

    result = {"current": data.get("current"), "daily": data.get("daily")}
    _cache = {"fetched_at": now, "data": result}
    return result
