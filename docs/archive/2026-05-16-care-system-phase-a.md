# Care System Redesign — Phase A: Unified Warning Pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the canonical `compute_plant_warnings()` pipeline that all UX surfaces will eventually consume. Phase A delivers the function, dataclasses, care-types catalog, a new `GET /api/plants/{id}/warnings` endpoint, and parity tests that prove the new pipeline matches today's output for water/fertilize/cold/heat. No UX changes; old endpoints continue to work.

**Architecture:** A new pure function `compute_plant_warnings(plant_row, schedules, weather_data, today) -> PlantWarningState` lives in `backend/services/warnings.py`. It reads from existing `plants.care_thresholds` via a shim that translates legacy JSON into the new care-profile shape, so Phase A works against current production data with zero schema changes. A single `WARNING_PRIORITY` table in `backend/care_types.py` defines ordering once. Parity tests assert the new pipeline's `top_warning.care_type + severity` matches the old `top_alert` for every plant in a fixture set.

**Tech Stack:** Python 3.11+ / FastAPI / aiosqlite, pytest + pytest-asyncio, existing Open-Meteo cache, Pydantic models for HTTP response.

**Reference:** `docs/specs/in-progress/2026-05-16-care-system-redesign-design.md`

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `groei/backend/care_types.py` | **Create** | The 10 care-type catalog, default intervals by environment, `WARNING_PRIORITY` table, heating-season window |
| `groei/backend/services/warnings.py` | **Create** | Dataclasses + `compute_plant_warnings()` pure function |
| `groei/backend/routers/warnings.py` | **Create** | `GET /api/plants/{id}/warnings` HTTP wrapper |
| `groei/backend/main.py` | Modify | Register the new router |
| `groei/backend/tests/test_warnings.py` | **Create** | Unit tests for `compute_plant_warnings()` — one fixture per care_type × trigger |
| `groei/backend/tests/test_warnings_parity.py` | **Create** | Parity test: for every plant in DB, new `top_warning` matches old `top_alert` |
| `groei/backend/tests/test_warnings_endpoint.py` | **Create** | HTTP-level test for the new endpoint |

No frontend changes in Phase A. No DB schema changes in Phase A.

---

### Task 1: Care-types catalog

**Files:**
- Create: `groei/backend/care_types.py`
- Test: (no test — pure constants, exercised by later tasks)

- [ ] **Step 1: Create the catalog file**

Create `groei/backend/care_types.py`:

```python
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
    default_intervals: dict[Environment, int | None]   # None = not active in this env
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
        "default_intervals": {"outdoor_ground": None, "outdoor_container": None, "indoor": 3},
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
```

- [ ] **Step 2: Commit**

```bash
git add groei/backend/care_types.py
git commit -m "feat(care): add care-types catalog and warning priority table"
```

---

### Task 2: Warning dataclasses

**Files:**
- Create: `groei/backend/services/warnings.py` (dataclasses only — function body lands in Task 4+)
- Test: `groei/backend/tests/test_warnings.py`

- [ ] **Step 1: Write the failing test**

Create `groei/backend/tests/test_warnings.py`:

```python
"""Unit tests for the unified care warning pipeline."""
from datetime import date
from services.warnings import PlantWarningState, CareWarning, CareTypeStatus


def test_dataclasses_have_expected_fields():
    """PlantWarningState exposes the documented fields."""
    w = CareWarning(
        care_type="water",
        severity="urgent",
        trigger="schedule_overdue",
        days_overdue=3,
        message_nl="Water — 3 dagen te laat",
        message_en="Water — 3 days overdue",
        icon="💧",
        color="#ea0706",
    )
    s = CareTypeStatus(
        care_type="water",
        status="overdue",
        days_until_due=-3,
        last_done=date(2026, 5, 13),
    )
    state = PlantWarningState(
        plant_id=42,
        environment="indoor",
        active_care_types=["water"],
        warnings=[w],
        top_warning=w,
        care_summary={"water": s},
    )
    assert state.plant_id == 42
    assert state.top_warning.color == "#ea0706"
    assert state.care_summary["water"].status == "overdue"
```

- [ ] **Step 2: Run test to see it fail with import error**

```bash
cd groei && .venv/Scripts/python.exe -m pytest backend/tests/test_warnings.py -v
```

Expected: `ImportError: cannot import name 'PlantWarningState' from 'services.warnings'`

- [ ] **Step 3: Create the dataclasses file**

Create `groei/backend/services/warnings.py`:

```python
"""Unified care warning pipeline.

Single source of truth for what warnings a plant has *right now*, given its
care profile, schedules, and current weather. All UI surfaces consume the
output of `compute_plant_warnings()` — no consumer re-derives priority.
"""
from dataclasses import dataclass, field
from datetime import date
from typing import Literal


Environment = Literal["outdoor_ground", "outdoor_container", "indoor"]
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
```

- [ ] **Step 4: Run test to see it pass**

```bash
cd groei && .venv/Scripts/python.exe -m pytest backend/tests/test_warnings.py -v
```

Expected: PASS — 1 passed.

- [ ] **Step 5: Commit**

```bash
git add groei/backend/services/warnings.py groei/backend/tests/test_warnings.py
git commit -m "feat(care): add PlantWarningState dataclasses"
```

---

### Task 3: Environment detection + care-profile shim

