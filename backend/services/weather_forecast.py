"""Coordinate-keyed Open-Meteo forecast service.

Provides the existing current/daily response shape plus normalized days used by
Water pressure. Fresh data is cached for one hour per rounded map coordinate;
an expired entry remains available as an explicitly stale fallback.
"""
from __future__ import annotations

import logging
logger = logging.getLogger(__name__)
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import httpx

OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast"
CACHE_TTL = timedelta(hours=1)

_DAILY_FIELDS = (
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,"
    "et0_fao_evapotranspiration,wind_speed_10m_max,sunrise,sunset,cloud_cover_mean,"
    "relative_humidity_2m_max,soil_moisture_0_to_7cm_mean"
)
_EMPTY_DAILY = {
    "time": [],
    "weather_code": [],
    "temperature_2m_max": [],
    "temperature_2m_min": [],
    "precipitation_sum": [],
    "et0_fao_evapotranspiration": [],
    "wind_speed_10m_max": [],
    "sunrise": [],
    "sunset": [],
    "cloud_cover_mean": [],
    "relative_humidity_2m_max": [],
    "soil_moisture_0_to_7cm_mean": [],
}
_cache: dict[str, dict[str, Any]] = {}


def forecast_cache_key(lat: float, lon: float) -> str:
    """Group negligible GPS jitter without mixing distinct garden locations."""
    return f"{lat:.4f}:{lon:.4f}"


def clear_forecast_cache() -> None:
    _cache.clear()


def _value(values: list, index: int, default: float = 0.0) -> float:
    if index >= len(values) or values[index] is None:
        return default
    return float(values[index])


def _optional_value(values: list, index: int) -> float | None:
    """Like ``_value`` but keeps missing readings as None (neutral downstream)."""
    if index >= len(values) or values[index] is None:
        return None
    return float(values[index])


def _normalize(
    raw: dict,
    *,
    lat: float,
    lon: float,
    fetched_at: datetime,
) -> dict:
    daily = raw.get("daily") or {}
    times = daily.get("time") or []
    maximums = daily.get("temperature_2m_max") or []
    minimums = daily.get("temperature_2m_min") or []
    precipitation = daily.get("precipitation_sum") or []
    et0 = daily.get("et0_fao_evapotranspiration") or []
    cloud_cover = daily.get("cloud_cover_mean") or []
    humidity = daily.get("relative_humidity_2m_max") or []
    soil_moisture = daily.get("soil_moisture_0_to_7cm_mean") or []
    days = [
        {
            "date": day,
            "max_temp_c": _value(maximums, index),
            "min_temp_c": _value(minimums, index),
            "precipitation_mm": _value(precipitation, index),
            "et0_mm": _value(et0, index),
            "cloud_cover_mean_pct": _value(cloud_cover, index),
            "humidity_pct": _optional_value(humidity, index),
            "soil_moisture_pct": _optional_value(soil_moisture, index),
        }
        for index, day in enumerate(times)
    ]
    local_timestamp = fetched_at
    if local_timestamp.tzinfo is None:
        local_timestamp = local_timestamp.replace(tzinfo=timezone.utc)
    today_iso = local_timestamp.astimezone(ZoneInfo("Europe/Amsterdam")).date().isoformat()
    forecast_start = next(
        (index for index, day in enumerate(times) if day >= today_iso),
        len(times),
    )
    public_daily = {
        key: value[forecast_start:] if isinstance(value, list) else value
        for key, value in daily.items()
    }
    return {
        "available": bool(days),
        "stale": False,
        "source_timestamp": fetched_at.isoformat(),
        "location": {"lat": round(lat, 4), "lon": round(lon, 4)},
        "current": raw.get("current"),
        # Existing map-weather clients rely on index 0 being today. Historical
        # rows remain available in normalized ``days`` for Water pressure.
        "daily": public_daily,
        "days": days,
    }


def _unavailable(lat: float, lon: float) -> dict:
    return {
        "available": False,
        "stale": False,
        "source_timestamp": None,
        "location": {"lat": round(lat, 4), "lon": round(lon, 4)},
        "current": None,
        "daily": {key: list(value) for key, value in _EMPTY_DAILY.items()},
        "days": [],
    }


async def get_map_forecast(
    lat: float,
    lon: float,
    *,
    now: datetime | None = None,
) -> dict:
    """Return history + forecast for one map, with fail-soft stale caching."""
    observed_at = now or datetime.now(timezone.utc)
    key = forecast_cache_key(lat, lon)
    entry = _cache.get(key)
    if entry and observed_at - entry["fetched_at"] < CACHE_TTL:
        return entry["data"]

    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,weather_code",
        "daily": _DAILY_FIELDS,
        "timezone": "Europe/Amsterdam",
        "past_days": 7,
        "forecast_days": 7,
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(OPEN_METEO_BASE, params=params)
            response.raise_for_status()
            data = _normalize(
                response.json(),
                lat=lat,
                lon=lon,
                fetched_at=observed_at,
            )
    except Exception:
        logger.warning("Weather forecast fetch failed for %.2f,%.2f", lat, lon)
        if entry:
            return {**entry["data"], "stale": True}
        return _unavailable(lat, lon)

    _cache[key] = {"fetched_at": observed_at, "data": data}
    return data
