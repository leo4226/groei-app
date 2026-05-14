import json
from datetime import date

from models import MostUrgent
from services.alert_service import compute_top_alert, compute_all_alerts


def _compute_care_status(schedules, today):
    """Derive care_status and most_urgent from schedule rows."""
    care_status = "good"
    most_urgent = None
    for s in schedules:
        s = dict(s)
        next_due = s["next_due"]
        if next_due < today:
            care_status = "overdue"
            days = (date.fromisoformat(today) - date.fromisoformat(next_due)).days
            most_urgent = MostUrgent(
                care_type=s["care_type"],
                days_overdue=days,
                last_done_by=s.get("last_done_by_name"),
            )
            break
        elif next_due == today:
            if care_status != "overdue":
                care_status = "due_today"
                most_urgent = MostUrgent(
                    care_type=s["care_type"],
                    days_overdue=0,
                    last_done_by=s.get("last_done_by_name"),
                )
    return care_status, most_urgent


def _compute_temp_status(care_thresholds_json, temp_data, in_ground=False):
    """Derive temperature status from care thresholds + current week's weather."""
    if not care_thresholds_json:
        return "comfortable"
    try:
        thresholds = json.loads(care_thresholds_json)
    except (json.JSONDecodeError, TypeError):
        return "comfortable"

    days = temp_data.get("days") or []
    if not days:
        return "comfortable"

    week_min = min(d["min"] for d in days)
    week_max = max(d["max"] for d in days)
    min_temp = thresholds.get("min_temp_c")
    max_temp = thresholds.get("max_temp_c")

    # In-ground plants can't be moved/protected — skip cold/heat status
    if not in_ground:
        if min_temp is not None:
            if week_min <= min_temp:
                return "freezing"
            if week_min <= min_temp + 3:
                return "chilling"

        if max_temp is not None and week_max >= max_temp:
            return "heatstress"

    return "comfortable"


async def enrich_plant(db, plant_row, today, temp_data=None):
    """Enrich a single plant dict with care_status, most_urgent, temp_status, phenology, and care_schedules."""
    plant = dict(plant_row)

    schedules = await db.execute_fetchall(
        """SELECT cs.care_type, cs.next_due, u.name as last_done_by_name
           FROM care_schedules cs
           LEFT JOIN users u ON cs.last_done_by = u.id
           WHERE cs.plant_id = ? AND cs.is_active = 1
           ORDER BY cs.next_due ASC""",
        (plant["id"],),
    )
    plant["care_status"], plant["most_urgent"] = _compute_care_status(schedules, today)

    care_thresholds = plant.pop("care_thresholds", None)
    if temp_data is not None:
        plant["temp_status"] = _compute_temp_status(care_thresholds, temp_data)
    else:
        plant["temp_status"] = "comfortable"

    phenology_json = plant.pop("phenology_json", None)
    plant["phenology"] = json.loads(phenology_json) if phenology_json else None

    return plant


async def enrich_plant_full(db, plant_row, today, temp_data=None):
    """Enrich a single plant dict with full care_schedules list (for PlantOut shape)."""
    plant = dict(plant_row)

    sched_rows = await db.execute_fetchall(
        """SELECT cs.*, u.name as last_done_by_name
           FROM care_schedules cs
           LEFT JOIN users u ON cs.last_done_by = u.id
           WHERE cs.plant_id = ? AND cs.is_active = 1
           ORDER BY cs.next_due ASC""",
        (plant["id"],),
    )
    plant["care_schedules"] = [dict(row) for row in sched_rows]

    plant["care_status"], _ = _compute_care_status(plant["care_schedules"], today)

    # Compute temp_status
    care_thresholds = plant.pop("care_thresholds", None)
    if temp_data is not None:
        plant["temp_status"] = _compute_temp_status(care_thresholds, temp_data)
    else:
        plant["temp_status"] = "comfortable"

    phenology_json = plant.pop("phenology_json", None)
    plant["phenology"] = json.loads(phenology_json) if phenology_json else None

    return plant


async def enrich_plants(db, plant_rows, today, temp_data=None, rain_data=None, last_watered=None, last_fertilized=None, map_type="outdoor"):
    """Batch-enrich plant dicts. Single query for all schedules (fixes N+1)."""
    if not plant_rows:
        return []

    plants = [dict(r) for r in plant_rows]
    plant_ids = [p["id"] for p in plants]

    placeholders = ",".join("?" for _ in plant_ids)
    sched_rows = await db.execute_fetchall(
        f"""SELECT cs.care_type, cs.next_due, cs.plant_id, u.name as last_done_by_name
            FROM care_schedules cs
            LEFT JOIN users u ON cs.last_done_by = u.id
            WHERE cs.plant_id IN ({placeholders}) AND cs.is_active = 1
            ORDER BY cs.plant_id, cs.next_due ASC""",
        plant_ids,
    )

    schedules_by_plant = {}
    for row in sched_rows:
        r = dict(row)
        pid = r["plant_id"]
        if pid not in schedules_by_plant:
            schedules_by_plant[pid] = []
        schedules_by_plant[pid].append(r)

    for plant in plants:
        pid = plant["id"]
        schedules = schedules_by_plant.get(pid, [])
        plant["care_status"], plant["most_urgent"] = _compute_care_status(schedules, today)

        care_thresholds = plant.pop("care_thresholds", None)
        in_ground = map_type == "outdoor" and plant.get("container_id") is None
        if temp_data is not None:
            plant["temp_status"] = _compute_temp_status(care_thresholds, temp_data, in_ground)
        else:
            plant["temp_status"] = "comfortable"
        plant["top_alert"] = compute_top_alert(
            care_status=plant["care_status"],
            care_thresholds_json=care_thresholds,
            rain=rain_data,
            temp=temp_data,
            last_watered=last_watered,
            last_fertilized=last_fertilized,
            map_type=map_type,
            most_urgent_care_type=plant["most_urgent"].care_type if plant["most_urgent"] else None,
            in_ground=in_ground,
        )
        plant["alerts"] = [
            {"alert_type": a["alert_type"], "severity": a["severity"], "icon": a["icon"]}
            for a in compute_all_alerts(
                care_status=plant["care_status"],
                care_thresholds_json=care_thresholds,
                rain=rain_data,
                temp=temp_data,
                last_watered=last_watered,
                last_fertilized=last_fertilized,
                map_type=map_type,
                most_urgent_care_type=plant["most_urgent"].care_type if plant["most_urgent"] else None,
                in_ground=in_ground,
            )
        ]

        phenology_json = plant.pop("phenology_json", None)
        plant["phenology"] = json.loads(phenology_json) if phenology_json else None

    return plants
