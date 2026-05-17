"""HTTP endpoint exposing the unified warning pipeline."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from database import db_dep
from auth import get_current_account
from services.warnings import compute_plant_warnings

router = APIRouter(tags=["warnings"])


class CareWarningOut(BaseModel):
    care_type: str
    severity: str
    trigger: str
    days_overdue: int | None
    message_nl: str
    message_en: str
    icon: str
    color: str


class CareTypeStatusOut(BaseModel):
    care_type: str
    status: str
    days_until_due: int | None
    last_done: date | None


class PlantWarningStateOut(BaseModel):
    plant_id: int
    environment: str
    active_care_types: list[str]
    warnings: list[CareWarningOut]
    top_warning: CareWarningOut | None
    care_summary: dict[str, CareTypeStatusOut]


async def _fetch_weather_safely() -> dict | None:
    """Fetch cached temperature data, returning a weather dict shaped for
    `compute_plant_warnings`. Degrades to None on any error so the endpoint
    keeps working when the weather cache is unavailable (e.g. tests, offline).
    """
    try:
        # Imported lazily so test environments without httpx network access
        # don't pay the import cost if the call isn't reached.
        from routers.plant_care import _get_temp_data
        temp_data = await _get_temp_data()
        if not temp_data:
            return None
        return {"temp": temp_data}
    except Exception:
        return None


@router.get("/plants/{plant_id}/warnings", response_model=PlantWarningStateOut)
async def get_plant_warnings(
    plant_id: int,
    today: date | None = Query(None),
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    today = today or date.today()

    plant_rows = await db.execute_fetchall(
        """SELECT p.id, p.map_id, p.container_id, p.ground_zone_id, p.care_thresholds,
                  m.map_type
           FROM plants p
           LEFT JOIN maps m ON p.map_id = m.id
           WHERE p.id = ? AND p.household_id = ? AND p.is_active = 1""",
        (plant_id, account["household_id"]),
    )
    if not plant_rows:
        raise HTTPException(status_code=404, detail="Plant not found")
    plant = dict(plant_rows[0])

    schedules_rows = await db.execute_fetchall(
        """SELECT care_type, next_due, last_done
           FROM care_schedules
           WHERE plant_id = ? AND is_active = 1""",
        (plant_id,),
    )
    schedules = [dict(r) for r in schedules_rows]

    weather = await _fetch_weather_safely()

    state = compute_plant_warnings(plant, schedules, weather=weather, today=today)

    return PlantWarningStateOut(
        plant_id=state.plant_id,
        environment=state.environment,
        active_care_types=state.active_care_types,
        warnings=[CareWarningOut(**w.__dict__) for w in state.warnings],
        top_warning=CareWarningOut(**state.top_warning.__dict__) if state.top_warning else None,
        care_summary={k: CareTypeStatusOut(**v.__dict__) for k, v in state.care_summary.items()},
    )
