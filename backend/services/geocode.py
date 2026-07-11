"""Reverse geocoding for field-journal discoveries via Nominatim (OSM).

Usage policy: absolute maximum 1 request/second and a descriptive
User-Agent — callers that loop must sleep between calls. Every failure
degrades to None so the journal falls back to raw coordinates.
"""
import logging

import httpx

logger = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
USER_AGENT = "floreren.app field journal (https://floreren.app)"


async def reverse_geocode(lat: float, lon: float) -> tuple[str, str | None] | None:
    """Resolve (lat, lon) to a city/town-level place name and ISO country code."""
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(
                NOMINATIM_URL,
                params={
                    "lat": lat,
                    "lon": lon,
                    "format": "jsonv2",
                    "zoom": 10,  # city / district level
                    "accept-language": "nl",
                },
                headers={"User-Agent": USER_AGENT},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("Reverse geocode failed for %.4f,%.4f: %s", lat, lon, exc)
        return None

    addr = data.get("address") or {}
    place = (
        addr.get("city")
        or addr.get("town")
        or addr.get("village")
        or addr.get("municipality")
        or addr.get("county")
        or addr.get("state")
        or data.get("name")
    )
    if not place:
        return None
    country = (addr.get("country_code") or "").upper() or None
    return str(place), country
