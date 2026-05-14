"""Alert computation service.

Provides compute_alerts (full Dutch messages, map-type-aware) and
compute_top_alert (single worst alert for map marker display).
"""
import json
from datetime import date, datetime

_SEVERITY_ORDER = {"urgent": 2, "warning": 1, "info": 0}
_MANUAL_WATER_DAYS = 3
_INDOOR_SKIP = {"drought", "waterlog", "bring_inside"}

_CARE_ICON = {
    "water": "💧", "fertilize": "🧪", "mist": "🌫️", "rotate": "🔄",
    "repot_check": "🪴", "prune": "✂️", "protect_cold": "🧤", "protect_heat": "🧴",
}

# Tiebreaker: at the same severity, temperature alerts beat weather alerts beat schedule alerts
_ALERT_TYPE_PRIORITY = {
    "cold": 3, "heat": 3, "bring_inside": 3,
    "drought": 2, "waterlog": 2,
}


def _fmt_date_nl(d: date) -> str:
    MONTHS = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"]
    return f"{d.day} {MONTHS[d.month - 1]}"


def compute_alerts(
    thresholds: dict,
    rain: dict,
    temp: dict,
    last_watered: date | None = None,
    map_type: str = "outdoor",
    in_ground: bool = False,
) -> list[dict]:
    """Return all active alerts for a plant. Skips weather alerts irrelevant to indoor maps.

    For in-ground outdoor plants, uses a 14-day effective-weekly rainfall
    (total_14day / 2) since established roots access deeper soil moisture.
    Container plants use the tighter 7-day window.
    """
    alerts = []
    # In-ground plants: wider rain window reflects soil moisture reality
    total_mm = (rain.get("total_14day_mm", rain["total_7day_mm"]) / 2) if in_ground else rain["total_7day_mm"]
    total_mm = round(total_mm, 1)
    temp_days = temp["days"]
    current_month = datetime.now().month
    skip = _INDOOR_SKIP if map_type == "indoor" else set()

    drought_thresh = thresholds.get("drought_mm_per_week", 0)
    waterlog_thresh = thresholds.get("waterlog_mm_per_week", 9999)
    min_temp = thresholds.get("min_temp_c")
    max_temp = thresholds.get("max_temp_c")
    bring_inside = thresholds.get("bring_inside_below_c")
    fertilise_months = thresholds.get("fertilise_months") or []
    fertilise_tip = thresholds.get("fertilise_tip", "")

    if "drought" not in skip and drought_thresh and total_mm < drought_thresh:
        recently_watered = (
            last_watered is not None
            and (date.today() - last_watered).days < _MANUAL_WATER_DAYS
        )
        if recently_watered:
            alerts.append({"type": "drought", "severity": "info",
                "message_nl": f"Weinig regen ({total_mm}mm), maar je hebt op {_fmt_date_nl(last_watered)} water gegeven — voorlopig in orde.",
                "icon": "💧"})
        elif total_mm < drought_thresh * 0.5:
            alerts.append({"type": "drought", "severity": "urgent",
                "message_nl": f"Zeer weinig regen deze week ({total_mm}mm). Geef direct extra water.",
                "icon": "💧"})
        else:
            alerts.append({"type": "drought", "severity": "warning",
                "message_nl": f"Weinig neerslag deze week ({total_mm}mm). Overweeg extra water te geven.",
                "icon": "💧"})

    if "waterlog" not in skip and waterlog_thresh and total_mm > waterlog_thresh:
        if total_mm > waterlog_thresh * 2:
            alerts.append({"type": "waterlog", "severity": "urgent",
                "message_nl": f"Extreem veel regen ({total_mm}mm). Controleer drainage om wortels te beschermen.",
                "icon": "🌧️"})
        else:
            alerts.append({"type": "waterlog", "severity": "warning",
                "message_nl": f"Veel neerslag deze week ({total_mm}mm). Let op wateroverlast.",
                "icon": "🌧️"})

    if min_temp is not None and temp_days:
        week_min = min(d["min"] for d in temp_days)
        if week_min < min_temp:
            alerts.append({"type": "cold", "severity": "urgent",
                "message_nl": f"Temperatuur daalde tot {week_min}°C, onder de stressgrens van {min_temp}°C.",
                "icon": "🥶"})
        elif week_min < min_temp + 3:
            alerts.append({"type": "cold", "severity": "warning",
                "message_nl": f"Minimum temperatuur ({week_min}°C) nadert de stressgrens ({min_temp}°C).",
                "icon": "🥶"})

    if max_temp is not None and temp_days:
        week_max = max(d["max"] for d in temp_days)
        if week_max > max_temp:
            alerts.append({"type": "heat", "severity": "urgent",
                "message_nl": f"Temperatuur bereikte {week_max}°C, boven de stressgrens van {max_temp}°C.",
                "icon": "🌡️"})
        elif week_max > max_temp - 3:
            alerts.append({"type": "heat", "severity": "warning",
                "message_nl": f"Maximum temperatuur ({week_max}°C) nadert de stressgrens ({max_temp}°C).",
                "icon": "🌡️"})

    if "bring_inside" not in skip and bring_inside is not None and temp_days:
        week_min = min(d["min"] for d in temp_days)
        if week_min < bring_inside:
            alerts.append({"type": "bring_inside", "severity": "urgent",
                "message_nl": f"Temperatuur daalde tot {week_min}°C. Zet deze plant naar binnen (grens: {bring_inside}°C).",
                "icon": "🏠"})

    if current_month in fertilise_months:
        tip = fertilise_tip or "Nu is het een goed moment om te bemesten."
        alerts.append({"type": "fertilise", "severity": "info", "message_nl": tip, "icon": "🌿"})

    return alerts


def compute_top_alert(
    care_status: str,
    care_thresholds_json: str | None,
    rain: dict | None,
    temp: dict | None,
    last_watered: date | None,
    map_type: str = "outdoor",
    most_urgent_care_type: str | None = None,
    in_ground: bool = False,
) -> dict | None:
    """Return the single worst alert (alert_type, severity, icon) for map marker display.

    Returns None when the plant has no active alerts.
    """
    alerts = []

    if care_status == "overdue":
        alert_type = f"overdue_{most_urgent_care_type}" if most_urgent_care_type else "overdue"
        icon = _CARE_ICON.get(most_urgent_care_type or "", "💧")
        alerts.append({"alert_type": alert_type, "severity": "urgent", "icon": icon})
    elif care_status == "due_today":
        alert_type = f"due_{most_urgent_care_type}" if most_urgent_care_type else "due"
        icon = _CARE_ICON.get(most_urgent_care_type or "", "💧")
        alerts.append({"alert_type": alert_type, "severity": "info", "icon": icon})

    if care_thresholds_json and rain and temp:
        try:
            thresholds = json.loads(care_thresholds_json)
        except (json.JSONDecodeError, TypeError):
            thresholds = {}
        for a in compute_alerts(thresholds, rain, temp, last_watered, map_type, in_ground=in_ground):
            alerts.append({"alert_type": a["type"], "severity": a["severity"], "icon": a["icon"]})

    if not alerts:
        return None

    alerts.sort(key=lambda a: (_SEVERITY_ORDER.get(a["severity"], 0), _ALERT_TYPE_PRIORITY.get(a["alert_type"], 0)), reverse=True)
    return alerts[0]
