"""Unified care warning pipeline.

Single source of truth for what warnings a plant has *right now*, given its
care profile, schedules, and current weather. All UI surfaces consume the
output of `compute_plant_warnings()` — no consumer re-derives priority.
"""
import json
from dataclasses import dataclass, field
from datetime import date
from typing import Literal

from care_types import CARE_TYPES, Environment


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
