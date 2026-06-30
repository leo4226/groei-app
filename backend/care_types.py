"""Care-type catalog — the single source of truth for what care types exist,
their default intervals by environment, the canonical warning priority order,
and the heating-season window.

Adding a new care type = adding one entry to CARE_TYPES + WARNING_PRIORITY.
"""
from typing import Literal, TypedDict

Environment = Literal["outdoor_ground", "outdoor_container", "indoor"]
Trigger = Literal["schedule_overdue", "schedule_due_today", "weather_event", "seasonal"]
Severity = Literal["urgent", "warning", "info"]


class CareTypeDef(TypedDict, total=False):
    icon: str
    label_nl: str
    label_en: str
    default_intervals: dict[Environment, int | None]   # None = not active by default in this env
    valid_environments: tuple[Environment, ...]   # optional: valid even without a default interval
    halo_visible_for_ground: bool   # if False, in-ground outdoor halos suppress this type
    is_weather_triggered: bool


CARE_TYPES: dict[str, CareTypeDef] = {
    "water": {
        "icon": "💧", "label_nl": "Water", "label_en": "Water",
        "default_intervals": {"outdoor_ground": 7, "outdoor_container": 4, "indoor": 7},
        "halo_visible_for_ground": False,
        "is_weather_triggered": False,
    },
    "fertilize": {
        "icon": "🌱", "label_nl": "Mest", "label_en": "Fertilize",
        "default_intervals": {"outdoor_ground": 30, "outdoor_container": 21, "indoor": 30},
        "halo_visible_for_ground": False,
        "is_weather_triggered": False,
    },
    "frost_protect": {
        "icon": "❄️", "label_nl": "Vorst-bescherming", "label_en": "Frost protect",
        "default_intervals": {"outdoor_ground": None, "outdoor_container": None, "indoor": None},
        "halo_visible_for_ground": True,
        "is_weather_triggered": True,
    },
    "heat_protect": {
        "icon": "🔥", "label_nl": "Hitte-bescherming", "label_en": "Heat protect",
        "default_intervals": {"outdoor_ground": None, "outdoor_container": None, "indoor": None},
        "halo_visible_for_ground": True,
        "is_weather_triggered": True,
    },
    "prune": {
        "icon": "✂️", "label_nl": "Snoeien", "label_en": "Prune",
        "default_intervals": {"outdoor_ground": 180, "outdoor_container": 180, "indoor": 365},
        "halo_visible_for_ground": False,
        "is_weather_triggered": False,
    },
    "repot": {
        "icon": "🪴", "label_nl": "Verpotten", "label_en": "Repot",
        "default_intervals": {"outdoor_ground": None, "outdoor_container": 540, "indoor": 540},
        "halo_visible_for_ground": False,
        "is_weather_triggered": False,
    },
    "mist": {
        "icon": "💨", "label_nl": "Bevochtigen", "label_en": "Mist",
        "default_intervals": {"outdoor_ground": None, "outdoor_container": None, "indoor": None},
        "valid_environments": ("indoor",),
        "halo_visible_for_ground": False,
        "is_weather_triggered": False,
    },
    "rotate": {
        "icon": "🔄", "label_nl": "Draaien", "label_en": "Rotate",
        "default_intervals": {"outdoor_ground": None, "outdoor_container": None, "indoor": 7},
        "halo_visible_for_ground": False,
        "is_weather_triggered": False,
    },
    "pest_check": {
        "icon": "🐛", "label_nl": "Luizen-check", "label_en": "Pest check",
        "default_intervals": {"outdoor_ground": 30, "outdoor_container": 30, "indoor": 30},
        "halo_visible_for_ground": False,
        "is_weather_triggered": False,
    },
    "dust": {
        "icon": "🧽", "label_nl": "Bladeren afnemen", "label_en": "Wipe leaves",
        "default_intervals": {"outdoor_ground": None, "outdoor_container": None, "indoor": 30},
        "halo_visible_for_ground": False,
        "is_weather_triggered": False,
    },
}


# Priority bucket index (lower = higher priority).
# Tiebreaker within a bucket: more days_overdue first, then alphabetical care_type.
WARNING_PRIORITY: list[tuple[Trigger, Severity]] = [
    ("weather_event", "urgent"),
    ("schedule_overdue", "urgent"),
    ("weather_event", "warning"),
    ("schedule_overdue", "warning"),
    ("schedule_due_today", "warning"),
    ("schedule_due_today", "info"),
    ("seasonal", "info"),
    ("weather_event", "info"),
]


def is_care_type_valid_for_env(care_type: str, environment: Environment) -> bool:
    """Whether a care type makes sense in a given environment.

    Single source of truth for the env-validity rule (e.g. rotate/mist only
    make sense indoors, weather-triggered types only outdoors). Used both to
    suppress stale care-profile entries at read time and to refuse seeding
    env-inappropriate care schedules at plant-creation time.

    Unknown care types (not in CARE_TYPES) return True so we never silently
    drop something we don't model.
    """
    ct_def = CARE_TYPES.get(care_type)
    if ct_def is None:
        return True
    valid_environments = ct_def.get("valid_environments")
    if valid_environments is not None:
        return environment in valid_environments
    default_interval = ct_def["default_intervals"].get(environment)
    is_weather = ct_def.get("is_weather_triggered", False)
    return default_interval is not None or (is_weather and environment != "indoor")


def priority_bucket(trigger: Trigger, severity: Severity) -> int:
    """Return the priority bucket index (lower = higher priority)."""
    try:
        return WARNING_PRIORITY.index((trigger, severity))
    except ValueError:
        return len(WARNING_PRIORITY)  # unknown combo goes last


# NL hardcoded heating season — phase-1 single household in Amsterdam.
HEATING_SEASON_START_MONTH = 11   # Nov 1
HEATING_SEASON_END_MONTH = 3      # through Mar 31 inclusive


# Severity → display color (hex). Used by frontend via CareWarning.color.
SEVERITY_COLORS: dict[Severity, str] = {
    "urgent": "#ea0706",
    "warning": "#FFC233",
    "info": "#4a7c2c",
}

# Special override: cold weather warnings render in blue, not red.
WEATHER_COLDHEAT_COLORS = {
    "frost_protect_urgent": "#2544a0",
    "frost_protect_warning": "#5d7fc8",
    "heat_protect_urgent": "#c8541d",
    "heat_protect_warning": "#e08049",
}


def parse_muted_care_types(value) -> list[str]:
    """Parse the comma-separated muted-care-types field into a clean, validated
    list — trims whitespace, drops blanks, and keeps only known care types so a
    bad client can't pollute the stored set. Shared by the prefs API and the
    push dispatch."""
    if not value:
        return []
    return [c.strip() for c in str(value).split(",") if c.strip() in CARE_TYPES]
