"""Unit tests for the unified care warning pipeline."""
from datetime import date
from services.warnings import PlantWarningState, CareWarning, CareTypeStatus
from services.warnings import _environment_for_plant, _load_care_profile
from services.warnings import _schedule_warning_for_type
from services.warnings import _weather_warnings_for_plant


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