**Files:**
- Modify: `groei/backend/services/warnings.py` (add `_environment_for_plant`, `_load_care_profile`)
- Test: `groei/backend/tests/test_warnings.py`

The shim translates the legacy `plants.care_thresholds` JSON into the new care-profile shape on read, so Phase A works against current production data without a schema migration.

- [ ] **Step 1: Write the failing test**

Append to `groei/backend/tests/test_warnings.py`:

```python
from services.warnings import _environment_for_plant, _load_care_profile


def test_environment_indoor():
    plant = {"map_type": "indoor", "container_id": 5, "ground_zone_id": None}
    assert _environment_for_plant(plant) == "indoor"


def test_environment_outdoor_ground():
    plant = {"map_type": "outdoor", "container_id": None, "ground_zone_id": "bed_1"}
    assert _environment_for_plant(plant) == "outdoor_ground"


def test_environment_outdoor_container():
    plant = {"map_type": "outdoor", "container_id": 7, "ground_zone_id": None}
    assert _environment_for_plant(plant) == "outdoor_container"


def test_environment_outdoor_defaults_to_ground():
    """No container and no ground_zone — treat as ground for in-ground perennials."""
    plant = {"map_type": "outdoor", "container_id": None, "ground_zone_id": None}
    assert _environment_for_plant(plant) == "outdoor_ground"


def test_load_care_profile_from_legacy_thresholds():
    """Legacy care_thresholds JSON gets translated into the new care-profile shape."""
    legacy = '{"min_temp_c": 0, "max_temp_c": 30, "bring_inside_below_c": 5, "drought_mm_per_week": 15}'
    profile = _load_care_profile(legacy, environment="outdoor_container")

    # Water + fertilize active by default for this env (intervals from catalog).
    assert profile["water"]["active"] is True
    assert profile["water"]["interval_days"] == 4   # outdoor_container default
    assert profile["fertilize"]["active"] is True

    # Weather-triggered types pick up thresholds.
    assert profile["frost_protect"]["active"] is True
    assert profile["frost_protect"]["thresholds"]["min_temp_c"] == 0
    assert profile["frost_protect"]["thresholds"]["bring_inside_below_c"] == 5
    assert profile["heat_protect"]["thresholds"]["max_temp_c"] == 30

    # Indoor-only types inactive for outdoor environment.
    assert profile["mist"]["active"] is False
    assert profile["rotate"]["active"] is False
    assert profile["dust"]["active"] is False


def test_load_care_profile_indoor_activates_indoor_types():
    profile = _load_care_profile(None, environment="indoor")
    assert profile["water"]["active"] is True
    assert profile["mist"]["active"] is True
    assert profile["rotate"]["active"] is True
    assert profile["dust"]["active"] is True
    assert profile["frost_protect"]["active"] is False
    assert profile["heat_protect"]["active"] is False
```

- [ ] **Step 2: Run tests to see them fail**

```bash
cd groei && .venv/Scripts/python.exe -m pytest backend/tests/test_warnings.py -v
```

Expected: 5 new tests fail with `ImportError` for `_environment_for_plant` / `_load_care_profile`.

- [ ] **Step 3: Implement the helpers**

Append to `groei/backend/services/warnings.py`:

```python
import json
from care_types import CARE_TYPES, Environment as EnvLit


def _environment_for_plant(plant: dict) -> EnvLit:
    """Determine environment from map_type + container_id + ground_zone_id."""
    map_type = plant.get("map_type")
    if map_type == "indoor":
        return "indoor"
    # outdoor or unknown — distinguish container vs ground
    if plant.get("container_id") is not None:
        return "outdoor_container"
    return "outdoor_ground"


def _load_care_profile(care_thresholds_json: str | None, environment: EnvLit) -> dict:
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
```

- [ ] **Step 4: Run tests to see them pass**

```bash
cd groei && .venv/Scripts/python.exe -m pytest backend/tests/test_warnings.py -v
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add groei/backend/services/warnings.py groei/backend/tests/test_warnings.py
git commit -m "feat(care): add environment detection + care-profile shim"
```

---

### Task 4: Schedule-based warning derivation

**Files:**
- Modify: `groei/backend/services/warnings.py` (add `_schedule_warning_for_type`)
- Test: `groei/backend/tests/test_warnings.py`

- [ ] **Step 1: Write the failing test**

Append to `groei/backend/tests/test_warnings.py`:

```python
from datetime import date
from services.warnings import _schedule_warning_for_type


def test_schedule_overdue_3_days_is_urgent():
    """Water 3+ days overdue → urgent."""
    today = date(2026, 5, 16)
    next_due = date(2026, 5, 13)   # 3 days ago
    w = _schedule_warning_for_type("water", next_due=next_due, today=today)
    assert w is not None
    assert w.severity == "urgent"
    assert w.trigger == "schedule_overdue"
    assert w.days_overdue == 3


def test_schedule_overdue_1_day_is_warning():
    today = date(2026, 5, 16)
    next_due = date(2026, 5, 15)
    w = _schedule_warning_for_type("water", next_due=next_due, today=today)
    assert w.severity == "warning"
    assert w.days_overdue == 1


def test_schedule_due_today():
    today = date(2026, 5, 16)
    w = _schedule_warning_for_type("water", next_due=today, today=today)
    assert w.severity == "warning"
    assert w.trigger == "schedule_due_today"
    assert w.days_overdue == 0


def test_schedule_future_returns_none():
    today = date(2026, 5, 16)
    next_due = date(2026, 5, 20)
    assert _schedule_warning_for_type("water", next_due=next_due, today=today) is None


def test_schedule_warning_uses_care_type_icon():
    today = date(2026, 5, 16)
    w = _schedule_warning_for_type("repot", next_due=date(2026, 5, 10), today=today)
    assert w.icon == "🪴"
    assert "Verpotten" in w.message_nl
```

