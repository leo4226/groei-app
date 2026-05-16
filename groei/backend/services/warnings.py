"""Unified care warning pipeline.

Single source of truth for what warnings a plant has *right now*, given its
care profile, schedules, and current weather. All UI surfaces consume the
output of `compute_plant_warnings()` — no consumer re-derives priority.
"""
import json
from dataclasses import dataclass, field
from datetime import date
from typing import Literal

from care_types import (
    CARE_TYPES,
    Environment,
    HEATING_SEASON_END_MONTH,
    HEATING_SEASON_START_MONTH,
    SEVERITY_COLORS,
    WEATHER_COLDHEAT_COLORS,
)


Severity = Literal["urgent", "warning", "info"]
Trigger = Literal["schedule_overdue", "schedule_due_today", "weather_event", "seasonal"]
CareStatus = Literal["good", "due_today", "overdue"]


@dataclass
class CareWarning:
    care_type: str
    severity: Severity
    trigger: Trigger
    days_overdue: int | None
    message_nl: str
    message_en: str
    icon: str
    color: str


@dataclass
class CareTypeStatus:
    care_type: str
    status: CareStatus
    days_until_due: int | None
    last_done: date | None


@dataclass
class PlantWarningState:
    plant_id: int
    environment: Environment
    active_care_types: list[str]
    warnings: list[CareWarning] = field(default_factory=list)
    top_warning: CareWarning | None = None
    care_summary: dict[str, CareTypeStatus] = field(default_factory=dict)


def _environment_for_plant(plant: dict) -> Environment:
    """Determine environment from map_type + container_id + ground_zone_id."""
    map_type = plant.get("map_type")
    if map_type == "indoor":
        return "indoor"
    # outdoor or unknown — distinguish container vs ground
    if plant.get("container_id") is not None:
        return "outdoor_container"
    return "outdoor_ground"


def _load_care_profile(care_thresholds_json: str | None, environment: Environment) -> dict:
    """Translate the legacy care_thresholds JSON into the new care-profile shape.

    This shim lets Phase A work against current production data without a
    schema migration. Phase B will replace this with reading plants.care_profile
    directly.
    """
    legacy: dict = {}
    if care_thresholds_json:
        try:
            legacy = json.loads(care_thresholds_json) or {}
        except (json.JSONDecodeError, TypeError):
            legacy = {}

    profile: dict = {}
    for care_type, ct_def in CARE_TYPES.items():
        default_interval = ct_def["default_intervals"].get(environment)
        active = default_interval is not None or ct_def.get("is_weather_triggered", False)

        # Weather-triggered types are only active outdoor.
        if ct_def.get("is_weather_triggered") and environment == "indoor":
            active = False

        entry: dict = {"active": active}
        if default_interval is not None:
            entry["interval_days"] = default_interval
        if ct_def.get("is_weather_triggered"):
            entry["thresholds"] = {
                "min_temp_c": legacy.get("min_temp_c"),
                "max_temp_c": legacy.get("max_temp_c"),
                "bring_inside_below_c": legacy.get("bring_inside_below_c"),
                "drought_mm_per_week": legacy.get("drought_mm_per_week"),
                "waterlog_mm_per_week": legacy.get("waterlog_mm_per_week"),
            }
        profile[care_type] = entry

    # Heating-season boost for indoor water + mist (will be honoured in compute step).
    if environment == "indoor":
        if "water" in profile:
            profile["water"]["heating_season_boost"] = 1.5
        if "mist" in profile:
            profile["mist"]["heating_season_boost"] = 2.0

    # Rainfall override on outdoor water (used in compute step).
    if environment in ("outdoor_ground", "outdoor_container"):
        profile["water"]["rainfall_override"] = True

    return profile


