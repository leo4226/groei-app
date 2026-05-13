import json
from datetime import date, datetime

from fastapi import APIRouter, HTTPException, Depends

from database import db_dep
from routers.plant_care import _get_rain_data, _get_temp_data, get_last_garden_watered
from services.alert_service import compute_alerts, _SEVERITY_ORDER

router = APIRouter(tags=["alerts"])


@router.get("/plants/{plant_id}/alerts")
async def get_plant_alerts(plant_id: int, db = Depends(db_dep)):
    rows = await db.execute_fetchall(
        """SELECT p.care_thresholds, p.container_id, m.map_type
           FROM plants p
           LEFT JOIN maps m ON p.map_id = m.id
           WHERE p.id = ? AND p.is_active = 1""",
        (plant_id,),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Plant not found")

    raw = rows[0]["care_thresholds"]
    if not raw:
        return []

    thresholds = json.loads(raw)
    rain, temp, last_watered = await _get_rain_data(), await _get_temp_data(), await get_last_garden_watered()
    map_type = rows[0]["map_type"] or "outdoor"
    in_ground = map_type == "outdoor" and rows[0]["container_id"] is None

    return compute_alerts(thresholds, rain, temp, last_watered, map_type=map_type, in_ground=in_ground)


@router.get("/alerts/summary")
async def get_alerts_summary(db = Depends(db_dep)):
    rows = await db.execute_fetchall(
        "SELECT id, care_thresholds FROM plants WHERE care_thresholds IS NOT NULL AND is_active = 1"
    )

    if not rows:
        return {"total_count": 0, "worst_severity": None, "plant_ids_with_alerts": []}

    rain, temp, last_watered = await _get_rain_data(), await _get_temp_data(), await get_last_garden_watered()

    total_count = 0
    worst_level = -1
    plant_ids_with_alerts = []

    for row in rows:
        try:
            thresholds = json.loads(row["care_thresholds"])
        except (json.JSONDecodeError, TypeError):
            continue

        plant_alerts = [
            a for a in compute_alerts(thresholds, rain, temp, last_watered)
            if a["severity"] in ("warning", "urgent")
        ]
        if plant_alerts:
            total_count += len(plant_alerts)
            plant_ids_with_alerts.append(row["id"])
            for alert in plant_alerts:
                level = _SEVERITY_ORDER.get(alert["severity"], 0)
                if level > worst_level:
                    worst_level = level

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