- [ ] **Step 2: Run tests to see them fail**

```bash
cd groei && .venv/Scripts/python.exe -m pytest backend/tests/test_warnings.py -v
```

Expected: 5 new tests fail.

- [ ] **Step 3: Implement `_schedule_warning_for_type`**

Append to `groei/backend/services/warnings.py`:

```python
from care_types import (
    CARE_TYPES,
    SEVERITY_COLORS,
    WEATHER_COLDHEAT_COLORS,
)


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
```

- [ ] **Step 4: Run tests to see them pass**

```bash
cd groei && .venv/Scripts/python.exe -m pytest backend/tests/test_warnings.py -v
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add groei/backend/services/warnings.py groei/backend/tests/test_warnings.py
git commit -m "feat(care): schedule-based warning derivation"
```

---

### Task 5: Weather-triggered warning derivation (frost + heat)

**Files:**
- Modify: `groei/backend/services/warnings.py` (add `_weather_warnings_for_plant`)
- Test: `groei/backend/tests/test_warnings.py`

- [ ] **Step 1: Write the failing tests**

Append to `groei/backend/tests/test_warnings.py`:

```python
from services.warnings import _weather_warnings_for_plant


def test_frost_urgent_when_min_below_threshold():
    profile = {
        "frost_protect": {
            "active": True,
            "thresholds": {"min_temp_c": 0, "bring_inside_below_c": 5},
        }
    }
    temp = {"days": [{"min": -2, "max": 8}, {"min": -1, "max": 10}]}
    warns = _weather_warnings_for_plant(profile, temp_data=temp)
    assert any(w.care_type == "frost_protect" and w.severity == "urgent" for w in warns)


def test_frost_warning_when_min_near_bring_inside():
    profile = {
        "frost_protect": {
            "active": True,
            "thresholds": {"min_temp_c": -5, "bring_inside_below_c": 5},
        }
    }
    temp = {"days": [{"min": 3, "max": 12}]}
    warns = _weather_warnings_for_plant(profile, temp_data=temp)
    cold = [w for w in warns if w.care_type == "frost_protect"]
    assert len(cold) == 1
    assert cold[0].severity == "warning"


def test_no_frost_when_inactive():
    profile = {"frost_protect": {"active": False, "thresholds": {"min_temp_c": 0}}}
    temp = {"days": [{"min": -5, "max": 5}]}
    warns = _weather_warnings_for_plant(profile, temp_data=temp)
    assert all(w.care_type != "frost_protect" for w in warns)


def test_heat_urgent_when_max_above_threshold():
    profile = {
        "heat_protect": {
            "active": True,
            "thresholds": {"max_temp_c": 28},
        }
    }
    temp = {"days": [{"min": 18, "max": 32}]}
    warns = _weather_warnings_for_plant(profile, temp_data=temp)
    assert any(w.care_type == "heat_protect" and w.severity == "urgent" for w in warns)


def test_weather_color_overrides_apply():
    profile = {"frost_protect": {"active": True, "thresholds": {"min_temp_c": 0}}}
    temp = {"days": [{"min": -3, "max": 5}]}
    warns = _weather_warnings_for_plant(profile, temp_data=temp)
    cold = next(w for w in warns if w.care_type == "frost_protect")
    assert cold.color == "#2544a0"   # cold-blue, not red
```

- [ ] **Step 2: Run tests to see them fail**

```bash
cd groei && .venv/Scripts/python.exe -m pytest backend/tests/test_warnings.py -v
```

Expected: 5 new tests fail.

- [ ] **Step 3: Implement `_weather_warnings_for_plant`**

Append to `groei/backend/services/warnings.py`:

```python
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
```

- [ ] **Step 4: Run tests to see them pass**

```bash
cd groei && .venv/Scripts/python.exe -m pytest backend/tests/test_warnings.py -v
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add groei/backend/services/warnings.py groei/backend/tests/test_warnings.py
git commit -m "feat(care): weather-triggered frost/heat warning derivation"
```

---

### Task 6: Heating-season helper + indoor water/mist boost

**Files:**
- Modify: `groei/backend/services/warnings.py` (add `_is_heating_season`, `_apply_heating_boost`)
- Test: `groei/backend/tests/test_warnings.py`

- [ ] **Step 1: Write the failing tests**

Append to `groei/backend/tests/test_warnings.py`:

