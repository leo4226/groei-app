from datetime import date, timedelta

import pytest

from services.water_pressure import WeatherDay, calculate_water_pressure


TODAY = date(2026, 7, 16)


def _days(
    *,
    max_temp: float,
    et0: float,
    rain: dict[int, float] | None = None,
    humidity: dict[int, float] | None = None,
    soil: dict[int, float] | None = None,
):
    rain = rain or {}
    humidity = humidity or {}
    soil = soil or {}
    return [
        WeatherDay(
            date=TODAY + timedelta(days=offset),
            max_temp_c=max_temp,
            precipitation_mm=rain.get(offset, 0.0),
            et0_mm=et0,
            humidity_pct=humidity.get(offset),
            soil_moisture_pct=soil.get(offset),
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

# ── Mulch factor (#799) ──────────────────────────────────────────────────────


def test_mulched_ground_scores_lower_than_bare_in_dry_weather():
    bare = calculate_water_pressure(
        environment="outdoor_ground",
        today=TODAY,
        next_due=TODAY + timedelta(days=4),
        weather_days=_days(max_temp=31, et0=5.0),
    )
    mulched = calculate_water_pressure(
        environment="outdoor_ground",
        today=TODAY,
        next_due=TODAY + timedelta(days=4),
        weather_days=_days(max_temp=31, et0=5.0),
        mulch=True,
    )

    assert mulched.score < bare.score
    assert mulched.factors["mulch"] is True
    assert mulched.factors["mulch_demand_factor"] == 0.9
    # The mulch note explains the reduction in both languages.
    assert "mulch" in mulched.reason_nl.lower()
    assert "mulch" in mulched.reason_en.lower()


def test_mulched_container_slightly_lowers_pressure():
    bare = calculate_water_pressure(
        environment="outdoor_container",
        today=TODAY,
        next_due=TODAY + timedelta(days=4),
        weather_days=_days(max_temp=31, et0=5.0),
    )
    mulched = calculate_water_pressure(
        environment="outdoor_container",
        today=TODAY,
        next_due=TODAY + timedelta(days=4),
        weather_days=_days(max_temp=31, et0=5.0),
        mulch=True,
    )

    assert mulched.score < bare.score
    assert mulched.factors["mulch_demand_factor"] == 0.95


def test_mulch_unknown_or_bare_is_neutral():
    bare = calculate_water_pressure(
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
        mulch=None,
    )
    explicit_bare = calculate_water_pressure(
        environment="outdoor_ground",
        today=TODAY,
        next_due=TODAY + timedelta(days=4),
        weather_days=_days(max_temp=31, et0=5.0),
        mulch=False,
    )

    assert unknown.score == bare.score
    assert explicit_bare.score == bare.score
    assert unknown.factors["mulch"] is False
    assert "mulch" not in unknown.reason_nl.lower()


@pytest.mark.parametrize("environment", ["outdoor_ground", "outdoor_container"])
def test_mulch_never_moves_recommendation_later(environment):
    due = TODAY + timedelta(days=2)
    result = calculate_water_pressure(
        environment=environment,
        today=TODAY,
        next_due=due,
        weather_days=_days(max_temp=34, et0=7.0),
        mulch=True,
    )

    assert result.recommended_check_date <= due


def test_dry_air_raises_pressure_more_than_humid_day():
    humid = calculate_water_pressure(
        environment="outdoor_container",
        today=TODAY,
        next_due=TODAY + timedelta(days=4),
        weather_days=_days(max_temp=28, et0=4.0, humidity={i: 70.0 for i in range(-3, 4)}),
    )
    dry = calculate_water_pressure(
        environment="outdoor_container",
        today=TODAY,
        next_due=TODAY + timedelta(days=4),
        weather_days=_days(max_temp=28, et0=4.0, humidity={i: 35.0 for i in range(-3, 4)}),
    )

    assert dry.score > humid.score
    assert dry.factors["humidity_boost_mm"] > 0.0
    assert humid.factors["humidity_boost_mm"] == 0.0
    assert "dry air" in dry.reason_en.lower()
    assert "droge lucht" in dry.reason_nl.lower()


def test_wet_soil_suppresses_ground_deficit():
    dry_soil = calculate_water_pressure(
        environment="outdoor_ground",
        today=TODAY,
        next_due=TODAY + timedelta(days=5),
        weather_days=_days(max_temp=28, et0=4.5, soil={i: 15.0 for i in range(-3, 4)}),
    )
    wet_soil = calculate_water_pressure(
        environment="outdoor_ground",
        today=TODAY,
        next_due=TODAY + timedelta(days=5),
        weather_days=_days(max_temp=28, et0=4.5, soil={i: 45.0 for i in range(-3, 4)}),
    )

    assert wet_soil.score < dry_soil.score
    assert wet_soil.factors["soil_suppression_factor"] > 0.0
    assert dry_soil.factors["soil_suppression_factor"] == 0.0
    assert "moist soil" in wet_soil.reason_en.lower()
    assert "vochtige grond" in wet_soil.reason_nl.lower()


def test_soil_moisture_does_not_suppress_container_pressure():
    result = calculate_water_pressure(
        environment="outdoor_container",
        today=TODAY,
        next_due=TODAY + timedelta(days=4),
        weather_days=_days(max_temp=28, et0=4.0, soil={i: 45.0 for i in range(-3, 4)}),
    )

    assert result.factors["soil_suppression_factor"] == 0.0
    assert result.reason_en == "Warm, dry weather is making this outdoor container dry out faster."


def test_missing_humidity_and_soil_are_neutral():
    baseline = calculate_water_pressure(
        environment="outdoor_container",
        today=TODAY,
        next_due=TODAY + timedelta(days=4),
        weather_days=_days(max_temp=31, et0=5.0),
    )
    explicit_none = calculate_water_pressure(
        environment="outdoor_container",
        today=TODAY,
        next_due=TODAY + timedelta(days=4),
        weather_days=[
            WeatherDay(
                date=TODAY + timedelta(days=offset),
                max_temp_c=31.0,
                precipitation_mm=0.0,
                et0_mm=5.0,
                humidity_pct=None,
                soil_moisture_pct=None,
            )
            for offset in range(-3, 4)
        ],
    )

    assert baseline.factors["humidity_boost_mm"] == 0.0
    assert baseline.factors["soil_suppression_factor"] == 0.0
    assert baseline.factors["avg_humidity_pct"] == 0.0
    assert explicit_none == baseline


@pytest.mark.parametrize("days_until_due", [-2, 0, 1, 7])
def test_recommendation_never_moves_later_than_saved_due_with_new_factors(days_until_due: int):
    due = TODAY + timedelta(days=days_until_due)
    result = calculate_water_pressure(
        environment="outdoor_ground",
        today=TODAY,
        next_due=due,
        weather_days=_days(
            max_temp=34,
            et0=7.0,
            humidity={i: 30.0 for i in range(-3, 4)},
            soil={i: 12.0 for i in range(-3, 4)},
        ),
    )

    assert result.recommended_check_date <= due
