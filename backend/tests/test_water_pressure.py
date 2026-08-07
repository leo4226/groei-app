from datetime import date, timedelta

import pytest

from services.water_pressure import WeatherDay, calculate_water_pressure


TODAY = date(2026, 7, 16)


def _days(*, max_temp: float, et0: float, rain: dict[int, float] | None = None):
    rain = rain or {}
    return [
        WeatherDay(
            date=TODAY + timedelta(days=offset),
            max_temp_c=max_temp,
            precipitation_mm=rain.get(offset, 0.0),
            et0_mm=et0,
        )
        for offset in range(-3, 4)
    ]


def test_hot_dry_outdoor_container_recommends_check_today():
    result = calculate_water_pressure(
        environment="outdoor_container",
        today=TODAY,
        next_due=TODAY + timedelta(days=4),
        weather_days=_days(max_temp=31, et0=5.0),
    )

    assert result.level == "high"
    assert result.recommended_check_date == TODAY
    assert result.factors["effective_rain_mm"] == 0.0
    assert result.reason_en == "Warm, dry weather is making this outdoor container dry out faster."
    assert result.reason_nl == "Warm en droog weer laat deze buitenpot sneller uitdrogen."
    assert "mm" not in result.reason_en


def test_rooted_ground_after_rain_keeps_saved_due_date():
    result = calculate_water_pressure(
        environment="outdoor_ground",
        today=TODAY,
        next_due=TODAY + timedelta(days=5),
        weather_days=_days(max_temp=23, et0=2.0, rain={-1: 18.0, 1: 8.0}),
    )

    assert result.level == "normal"
    assert result.recommended_check_date == TODAY + timedelta(days=5)
    assert result.factors["effective_rain_mm"] > result.factors["drying_demand_mm"]
    assert result.reason_en == "Rain is covering the expected drying."
    assert result.reason_nl == "De regen compenseert de verwachte uitdroging."


def test_sustained_warmth_raises_indoor_pressure_using_explicit_proxy():
    result = calculate_water_pressure(
        environment="indoor",
        today=TODAY,
        next_due=TODAY + timedelta(days=6),
        weather_days=_days(max_temp=30, et0=6.0, rain={0: 40.0}),
    )

    assert result.level == "high"
    assert result.recommended_check_date == TODAY
    assert result.factors["effective_rain_mm"] == 0.0
    assert "rough guide" in result.reason_en.lower()
    assert "ruwe indicatie" in result.reason_nl.lower()


def test_forecast_rain_suppresses_extra_outdoor_check():
    result = calculate_water_pressure(
        environment="outdoor_container",
        today=TODAY,
        next_due=TODAY + timedelta(days=5),
        weather_days=_days(max_temp=24, et0=3.0, rain={1: 30.0}),
    )

    assert result.level == "normal"
    assert result.recommended_check_date == TODAY + timedelta(days=5)


def test_missing_weather_is_neutral_and_keeps_saved_due_date():
    due = TODAY + timedelta(days=3)
    result = calculate_water_pressure(
        environment="outdoor_container",
        today=TODAY,
        next_due=due,
        weather_days=[],
    )

    assert result.level == "unknown"
    assert result.recommended_check_date == due
    assert result.score == 0.0


def test_due_or_overdue_schedule_is_not_escalated_by_weather():
    due = TODAY - timedelta(days=2)
    result = calculate_water_pressure(
        environment="outdoor_container",
        today=TODAY,
        next_due=due,
        weather_days=_days(max_temp=34, et0=7.0),
    )

    assert result.level == "normal"
    assert result.score == 0.0
    assert result.recommended_check_date == due
    assert "already due" in result.reason_en.lower()


@pytest.mark.parametrize("days_until_due", [-2, 0, 1, 7])
def test_recommendation_never_moves_later_than_saved_due(days_until_due: int):
    due = TODAY + timedelta(days=days_until_due)
    result = calculate_water_pressure(
        environment="outdoor_container",
        today=TODAY,
        next_due=due,
        weather_days=_days(max_temp=34, et0=7.0),
    )

    assert result.recommended_check_date <= due