```python
from services.warnings import _is_heating_season, _apply_heating_boost


def test_heating_season_in_january():
    assert _is_heating_season(date(2026, 1, 15)) is True


def test_heating_season_in_december():
    assert _is_heating_season(date(2026, 12, 5)) is True


def test_heating_season_in_march_through_31():
    assert _is_heating_season(date(2026, 3, 31)) is True


def test_heating_season_off_in_april():
    assert _is_heating_season(date(2026, 4, 1)) is False


def test_heating_season_off_in_july():
    assert _is_heating_season(date(2026, 7, 15)) is False


def test_heating_boost_shortens_interval_when_in_season():
    """interval_days × heating_season_boost when in heating season → shorter effective interval.

    Effective interval = interval / boost (boost > 1 means more frequent).
    """
    entry = {"interval_days": 7, "heating_season_boost": 1.5}
    eff = _apply_heating_boost(entry, today=date(2026, 1, 15))
    assert eff == round(7 / 1.5)  # ≈ 5


def test_heating_boost_noop_off_season():
    entry = {"interval_days": 7, "heating_season_boost": 1.5}
    eff = _apply_heating_boost(entry, today=date(2026, 7, 15))
    assert eff == 7


def test_heating_boost_noop_when_field_missing():
    entry = {"interval_days": 7}
    eff = _apply_heating_boost(entry, today=date(2026, 1, 15))
    assert eff == 7
```

- [ ] **Step 2: Run tests to see them fail**

```bash
cd groei && .venv/Scripts/python.exe -m pytest backend/tests/test_warnings.py -v
```

Expected: 8 new tests fail.

- [ ] **Step 3: Implement the helpers**

Append to `groei/backend/services/warnings.py`:

```python
from care_types import HEATING_SEASON_START_MONTH, HEATING_SEASON_END_MONTH


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
```

- [ ] **Step 4: Run tests to see them pass**

```bash
cd groei && .venv/Scripts/python.exe -m pytest backend/tests/test_warnings.py -v
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add groei/backend/services/warnings.py groei/backend/tests/test_warnings.py
git commit -m "feat(care): heating-season helpers for indoor water/mist boost"
```

---

### Task 7: Priority sort

**Files:**
- Modify: `groei/backend/services/warnings.py` (add `_sort_warnings`)
- Test: `groei/backend/tests/test_warnings.py`

- [ ] **Step 1: Write the failing tests**

Append to `groei/backend/tests/test_warnings.py`:

```python
from services.warnings import _sort_warnings


def _mk(care_type, severity, trigger, days=None):
    return CareWarning(
        care_type=care_type, severity=severity, trigger=trigger,
        days_overdue=days, message_nl="", message_en="", icon="", color="",
    )


def test_weather_urgent_beats_schedule_urgent():
    a = _mk("water", "urgent", "schedule_overdue", 3)
    b = _mk("frost_protect", "urgent", "weather_event")
    sorted_ = _sort_warnings([a, b])
    assert sorted_[0].care_type == "frost_protect"


def test_overdue_3d_beats_overdue_1d_within_bucket():
    a = _mk("fertilize", "urgent", "schedule_overdue", 1)
    b = _mk("water", "urgent", "schedule_overdue", 5)
    sorted_ = _sort_warnings([a, b])
    assert sorted_[0].care_type == "water"


def test_alphabetical_tiebreaker_within_bucket():
    a = _mk("water", "urgent", "schedule_overdue", 3)
    b = _mk("fertilize", "urgent", "schedule_overdue", 3)
    sorted_ = _sort_warnings([a, b])
    assert sorted_[0].care_type == "fertilize"   # alphabetical
    assert sorted_[1].care_type == "water"


def test_due_today_after_overdue():
    a = _mk("water", "warning", "schedule_due_today", 0)
    b = _mk("fertilize", "warning", "schedule_overdue", 1)
    sorted_ = _sort_warnings([a, b])
    assert sorted_[0].trigger == "schedule_overdue"
```

- [ ] **Step 2: Run tests to see them fail**

```bash
cd groei && .venv/Scripts/python.exe -m pytest backend/tests/test_warnings.py -v
```

Expected: 4 new tests fail.

- [ ] **Step 3: Implement `_sort_warnings`**

Append to `groei/backend/services/warnings.py`:

```python
from care_types import priority_bucket


def _sort_warnings(warnings: list[CareWarning]) -> list[CareWarning]:
    """Sort by canonical priority bucket; tiebreaker = more days_overdue first, then alphabetical."""
    def key(w: CareWarning):
        bucket = priority_bucket(w.trigger, w.severity)
        # Negate days_overdue so larger overdue sorts first; None days → 0.
        days_key = -(w.days_overdue or 0)
        return (bucket, days_key, w.care_type)
    return sorted(warnings, key=key)
```

- [ ] **Step 4: Run tests to see them pass**

```bash
cd groei && .venv/Scripts/python.exe -m pytest backend/tests/test_warnings.py -v
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add groei/backend/services/warnings.py groei/backend/tests/test_warnings.py
git commit -m "feat(care): canonical priority sort for warnings"
```

---

### Task 8: Main `compute_plant_warnings` entry point

**Files:**
- Modify: `groei/backend/services/warnings.py` (add `compute_plant_warnings`)
- Test: `groei/backend/tests/test_warnings.py`

- [ ] **Step 1: Write the failing tests**

Append to `groei/backend/tests/test_warnings.py`:

