"""Backward-compatible alert endpoints backed by the unified warning pipeline.

The old alert service independently generated weather/fertilizer messages from
legacy care_thresholds. That drifted from the canonical care-schedule warning
pipeline and produced contradictory plant-detail advice. Keep these routes for
old clients, but derive their payload from `compute_plant_warnings()`.
"""

from datetime import date

from fastapi import APIRouter, HTTPException, Depends

from database import db_dep
from auth import get_current_account
from services.environment import get_rain_data, get_temp_data
from services.garden_log import get_last_garden_watered
from services.warnings import compute_plant_warnings
from services.local_time import local_today

router = APIRouter(tags=["alerts"])

_SEVERITY_ORDER = {"urgent": 2, "warning": 1, "info": 0}


def _warning_to_legacy_alert(warning):
    return {
        "type": warning.care_type,
        "severity": warning.severity,
        "message_nl": warning.message_nl,
        "message_en": warning.message_en,
        "icon": warning.icon,
    }


async def _warning_weather(db, household_id: int) -> dict:
    temp_data = await get_temp_data(db)
    rain_data = await get_rain_data(db)
    last_watered = await get_last_garden_watered(household_id)
    return {"temp": temp_data, "rain": rain_data, "last_watered": last_watered}


async def _plant_warning_state(db, plant_id: int, household_id: int, today: date, weather: dict | None = None):
    rows = await db.execute_fetchall(
        """SELECT p.id, p.map_id, p.container_id, p.ground_zone_id,
                  p.care_thresholds, p.care_profile, m.map_type
           FROM plants p
           LEFT JOIN maps m ON p.map_id = m.id
           WHERE p.id = ? AND p.household_id = ? AND p.is_active = 1""",
        (plant_id, household_id),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Plant not found")

    schedule_rows = await db.execute_fetchall(
        """SELECT care_type, next_due, last_done
           FROM care_schedules
           WHERE plant_id = ? AND is_active = 1""",
        (plant_id,),
    )
    return compute_plant_warnings(
        dict(rows[0]),
        [dict(r) for r in schedule_rows],
        weather=weather if weather is not None else await _warning_weather(db, household_id),
        today=today,
    )


@router.get("/plants/{plant_id}/alerts")
async def get_plant_alerts(plant_id: int, db=Depends(db_dep), account=Depends(get_current_account)):
    state = await _plant_warning_state(db, plant_id, account["household_id"], local_today())
    return [_warning_to_legacy_alert(w) for w in state.warnings]


@router.get("/alerts/summary")
async def get_alerts_summary(db=Depends(db_dep), account=Depends(get_current_account)):
    rows = await db.execute_fetchall(
        "SELECT id FROM plants WHERE is_active = 1 AND household_id = ?",
        (account["household_id"],),
    )

    if not rows:
        return {"total_count": 0, "worst_severity": None, "plant_ids_with_alerts": []}

    household_id = account["household_id"]
    today = local_today()
    weather = await _warning_weather(db, household_id)
    total_count = 0
    worst_level = -1
    plant_ids_with_alerts = []

    for row in rows:
        state = await _plant_warning_state(db, row["id"], household_id, today, weather)
        warnings = [w for w in state.warnings if w.severity in ("warning", "urgent")]
        if not warnings:
            continue
        total_count += len(warnings)
        plant_ids_with_alerts.append(row["id"])
        for warning in warnings:
            worst_level = max(worst_level, _SEVERITY_ORDER.get(warning.severity, 0))

    worst_severity = None
    if worst_level == 2:
        worst_severity = "urgent"
    elif worst_level == 1:
        worst_severity = "warning"

    return {
        "total_count": total_count,
        "worst_severity": worst_severity,
        "plant_ids_with_alerts": plant_ids_with_alerts,
    }