# ── #800: per-plant shade / exposure ──────────────────────────────────────────


def test_shaded_outdoor_plant_scores_lower_than_identical_full_sun():
    """A plant in shade must dry slower than an identical plant in full sun."""
    sun_result = calculate_water_pressure(
        environment="outdoor_ground",
        today=TODAY,
        next_due=TODAY + timedelta(days=4),
        weather_days=_days(max_temp=31, et0=5.0),
        exposure="sun",
    )
    shade_result = calculate_water_pressure(
        environment="outdoor_ground",
        today=TODAY,
        next_due=TODAY + timedelta(days=4),
        weather_days=_days(max_temp=31, et0=5.0),
        exposure="shade",
    )

    assert shade_result.score < sun_result.score
    assert shade_result.level != "high" or sun_result.level == "high"
    assert shade_result.factors["exposure"] == "shade"
    assert shade_result.factors["exposure_multiplier"] < 1.0
    assert sun_result.factors["exposure_multiplier"] == 1.0
    # Shade reason copy mentions slower drying
    assert "minder snel" in shade_result.reason_nl
    assert "more slowly" in shade_result.reason_en


def test_partial_shade_outdoor_plant_scores_between_sun_and_shade():
    sun_result = calculate_water_pressure(
        environment="outdoor_container",
        today=TODAY,
        next_due=TODAY + timedelta(days=4),
        weather_days=_days(max_temp=28, et0=4.0),
        exposure="sun",
    )
    partial_result = calculate_water_pressure(
        environment="outdoor_container",
        today=TODAY,
        next_due=TODAY + timedelta(days=4),
        weather_days=_days(max_temp=28, et0=4.0),
        exposure="partial",
    )
    shade_result = calculate_water_pressure(
        environment="outdoor_container",
        today=TODAY,
        next_due=TODAY + timedelta(days=4),
        weather_days=_days(max_temp=28, et0=4.0),
        exposure="shade",
    )

    assert partial_result.score < sun_result.score
    assert shade_result.score < partial_result.score
    assert partial_result.factors["exposure_multiplier"] < 1.0
    assert partial_result.factors["exposure_multiplier"] > shade_result.factors["exposure_multiplier"]


def test_unknown_exposure_is_neutral():
    """Missing/None exposure must not change anything vs an unset call."""
    baseline = calculate_water_pressure(
        environment="outdoor_ground",
        today=TODAY,
        next_due=TODAY + timedelta(days=4),
        weather_days=_days(max_temp=31, et0=5.0),
    )
    unknown = calculate_water_pressure(
        environment="outdoor_ground",
        today=TODAY,
        next_due=TODAY + timedelta(days=4),
        weather_days=_days(max_temp=31, et0=5.0),
        exposure=None,
    )

    assert baseline.score == unknown.score
    assert baseline.reason_en == unknown.reason_en
    assert unknown.factors["exposure_multiplier"] == 1.0
    assert "exposure" not in unknown.reason_en


def test_exposure_does_not_change_indoor_proxy_pressure():
    """Indoor is driven by temperature proxy — shade is an outdoor-only term."""
    indoor = calculate_water_pressure(
        environment="indoor",
        today=TODAY,
        next_due=TODAY + timedelta(days=6),
        weather_days=_days(max_temp=30, et0=6.0, rain={0: 40.0}),
        exposure="shade",
    )
    baseline = calculate_water_pressure(
        environment="indoor",
        today=TODAY,
        next_due=TODAY + timedelta(days=6),
        weather_days=_days(max_temp=30, et0=6.0, rain={0: 40.0}),
    )

    assert indoor.score == baseline.score
    assert indoor.reason_en == baseline.reason_en