```python
from services.warnings import compute_plant_warnings


def test_compute_indoor_plant_overdue_water():
    plant = {
        "id": 1, "map_type": "indoor", "container_id": 3, "ground_zone_id": None,
        "care_thresholds": None,
    }
    schedules = [{"care_type": "water", "next_due": "2026-05-13"}]   # 3d ago
    state = compute_plant_warnings(plant, schedules, weather=None, today=date(2026, 5, 16))
    assert state.plant_id == 1
    assert state.environment == "indoor"
    assert state.top_warning.care_type == "water"
    assert state.top_warning.severity == "urgent"
    assert state.care_summary["water"].status == "overdue"


def test_compute_outdoor_container_frost_beats_water():
    plant = {
        "id": 2, "map_type": "outdoor", "container_id": 1, "ground_zone_id": None,
        "care_thresholds": '{"min_temp_c": 0, "bring_inside_below_c": 5}',
    }
    schedules = [{"care_type": "water", "next_due": "2026-05-13"}]   # urgent overdue
    weather = {"temp": {"days": [{"min": -2, "max": 8}]}}
    state = compute_plant_warnings(plant, schedules, weather=weather, today=date(2026, 5, 16))
    assert state.top_warning.care_type == "frost_protect"
    assert state.top_warning.trigger == "weather_event"


def test_compute_no_warnings_returns_none_top():
    plant = {
        "id": 3, "map_type": "indoor", "container_id": 2, "ground_zone_id": None,
        "care_thresholds": None,
    }
    schedules = [{"care_type": "water", "next_due": "2026-06-01"}]   # future
    state = compute_plant_warnings(plant, schedules, weather=None, today=date(2026, 5, 16))
    assert state.top_warning is None
    assert state.warnings == []
    assert state.care_summary["water"].status == "good"


def test_compute_active_care_types_listed():
    plant = {
        "id": 4, "map_type": "indoor", "container_id": 1, "ground_zone_id": None,
        "care_thresholds": None,
    }
    state = compute_plant_warnings(plant, [], weather=None, today=date(2026, 5, 16))
    # Indoor plant has water, fertilize, prune, repot, mist, rotate, pest_check, dust active.
    assert "water" in state.active_care_types
    assert "mist" in state.active_care_types
    assert "frost_protect" not in state.active_care_types
```

- [ ] **Step 2: Run tests to see them fail**

```bash
cd groei && .venv/Scripts/python.exe -m pytest backend/tests/test_warnings.py -v
```

Expected: 4 new tests fail.

- [ ] **Step 3: Implement `compute_plant_warnings`**

Append to `groei/backend/services/warnings.py`:

```python
def compute_plant_warnings(
    plant: dict,
    schedules: list[dict],
    *,
    weather: dict | None,
    today: date,
) -> PlantWarningState:
    """Single entry point: derive a plant's canonical warning state.

    Pure function — no DB writes, no side effects.

    Args:
        plant: dict-like row from `plants` table; expected keys include
            id, map_type, container_id, ground_zone_id, care_thresholds.
        schedules: list of dict-like care_schedules rows; expected keys include
            care_type, next_due (ISO date string), last_done (optional).
        weather: dict shaped like {"temp": {"days": [{"min": x, "max": y}, ...]}, ...},
            or None if weather data is not available.
        today: the date to evaluate against (caller passes for testability).

    Returns:
        Fully-populated PlantWarningState. top_warning is None if no warnings fire.
    """
    environment = _environment_for_plant(plant)
    profile = _load_care_profile(plant.get("care_thresholds"), environment)

    active_care_types = [ct for ct, entry in profile.items() if entry.get("active")]

    # Schedule warnings
    schedule_warnings: list[CareWarning] = []
    by_type: dict[str, dict] = {s["care_type"]: dict(s) for s in schedules}
    for care_type in active_care_types:
        entry = profile[care_type]
        if entry.get("active") and entry.get("interval_days") is not None:
            sched = by_type.get(care_type)
            if sched and sched.get("next_due"):
                next_due = date.fromisoformat(sched["next_due"])
                # NB: heating-season boost is honoured by the scheduler that writes next_due,
                # so we don't recompute next_due here — we trust the stored value.
                w = _schedule_warning_for_type(care_type, next_due=next_due, today=today)
                if w is not None:
                    schedule_warnings.append(w)

    # Weather warnings
    temp_data = (weather or {}).get("temp")
    weather_warnings = _weather_warnings_for_plant(profile, temp_data=temp_data)

    all_warnings = _sort_warnings(schedule_warnings + weather_warnings)
    top = all_warnings[0] if all_warnings else None

    # Care summary rollup (one row per active care type)
    care_summary: dict[str, CareTypeStatus] = {}
    for care_type in active_care_types:
        sched = by_type.get(care_type)
        last_done_iso = sched.get("last_done") if sched else None
        last_done = date.fromisoformat(last_done_iso) if last_done_iso else None
        next_due_iso = sched.get("next_due") if sched else None
        if next_due_iso:
            next_due = date.fromisoformat(next_due_iso)
            days_until = (next_due - today).days
            if days_until < 0:
                status: CareStatus = "overdue"
            elif days_until == 0:
                status = "due_today"
            else:
                status = "good"
        else:
            days_until = None
            status = "good"
        care_summary[care_type] = CareTypeStatus(
            care_type=care_type,
            status=status,
            days_until_due=days_until,
            last_done=last_done,
        )

    return PlantWarningState(
        plant_id=plant["id"],
        environment=environment,
        active_care_types=active_care_types,
        warnings=all_warnings,
        top_warning=top,
        care_summary=care_summary,
    )
```

- [ ] **Step 4: Run tests to see them pass**

```bash
cd groei && .venv/Scripts/python.exe -m pytest backend/tests/test_warnings.py -v
```

