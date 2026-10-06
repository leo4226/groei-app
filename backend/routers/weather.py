"""Validated weather proxy backed by the shared map-local forecast service."""
from fastapi import APIRouter, Depends, Query

from auth import get_current_account
from services.weather_forecast import get_map_forecast

router = APIRouter(tags=["weather"])

@router.get("/weather")
async def get_weather(
    lat: float = Query(default=52.3715, ge=-90, le=90),
    lon: float = Query(default=4.8499, ge=-180, le=180),
    account=Depends(get_current_account),
):
    # Signed-in only: any coordinate is a fresh Open-Meteo call, so an open
    # proxy let anyone spend the free tier's daily quota for every garden.
    return await get_map_forecast(lat, lon)
