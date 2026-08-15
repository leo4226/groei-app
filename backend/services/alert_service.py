"""Alert computation service.

Provides compute_alerts (full Dutch messages, map-type-aware),
compute_top_alert (single worst alert for map marker display), and
compute_all_alerts (all alerts for multi-badge display).
"""
import json
from datetime import date, datetime
from services.local_time import local_today

_SEVERITY_ORDER = {"urgent": 2, "warning": 1, "info": 0}
_MANUAL_WATER_DAYS = 3
_INDOOR_SKIP = {"drought", "waterlog", "bring_inside", "cold"}
_GROUND_SKIP = {"bring_inside", "cold"}

_CARE_ICON = {
    "water": "💧", "fertilize": "🧪", "mist": "🌫️", "rotate": "🔄",
    "repot": "🪴", "prune": "✂️", "frost_protect": "🧤", "heat_protect": "🧴",
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
    last_fertilized: date | None = None,
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
    skip |= _GROUND_SKIP if in_ground else set()

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
            and (local_today() - last_watered).days < _MANUAL_WATER_DAYS
        )
        if recently_watered:
            pass  # manual watering covers it — no drought alert
        elif total_mm < drought_thresh * 0.5:
            alerts.append({"type": "drought", "severity": "urgent",
                "message_nl": f"Zeer weinig regen deze week ({total_mm}mm). Geef direct extra water.",
                "message_en": f"Very little rain this week ({total_mm}mm). Water immediately.",
                "icon": "💧"})
        else:
            alerts.append({"type": "drought", "severity": "warning",
                "message_nl": f"Weinig neerslag deze week ({total_mm}mm). Overweeg extra water te geven.",
                "message_en": f"Low rainfall this week ({total_mm}mm). Consider extra watering.",
                "icon": "💧"})

    if "waterlog" not in skip and waterlog_thresh and total_mm > waterlog_thresh:
        if total_mm > waterlog_thresh * 2:
            alerts.append({"type": "waterlog", "severity": "urgent",
                "message_nl": f"Extreem veel regen ({total_mm}mm). Controleer drainage om wortels te beschermen.",
                "message_en": f"Extreme rainfall ({total_mm}mm). Check drainage to protect roots.",
                "icon": "🌧️"})
        else:
            alerts.append({"type": "waterlog", "severity": "warning",
                "message_nl": f"Veel neerslag deze week ({total_mm}mm). Let op wateroverlast.",
                "message_en": f"Heavy rainfall this week ({total_mm}mm). Watch for waterlogging.",
                "icon": "🌧️"})

    if "cold" not in skip and min_temp is not None and temp_days:
        week_min = min(d["min"] for d in temp_days)
        if week_min <= min_temp:
            alerts.append({"type": "cold", "severity": "urgent",
                "message_nl": f"Temperatuur daalde tot {week_min}°C, onder de stressgrens van {min_temp}°C.",
                "message_en": f"Temperature dropped to {week_min}°C, below stress threshold of {min_temp}°C.",
                "icon": "❄️"})

    if max_temp is not None and temp_days:
        week_max = max(d["max"] for d in temp_days)
        if week_max >= max_temp:
            alerts.append({"type": "heat", "severity": "urgent",
                "message_nl": f"Temperatuur bereikte {week_max}°C, boven de stressgrens van {max_temp}°C.",
                "message_en": f"Temperature reached {week_max}°C, above stress threshold of {max_temp}°C.",
                "icon": "🌡️"})

    if "bring_inside" not in skip and bring_inside is not None and temp_days:
        week_min = min(d["min"] for d in temp_days)
        if week_min < bring_inside:
            alerts.append({"type": "bring_inside", "severity": "urgent",
                "message_nl": f"Temperatuur daalde tot {week_min}°C. Zet deze plant naar binnen (grens: {bring_inside}°C).",
                "message_en": f"Temperature dropped to {week_min}°C. Bring this plant inside (threshold: {bring_inside}°C).",
                "icon": "🏠"})

    if current_month in fertilise_months:
        fertilized_this_month = last_fertilized is not None and last_fertilized.month == current_month and last_fertilized.year == local_today().year
        if not fertilized_this_month:
            tip = fertilise_tip or "Nu is het een goed moment om te bemesten."
            alerts.append({"type": "fertilise", "severity": "info", "message_nl": tip,
                "message_en": tip,
                "icon": "🌿"})

    return alerts


def _collect_alerts(
    care_status: str,
    care_thresholds_json: str | None,
    rain: dict | None,
    temp: dict | None,
    last_watered: date | None,
    last_fertilized: date | None = None,
    map_type: str = "outdoor",
    most_urgent_care_type: str | None = None,
    in_ground: bool = False,
) -> list[dict]:
    """Collect all active alerts for a plant. Returns list of {alert_type, severity, icon}."""
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
        has_frost_protect = most_urgent_care_type == "frost_protect" and care_status in ("overdue", "due_today")
        has_heat_protect = most_urgent_care_type == "heat_protect" and care_status in ("overdue", "due_today")
        fertilize_handled = care_status == "good" or (most_urgent_care_type is not None and most_urgent_care_type != "fertilize")
        for a in compute_alerts(thresholds, rain, temp, last_watered, last_fertilized, map_type, in_ground=in_ground):
            # Suppress weather cold/heat when an ephemeral protect schedule already covers it
            if has_frost_protect and a["type"] == "cold":
                continue
            if has_heat_protect and a["type"] == "heat":
                continue
            # Suppress monthly fertilise tip when plant has more urgent tasks
            if fertilize_handled and a["type"] == "fertilise":
                continue
            alerts.append({"alert_type": a["type"], "severity": a["severity"], "icon": a["icon"]})

    alerts.sort(key=lambda a: (_SEVERITY_ORDER.get(a["severity"], 0), _ALERT_TYPE_PRIORITY.get(a["alert_type"], 0)), reverse=True)
    return alerts


def compute_top_alert(
    care_status: str,
    care_thresholds_json: str | None,
    rain: dict | None,
    temp: dict | None,
    last_watered: date | None,
    last_fertilized: date | None = None,
    map_type: str = "outdoor",
    most_urgent_care_type: str | None = None,
    in_ground: bool = False,
) -> dict | None:
    """Return the single worst alert for map marker display (backward-compatible)."""
    alerts = _collect_alerts(care_status, care_thresholds_json, rain, temp, last_watered, last_fertilized, map_type, most_urgent_care_type, in_ground)
    return alerts[0] if alerts else None


def compute_all_alerts(
    care_status: str,
    care_thresholds_json: str | None,
    rain: dict | None,
    temp: dict | None,
    last_watered: date | None,
    last_fertilized: date | None = None,
    map_type: str = "outdoor",
    most_urgent_care_type: str | None = None,
    in_ground: bool = False,
) -> list[dict]:
    """Return all active alerts for a plant, sorted by severity then priority."""
    return _collect_alerts(care_status, care_thresholds_json, rain, temp, last_watered, last_fertilized, map_type, most_urgent_care_type, in_ground)