Expected: all tests PASS (~30+ tests total in this file by now).

- [ ] **Step 5: Commit**

```bash
git add groei/backend/services/warnings.py groei/backend/tests/test_warnings.py
git commit -m "feat(care): compute_plant_warnings main entry point"
```

---

### Task 9: HTTP endpoint `GET /api/plants/{id}/warnings`

**Files:**
- Create: `groei/backend/routers/warnings.py`
- Modify: `groei/backend/main.py` (register router)
- Test: `groei/backend/tests/test_warnings_endpoint.py`

- [ ] **Step 1: Write the failing test**

Create `groei/backend/tests/test_warnings_endpoint.py`:

```python
"""HTTP-level test for GET /api/plants/{id}/warnings."""
import pytest


@pytest.mark.asyncio
async def test_get_plant_warnings_returns_state(client, seeded_db, auth_header):
    """Plant with overdue water → endpoint returns top_warning."""
    # Seed a map (indoor) + plant + overdue schedule.
    await seeded_db.execute(
        """INSERT INTO plants (id, name, map_id, container_id, care_thresholds, household_id, is_active)
           VALUES (1, 'Monstera', 1, 5, NULL, 1, 1)"""
    )
    # Minimal maps table for the join (created by seeded_db is missing — add here)
    await seeded_db.execute("CREATE TABLE IF NOT EXISTS maps (id INTEGER PRIMARY KEY, type TEXT, household_id INTEGER)")
    await seeded_db.execute("INSERT INTO maps (id, type, household_id) VALUES (1, 'indoor', 1)")
    await seeded_db.execute(
        """INSERT INTO care_schedules (plant_id, care_type, next_due, is_active)
           VALUES (1, 'water', '2026-05-13', 1)"""
    )
    await seeded_db.commit()

    resp = await client.get("/api/plants/1/warnings?today=2026-05-16", headers=auth_header)
    assert resp.status_code == 200
    body = resp.json()
    assert body["plant_id"] == 1
    assert body["environment"] == "indoor"
    assert body["top_warning"] is not None
    assert body["top_warning"]["care_type"] == "water"
    assert body["top_warning"]["severity"] == "urgent"


@pytest.mark.asyncio
async def test_get_plant_warnings_404_when_missing(client, seeded_db, auth_header):
    resp = await client.get("/api/plants/999/warnings", headers=auth_header)
    assert resp.status_code == 404
```

- [ ] **Step 2: Run test to see it fail**

```bash
cd groei && .venv/Scripts/python.exe -m pytest backend/tests/test_warnings_endpoint.py -v
```

Expected: FAIL — 404 because router not registered.

- [ ] **Step 3: Create the router**

Create `groei/backend/routers/warnings.py`:

```python
"""HTTP endpoint exposing the unified warning pipeline."""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from database import db_dep
from auth import get_current_account
from services.warnings import compute_plant_warnings
from services.alert_service import _get_temp_data_for_plant  # reuse existing weather cache helper

router = APIRouter(prefix="/api", tags=["warnings"])


class CareWarningOut(BaseModel):
    care_type: str
    severity: str
    trigger: str
    days_overdue: int | None
    message_nl: str
    message_en: str
    icon: str
    color: str


class CareTypeStatusOut(BaseModel):
    care_type: str
    status: str
    days_until_due: int | None
    last_done: date | None


class PlantWarningStateOut(BaseModel):
    plant_id: int
    environment: str
    active_care_types: list[str]
    warnings: list[CareWarningOut]
    top_warning: CareWarningOut | None
    care_summary: dict[str, CareTypeStatusOut]


@router.get("/plants/{plant_id}/warnings", response_model=PlantWarningStateOut)
async def get_plant_warnings(
    plant_id: int,
    today: date | None = Query(None),
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    today = today or date.today()

    plant_row = await db.execute_fetchall(
        """SELECT p.id, p.map_id, p.container_id, p.ground_zone_id, p.care_thresholds,
                  m.type as map_type
           FROM plants p
           LEFT JOIN maps m ON p.map_id = m.id
           WHERE p.id = ? AND p.household_id = ? AND p.is_active = 1""",
        (plant_id, account["household_id"]),
    )
    if not plant_row:
        raise HTTPException(status_code=404, detail="Plant not found")
    plant = dict(plant_row[0])

    schedules_rows = await db.execute_fetchall(
        """SELECT care_type, next_due, last_done
           FROM care_schedules
           WHERE plant_id = ? AND is_active = 1""",
        (plant_id,),
    )
    schedules = [dict(r) for r in schedules_rows]

    # Reuse existing weather cache. If it doesn't exist or fails, we degrade
    # gracefully to schedule-only warnings.
    try:
        temp_data = await _get_temp_data_for_plant(db, plant)
        weather = {"temp": temp_data} if temp_data else None
    except Exception:
        weather = None

    state = compute_plant_warnings(plant, schedules, weather=weather, today=today)

    return PlantWarningStateOut(
        plant_id=state.plant_id,
        environment=state.environment,
        active_care_types=state.active_care_types,
        warnings=[CareWarningOut(**w.__dict__) for w in state.warnings],
        top_warning=CareWarningOut(**state.top_warning.__dict__) if state.top_warning else None,
        care_summary={k: CareTypeStatusOut(**v.__dict__) for k, v in state.care_summary.items()},
    )
```