def _schedule_warning_for_type(
    care_type: str, *, next_due: date, today: date
) -> CareWarning | None:
    """Build a schedule-based warning for one care type, or None if not due yet."""
    if next_due > today:
        return None

    days_overdue = (today - next_due).days
    ct_def = CARE_TYPES[care_type]
    icon = ct_def["icon"]
    label_nl = ct_def["label_nl"]
    label_en = ct_def["label_en"]

    if days_overdue >= 3:
        severity: Severity = "urgent"
        trigger: Trigger = "schedule_overdue"
        message_nl = f"{label_nl} — {days_overdue} dagen te laat"
        message_en = f"{label_en} — {days_overdue} days overdue"
    elif days_overdue >= 1:
        severity = "warning"
        trigger = "schedule_overdue"
        message_nl = f"{label_nl} — {days_overdue} dag(en) te laat"
        message_en = f"{label_en} — {days_overdue} day(s) overdue"
    else:
        severity = "warning"
        trigger = "schedule_due_today"
        message_nl = f"{label_nl} vandaag"
        message_en = f"{label_en} due today"

    return CareWarning(
        care_type=care_type,
        severity=severity,
        trigger=trigger,
        days_overdue=days_overdue,
        message_nl=message_nl,
        message_en=message_en,
        icon=icon,
        color=SEVERITY_COLORS[severity],
    )


def _weather_warnings_for_plant(
    profile: dict, *, temp_data: dict | None
) -> list[CareWarning]:
    """Build weather-triggered warnings for one plant given its profile + week temp data."""
    warnings: list[CareWarning] = []
    if not temp_data:
        return warnings

    days = temp_data.get("days") or []
    if not days:
        return warnings
    week_min = min(d["min"] for d in days)
    week_max = max(d["max"] for d in days)

    # Frost
    frost = profile.get("frost_protect") or {}
    if frost.get("active"):
        t = frost.get("thresholds") or {}
        min_temp = t.get("min_temp_c")
        bring_in = t.get("bring_inside_below_c")
        urgent_threshold = min_temp if min_temp is not None else bring_in
        if urgent_threshold is not None and week_min <= urgent_threshold:
            warnings.append(CareWarning(
                care_type="frost_protect",
                severity="urgent",
                trigger="weather_event",
                days_overdue=None,
                message_nl=f"Vorst-bescherming — min {week_min:.0f}°C",
                message_en=f"Frost protect — min {week_min:.0f}°C",
                icon=CARE_TYPES["frost_protect"]["icon"],
                color=WEATHER_COLDHEAT_COLORS["frost_protect_urgent"],
            ))
        elif bring_in is not None and week_min <= bring_in:
            warnings.append(CareWarning(
                care_type="frost_protect",
                severity="warning",
                trigger="weather_event",
                days_overdue=None,
                message_nl=f"Koud aankomend — min {week_min:.0f}°C",
                message_en=f"Cold approaching — min {week_min:.0f}°C",
                icon=CARE_TYPES["frost_protect"]["icon"],
                color=WEATHER_COLDHEAT_COLORS["frost_protect_warning"],
            ))

    # Heat
    heat = profile.get("heat_protect") or {}
    if heat.get("active"):
        t = heat.get("thresholds") or {}
        max_temp = t.get("max_temp_c")
        if max_temp is not None and week_max >= max_temp:
            warnings.append(CareWarning(
                care_type="heat_protect",
                severity="urgent",
                trigger="weather_event",
                days_overdue=None,
                message_nl=f"Hitte-stress — max {week_max:.0f}°C",
                message_en=f"Heat stress — max {week_max:.0f}°C",
                icon=CARE_TYPES["heat_protect"]["icon"],
                color=WEATHER_COLDHEAT_COLORS["heat_protect_urgent"],
            ))
        elif max_temp is not None and week_max >= max_temp - 3:
            warnings.append(CareWarning(
                care_type="heat_protect",
                severity="warning",
                trigger="weather_event",
                days_overdue=None,
                message_nl=f"Hitte nadert — max {week_max:.0f}°C",
                message_en=f"Heat approaching — max {week_max:.0f}°C",
                icon=CARE_TYPES["heat_protect"]["icon"],
                color=WEATHER_COLDHEAT_COLORS["heat_protect_warning"],
            ))

    return warnings


def _is_heating_season(today: date) -> bool:
    """True if `today` is in the NL heating season (Nov 1 – Mar 31 inclusive)."""
    m = today.month
    return m >= HEATING_SEASON_START_MONTH or m <= HEATING_SEASON_END_MONTH


def _apply_heating_boost(profile_entry: dict, *, today: date) -> int:
    """Return the effective interval_days, accounting for heating-season boost."""
    base = profile_entry.get("interval_days")
    if base is None:
        return base
    boost = profile_entry.get("heating_season_boost", 1.0)
    if boost <= 1.0 or not _is_heating_season(today):
        return base
    return max(1, round(base / boost))
