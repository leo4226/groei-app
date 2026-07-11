"""Resolve a plant's canonical care profile across all care surfaces."""
import json

from care_types import CARE_TYPES, Environment, is_care_type_valid_for_env, normalize_care_type


def environment_for_plant(plant: dict) -> Environment:
    """Determine environment from map type and placement metadata."""
    if plant.get("map_type") == "indoor":
        return "indoor"
    if plant.get("container_id") is not None:
        return "outdoor_container"
    return "outdoor_ground"


def canonicalize_care_profile(profile: dict) -> dict:
    """Normalize historical profile keys without overriding canonical entries."""
    normalized: dict = {}
    for raw_care_type, entry in profile.items():
        care_type = normalize_care_type(raw_care_type)
        if care_type not in normalized or raw_care_type == care_type:
            normalized[care_type] = entry
    return normalized


def load_care_profile(
    care_profile_json: str | dict | None,
    care_thresholds_json: str | dict | None,
    environment: Environment,
) -> dict:
    """Read care_profile, falling back to legacy care_thresholds."""
    if care_profile_json:
        try:
            raw_profile = (
                json.loads(care_profile_json)
                if isinstance(care_profile_json, str)
                else care_profile_json
            )
            if isinstance(raw_profile, dict):
                profile = canonicalize_care_profile(raw_profile)
                for care_type in CARE_TYPES:
                    profile.setdefault(care_type, {"active": False})
                    if not is_care_type_valid_for_env(care_type, environment):
                        profile[care_type] = {"active": False}
                return profile
        except (json.JSONDecodeError, TypeError):
            pass

    return load_legacy_care_profile(care_thresholds_json, environment)


def load_legacy_care_profile(
    care_thresholds_json: str | dict | None,
    environment: Environment,
) -> dict:
    """Translate legacy flat thresholds into the canonical profile shape."""
    legacy: dict = {}
    if care_thresholds_json:
        try:
            legacy = (
                json.loads(care_thresholds_json)
                if isinstance(care_thresholds_json, str)
                else care_thresholds_json
            ) or {}
            if not isinstance(legacy, dict):
                legacy = {}
        except (json.JSONDecodeError, TypeError):
            legacy = {}

    profile: dict = {}
    for care_type, care_type_def in CARE_TYPES.items():
        default_interval = care_type_def["default_intervals"].get(environment)
        active = default_interval is not None or care_type_def.get("is_weather_triggered", False)
        if care_type_def.get("is_weather_triggered") and environment == "indoor":
            active = False

        entry: dict = {"active": active}
        if default_interval is not None:
            entry["interval_days"] = default_interval
        if care_type_def.get("is_weather_triggered"):
            entry["thresholds"] = {
                "min_temp_c": legacy.get("min_temp_c"),
                "max_temp_c": legacy.get("max_temp_c"),
                "bring_inside_below_c": legacy.get("bring_inside_below_c"),
                "drought_mm_per_week": legacy.get("drought_mm_per_week"),
                "waterlog_mm_per_week": legacy.get("waterlog_mm_per_week"),
            }
        profile[care_type] = entry

    if environment == "indoor":
        profile["water"]["heating_season_boost"] = 1.5
        profile["mist"]["heating_season_boost"] = 2.0
    else:
        profile["water"]["rainfall_override"] = True

    return profile