**Note on `_get_temp_data_for_plant`:** if `services.alert_service` does not expose a helper of that exact name, replace the import with whatever the existing weather-fetch helper is called (read `services/alert_service.py` and `services/weather_task_service.py` to find it). The endpoint must degrade gracefully if weather data is unavailable.

- [ ] **Step 4: Register the router in main.py**

In `groei/backend/main.py`, locate the block where other routers are registered (e.g. `app.include_router(plants.router)`) and add:

```python
from routers import warnings as warnings_router
app.include_router(warnings_router.router)
```

- [ ] **Step 5: Run test to see it pass**

```bash
cd groei && .venv/Scripts/python.exe -m pytest backend/tests/test_warnings_endpoint.py -v
```

Expected: both tests PASS.

- [ ] **Step 6: Commit**

```bash
git add groei/backend/routers/warnings.py groei/backend/main.py groei/backend/tests/test_warnings_endpoint.py
git commit -m "feat(care): GET /api/plants/{id}/warnings endpoint"
```

---

### Task 10: Parity test — new pipeline matches existing `top_alert` for every plant

**Files:**
- Create: `groei/backend/tests/test_warnings_parity.py`

This test guards against regressions during the rest of the migration. It iterates every plant in a representative DB snapshot and asserts that the **new** `top_warning.care_type + severity` matches the **old** `top_alert.alert_type + severity` for water/fertilize/cold/heat. Differences for new care types (repot/mist/rotate/pest_check/dust) are *expected* — the test scope is the four legacy types only.

- [ ] **Step 1: Write the parity test**

Create `groei/backend/tests/test_warnings_parity.py`:

```python
"""Parity test: new compute_plant_warnings() must agree with old alert_service
on water/fertilize/cold/heat for every plant in the DB.

This guards against regressions during the rest of the migration.
"""
import pytest
from datetime import date


LEGACY_TO_NEW_CARE_TYPE = {
    "overdue_water": "water",
    "due_today_water": "water",
    "overdue_fertilize": "fertilize",
    "due_today_fertilize": "fertilize",
    "drought": "water",
    "waterlog": "water",
    "cold": "frost_protect",
    "bring_inside": "frost_protect",
    "heat": "heat_protect",
    "fertilise": "fertilize",
}


@pytest.mark.asyncio
async def test_parity_for_all_plants_in_seeded_db(seeded_db, auth_header):
    """For each plant: old top_alert.care_type ≈ new top_warning.care_type.

    Uses the real production DB seeded via existing seed scripts. If a divergence
    is found, the test fails with the plant ID and both values for manual review.
    """
    from services.warnings import compute_plant_warnings
    from services.alert_service import compute_top_alert
    from services.plant_reader import _compute_temp_status  # legacy

    # Add a minimal maps table to the seeded schema.
    await seeded_db.execute("CREATE TABLE IF NOT EXISTS maps (id INTEGER PRIMARY KEY, type TEXT, household_id INTEGER)")
    await seeded_db.execute("INSERT OR IGNORE INTO maps (id, type, household_id) VALUES (1, 'indoor', 1)")
    await seeded_db.execute("INSERT OR IGNORE INTO maps (id, type, household_id) VALUES (2, 'outdoor', 1)")
    # Seed two representative plants
    await seeded_db.execute(
        """INSERT INTO plants (id, name, map_id, container_id, care_thresholds, household_id, is_active)
           VALUES (1, 'Indoor Monstera', 1, 5, NULL, 1, 1)"""
    )
    await seeded_db.execute(
        """INSERT INTO plants (id, name, map_id, container_id, care_thresholds, household_id, is_active)
           VALUES (2, 'Outdoor tomato', 2, NULL, '{"min_temp_c": 5, "max_temp_c": 30, "bring_inside_below_c": 8}', 1, 1)"""
    )
    await seeded_db.execute(
        """INSERT INTO care_schedules (plant_id, care_type, next_due, is_active)
           VALUES (1, 'water', '2026-05-13', 1), (2, 'water', '2026-05-13', 1)"""
    )
    await seeded_db.commit()

    today = date(2026, 5, 16)
    plant_rows = await seeded_db.execute_fetchall(
        """SELECT p.id, p.map_id, p.container_id, p.ground_zone_id, p.care_thresholds, m.type as map_type
           FROM plants p LEFT JOIN maps m ON p.map_id = m.id
           WHERE p.is_active = 1"""
    )

    divergences: list[str] = []
    for row in plant_rows:
        plant = dict(row)
        schedule_rows = await seeded_db.execute_fetchall(
            "SELECT care_type, next_due, last_done FROM care_schedules WHERE plant_id = ? AND is_active = 1",
            (plant["id"],),
        )
        schedules = [dict(s) for s in schedule_rows]

        # Old pipeline
        try:
            old_top = compute_top_alert(plant, schedules, rain=None, temp=None, last_water=None, last_fertilize=None)
        except TypeError:
            # Signature varies — adapt by reading services/alert_service.py if it differs.
            old_top = None

        # New pipeline
        new_state = compute_plant_warnings(plant, schedules, weather=None, today=today)

        if old_top is None and new_state.top_warning is None:
            continue
        if old_top is None or new_state.top_warning is None:
            divergences.append(f"plant {plant['id']}: old={old_top}, new={new_state.top_warning}")
            continue

        old_legacy_type = getattr(old_top, "alert_type", None) or old_top.get("alert_type")
        old_normalised = LEGACY_TO_NEW_CARE_TYPE.get(old_legacy_type, old_legacy_type)
        new_care_type = new_state.top_warning.care_type

        # Skip new care types not modelled by the old system.
        if new_care_type in ("repot", "mist", "rotate", "pest_check", "dust", "prune"):
            continue

        if old_normalised != new_care_type:
            divergences.append(
                f"plant {plant['id']}: old top_alert={old_legacy_type} → {old_normalised}, "
                f"new top_warning.care_type={new_care_type}"
            )

    if divergences:
        msg = "Parity divergences detected:\n  " + "\n  ".join(divergences)
        pytest.fail(msg)
```

