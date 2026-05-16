"""Unit tests for the unified care warning pipeline."""
from datetime import date
from services.warnings import PlantWarningState, CareWarning, CareTypeStatus
from services.warnings import _environment_for_plant, _load_care_profile
from services.warnings import _schedule_warning_for_type


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


def test_load_care_profile_invalid_json_does_not_raise():
    """Malformed JSON should yield a complete 10-key profile, not raise."""
    profile = _load_care_profile("{not json", environment="outdoor_ground")
    assert len(profile) == 10
    assert "water" in profile
    assert profile["water"]["active"] is True
    # Thresholds dict present but with None values (legacy parse failed silently).
    assert profile["frost_protect"]["thresholds"]["min_temp_c"] is None


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
