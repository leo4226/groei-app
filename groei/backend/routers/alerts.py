import json
from datetime import date, datetime

from fastapi import APIRouter, HTTPException, Depends

from database import db_dep
from routers.plant_care import _get_rain_data, _get_temp_data, get_last_garden_watered

router = APIRouter(tags=["alerts"])

_SEVERITY_ORDER = {"urgent": 2, "warning": 1, "info": 0}
_MANUAL_WATER_DAYS = 3  # days a manual garden watering counts as coverage


def _fmt_date_nl(d: date) -> str:
    MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]
    return f"{d.day} {MONTHS[d.month - 1]}"


def _compute_alerts(thresholds: dict, rain: dict, temp: dict, last_watered: date | None = None) -> list[dict]:
    alerts = []
    total_mm = rain["total_7day_mm"]
    temp_days = temp["days"]
    current_month = datetime.now().month

    drought_thresh = thresholds.get("drought_mm_per_week", 0)
    waterlog_thresh = thresholds.get("waterlog_mm_per_week", 9999)
    min_temp = thresholds.get("min_temp_c")
    max_temp = thresholds.get("max_temp_c")
    bring_inside = thresholds.get("bring_inside_below_c")
    fertilise_months = thresholds.get("fertilise_months") or []
    fertilise_tip = thresholds.get("fertilise_tip", "")

    # Drought
    if drought_thresh and total_mm < drought_thresh:
        recently_watered = (
            last_watered is not None
            and (date.today() - last_watered).days < _MANUAL_WATER_DAYS
        )
        if recently_watered:
            alerts.append({
                "type": "drought",
                "severity": "info",
                "message_nl": f"Weinig regen ({total_mm}mm), maar je hebt op {_fmt_date_nl(last_watered)} water gegeven — voorlopig in orde.",
                "icon": "💧",
            })
        elif total_mm < drought_thresh * 0.5:
            alerts.append({
                "type": "drought",
                "severity": "urgent",
                "message_nl": f"Zeer weinig regen deze week ({total_mm}mm). Geef direct extra water.",
                "icon": "💧",
            })
        else:
            alerts.append({
                "type": "drought",
                "severity": "warning",
                "message_nl": f"Weinig neerslag deze week ({total_mm}mm). Overweeg extra water te geven.",
                "icon": "💧",
            })

    # Waterlogging
    if waterlog_thresh and total_mm > waterlog_thresh:
        if total_mm > waterlog_thresh * 2:
            alerts.append({
                "type": "waterlog",
                "severity": "urgent",
                "message_nl": f"Extreem veel regen ({total_mm}mm). Controleer drainage om wortels te beschermen.",
                "icon": "🌧️",
            })
        else:
            alerts.append({
                "type": "waterlog",
                "severity": "warning",
                "message_nl": f"Veel neerslag deze week ({total_mm}mm). Let op wateroverlast.",
                "icon": "🌧️",
            })

    # Cold stress (use weekly min)
    if min_temp is not None and temp_days:
        week_min = min(d["min"] for d in temp_days)
        if week_min < min_temp:
            alerts.append({
                "type": "cold",
                "severity": "urgent",
                "message_nl": f"Temperatuur daalde tot {week_min}°C, onder de stressgrens van {min_temp}°C.",
                "icon": "🥶",
            })
        elif week_min < min_temp + 3:
            alerts.append({
                "type": "cold",
                "severity": "warning",
                "message_nl": f"Minimum temperatuur ({week_min}°C) nadert de stressgrens ({min_temp}°C).",
                "icon": "🥶",
            })

    # Heat stress (use weekly max)
    if max_temp is not None and temp_days:
        week_max = max(d["max"] for d in temp_days)
        if week_max > max_temp:
            alerts.append({
                "type": "heat",
                "severity": "urgent",
                "message_nl": f"Temperatuur bereikte {week_max}°C, boven de stressgrens van {max_temp}°C.",
                "icon": "🌡️",
            })
        elif week_max > max_temp - 3:
            alerts.append({
                "type": "heat",
                "severity": "warning",
                "message_nl": f"Maximum temperatuur ({week_max}°C) nadert de stressgrens ({max_temp}°C).",
                "icon": "🌡️",
            })

    # Bring inside
    if bring_inside is not None and temp_days:
        week_min = min(d["min"] for d in temp_days)
        if week_min < bring_inside:
            alerts.append({
                "type": "bring_inside",
                "severity": "urgent",
                "message_nl": f"Temperatuur daalde tot {week_min}°C. Zet deze plant naar binnen (grens: {bring_inside}°C).",
                "icon": "🏠",
            })

    # Fertilise
    if current_month in fertilise_months:
        tip = fertilise_tip or "Nu is het een goed moment om te bemesten."
        alerts.append({
            "type": "fertilise",
            "severity": "info",
            "message_nl": tip,
            "icon": "🌿",
        })

    return alerts


@router.get("/plants/{plant_id}/alerts")
async def get_plant_alerts(plant_id: int, db = Depends(db_dep)):
    rows = await db.execute_fetchall(
        "SELECT care_thresholds FROM plants WHERE id = ? AND is_active = 1",
        (plant_id,),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Plant not found")

    raw = rows[0]["care_thresholds"]
    if not raw:
        return []

    thresholds = json.loads(raw)
    rain, temp, last_watered = await _get_rain_data(), await _get_temp_data(), await get_last_garden_watered()

    return _compute_alerts(thresholds, rain, temp, last_watered)


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
            a for a in _compute_alerts(thresholds, rain, temp, last_watered)
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