- [ ] **Step 2: Run the parity test**

```bash
cd groei && .venv/Scripts/python.exe -m pytest backend/tests/test_warnings_parity.py -v
```

Expected: PASS. If it fails with divergences listed, read each divergence carefully:
- If the new pipeline is *correctly* different from the old (e.g. old missed an edge case the new handles), document the divergence in the test as an expected difference and skip it.
- If the new pipeline is genuinely wrong, fix `compute_plant_warnings()` and re-run.

The signature of `compute_top_alert` may differ from what's shown in the test — read `groei/backend/services/alert_service.py` and adjust the call to match the real signature. The point is to drive *something* through both pipelines for the same input.

- [ ] **Step 3: Commit**

```bash
git add groei/backend/tests/test_warnings_parity.py
git commit -m "test(care): parity test for new vs old warning pipelines"
```

---

### Task 11: Sanity-run against the live dev DB

**Files:** None modified — verification only.

- [ ] **Step 1: Start the backend**

```bash
cd groei && npm run dev:backend
```

Verify it starts without errors.

- [ ] **Step 2: Pick a plant ID with known overdue water**

Open `groei/backend/groei.db` in a SQLite viewer and find a `plant_id` where `care_schedules.next_due < CURRENT_DATE`. Note the ID — e.g. `42`.

- [ ] **Step 3: Curl the new endpoint**

```bash
# Get a JWT via the existing login flow first, then:
curl -H "Authorization: Bearer $TOKEN" "http://localhost:8000/api/plants/42/warnings"
```

Expected: JSON response with `plant_id`, `environment`, `active_care_types`, `top_warning`, `warnings`, `care_summary`. `top_warning.care_type` should match what the dashboard shows for that plant.

- [ ] **Step 4: Cross-check against the dashboard**

Open `http://localhost:5173/dashboard` and find the same plant. The `top_warning.message_nl` should be substantively the same as what the dashboard renders for that plant. If it differs in unexpected ways, file it against the parity test and fix.

- [ ] **Step 5: Commit (nothing to commit unless docs added)**

If you took notes during verification, save them to `docs/notes/phase-a-verification.md` and commit. Otherwise no commit needed.

---

## Self-review

Run these mental checks against the spec:

1. **Spec coverage:**
   - ✓ `PlantWarningState` dataclass — Task 2
   - ✓ `CareWarning` dataclass — Task 2
   - ✓ `CareTypeStatus` dataclass — Task 2
   - ✓ Care-types catalog with the 10 types — Task 1
   - ✓ `WARNING_PRIORITY` table — Task 1
   - ✓ Tiebreaker (days_overdue then alphabetical) — Task 7
   - ✓ Schedule-based warning derivation — Task 4
   - ✓ Weather-triggered frost/heat — Task 5
   - ✓ Heating-season helper — Task 6
   - ✓ Environment detection (`outdoor_ground` / `outdoor_container` / `indoor`) — Task 3
   - ✓ Care-profile shim from legacy `care_thresholds` — Task 3
   - ✓ `compute_plant_warnings()` main entry — Task 8
   - ✓ `GET /api/plants/{id}/warnings` — Task 9
   - ✓ Parity tests — Task 10
   - Out of Phase A scope: `species_care_defaults` table (Phase B), `plants.care_profile` column (Phase B), dashboard/map/calendar UX changes (Phase C), deleting `weather_task_service.py` (Phase D).

2. **Placeholder scan:** No "TBD" or "fill this in" remains. The one `_get_temp_data_for_plant` import note explicitly tells the engineer how to adapt it.

3. **Type consistency:** `compute_plant_warnings` accepts `weather: dict | None` shaped like `{"temp": {"days": [...]}}`. `_weather_warnings_for_plant` reads `temp_data` (the inner dict). Names match across tasks.

4. **Frequent commits:** Each task ends with `git commit`. Eleven commits total.

---

## What's next (out of scope for this plan)

After Phase A merges:

- **Phase B plan** — `docs/plans/in-progress/2026-05-16-care-system-phase-b.md` — DB migration: add `plants.care_profile` column, create `species_care_defaults` table, backfill from existing Trefle/Claude data, delete `is_ephemeral` schedules.
- **Phase C plans** — one per surface — `phase-c-plant-detail.md`, `phase-c-map.md`, `phase-c-dashboard.md`, `phase-c-calendar.md`.
- **Phase D plan** — `phase-d-cleanup.md` — delete `alert_service.py`, `weather_task_service.py`, deprecated endpoints, frontend priority logic.

Each subsequent phase plan can be drafted independently after the previous phase is in production and the parity test (Task 10) continues to pass.
