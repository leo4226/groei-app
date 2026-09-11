"""Can the app say "not yet — it's still wet"?

The warning that matters is the one you believe. A watering reminder that fires
on the calendar alone, in a week it rained every day, is one you learn to swipe
away — and the habit does not stay confined to that warning. So this is really a
test about which claims the app is allowed to make: it may hold a due watering
back on measured evidence, and it may not hold one back on a guess.
"""
from datetime import date, timedelta

from services.warnings import compute_plant_warnings
from services.water_pressure import WeatherDay, assess_moisture


TODAY = date(2026, 6, 20)


def _days(specs: list[dict]) -> list[WeatherDay]:
    """Build a window ending today; specs are listed oldest first."""
    count = len(specs)
    return [
        WeatherDay(
            date=TODAY - timedelta(days=count - 1 - index),
            max_temp_c=spec.get("max_temp_c", 18.0),
            precipitation_mm=spec.get("rain", 0.0),
            et0_mm=spec.get("et0", 3.0),
            humidity_pct=spec.get("humidity"),
            soil_moisture_pct=spec.get("soil"),
        )
        for index, spec in enumerate(specs)
    ]


WET_WEEK = [{"rain": 9.0, "et0": 0.8, "max_temp_c": 15.0}] * 5
DRY_WEEK = [{"rain": 0.0, "et0": 4.5, "max_temp_c": 27.0}] * 5


# ── The assessment on its own ────────────────────────────────────────────────

def test_a_week_of_rain_leaves_an_outdoor_pot_still_wet():
    result = assess_moisture(
        environment="outdoor_container",
        today=TODAY,
        last_watered=None,
        weather_days=_days(WET_WEEK),
    )

    assert result.verdict == "moist"
    assert result.store_fraction >= 0.5
    assert result.reason_nl and result.reason_en, "both languages, always"


def test_a_hot_dry_week_does_not():
    result = assess_moisture(
        environment="outdoor_container",
        today=TODAY,
        last_watered=TODAY - timedelta(days=5),
        weather_days=_days(DRY_WEEK),
    )

    assert result.verdict == "drying"


def test_watering_today_fills_the_root_zone():
    """The most ordinary case of a wrong warning: you watered this morning and
    the app asks you to water."""
    result = assess_moisture(
        environment="outdoor_container",
        today=TODAY,
        last_watered=TODAY,
        weather_days=_days(DRY_WEEK),
    )

    assert result.verdict == "moist"


def test_a_watering_older_than_the_window_counts_for_nothing():
    """Water put in nine days ago has been spent. Treating an old date as a
    full pot would suppress the warning exactly when it is most right."""
    result = assess_moisture(
        environment="outdoor_container",
        today=TODAY,
        last_watered=TODAY - timedelta(days=9),
        weather_days=_days(DRY_WEEK),
    )

    assert result.verdict == "drying"


def test_the_order_of_the_weather_changes_the_answer():
    """Rain then heat is not the same as heat then rain, and a window average
    cannot tell them apart. The second soil is wet; the first has dried again."""
    heat_last = _days([
        {"rain": 20.0, "et0": 0.5, "max_temp_c": 14.0},
        {"rain": 0.0, "et0": 6.0, "max_temp_c": 32.0},
        {"rain": 0.0, "et0": 6.0, "max_temp_c": 32.0},
    ])
    rain_last = _days([
        {"rain": 0.0, "et0": 6.0, "max_temp_c": 32.0},
        {"rain": 0.0, "et0": 6.0, "max_temp_c": 32.0},
        {"rain": 20.0, "et0": 0.5, "max_temp_c": 14.0},
    ])

    assert assess_moisture(
        environment="outdoor_container", today=TODAY,
        last_watered=None, weather_days=heat_last,
    ).verdict == "drying"
    assert assess_moisture(
        environment="outdoor_container", today=TODAY,
        last_watered=None, weather_days=rain_last,
    ).verdict == "moist"


def test_a_measured_wet_topsoil_settles_it_for_open_ground():
    """Open ground has a real 0-7cm reading. A measurement outranks a model,
    and this is the one branch that is not an estimate at all."""
    result = assess_moisture(
        environment="outdoor_ground",
        today=TODAY,
        last_watered=None,
        weather_days=_days(DRY_WEEK[:-1] + [{"rain": 0.0, "et0": 4.5, "soil": 41.0}]),
    )

    assert result.verdict == "moist"
    assert result.factors["source"] == "soil_measurement"


def test_indoors_the_honest_answer_is_that_we_do_not_know():
    """A pot next to a radiator dries on its own schedule. Reading it off the
    outdoor forecast would suppress every indoor reminder from November on —
    a wrong warning replaced by a wrong silence."""
    result = assess_moisture(
        environment="indoor",
        today=TODAY,
        last_watered=TODAY,
        weather_days=_days(WET_WEEK),
    )

    assert result.verdict == "unknown"


def test_stale_readings_are_no_evidence():
    """Nothing is suppressed on data that does not reach today: last week's rain
    is not a claim about this morning's soil."""
    stale = [
        WeatherDay(date=TODAY - timedelta(days=9), max_temp_c=14.0,
                   precipitation_mm=30.0, et0_mm=0.4),
    ]

    result = assess_moisture(
        environment="outdoor_container", today=TODAY,
        last_watered=None, weather_days=stale,
    )

    assert result.verdict == "unknown"


# ── What the plant page and the dashboard actually show ──────────────────────

def _plant(**overrides) -> dict:
    return {
        "id": 1,
        "map_type": "outdoor",
        "container_id": 7,
        "ground_zone_id": None,
        "care_thresholds": '{"drought_mm_per_week": 15}',
        **overrides,
    }


def _weather(specs, **extra) -> dict:
    return {
        "forecast_days": [
            {
                "date": day.date.isoformat(),
                "max_temp_c": day.max_temp_c,
                "precipitation_mm": day.precipitation_mm,
                "et0_mm": day.et0_mm,
                "humidity_pct": day.humidity_pct,
                "soil_moisture_pct": day.soil_moisture_pct,
            }
            for day in _days(specs)
        ],
        **extra,
    }


def _water_schedule(days_overdue: int) -> list[dict]:
    return [{
        "care_type": "water",
        "next_due": TODAY - timedelta(days=days_overdue),
        "last_done": TODAY - timedelta(days=days_overdue + 4),
    }]


def test_an_overdue_watering_turns_into_the_reason_it_can_wait():
    state = compute_plant_warnings(
        _plant(), _water_schedule(2), weather=_weather(WET_WEEK), today=TODAY,
    )

    water = [w for w in state.warnings if w.care_type == "water"]
    assert [w.code for w in water] == ["water_still_moist"]
    assert water[0].severity == "info"
    assert "vochtig" in water[0].message_nl
    assert "moist" in water[0].message_en
    assert water[0].days_overdue == 2, "how late it is stays visible"


def test_a_dry_week_still_says_water_it():
    """The inversion has to be able to turn back, or it is just a mute button."""
    state = compute_plant_warnings(
        _plant(), _water_schedule(2), weather=_weather(DRY_WEEK), today=TODAY,
    )

    water = [w for w in state.warnings if w.care_type == "water"]
    assert water[0].code is None
    assert water[0].severity in ("warning", "urgent")
    assert water[0].trigger == "schedule_overdue"


def test_without_the_daily_readings_nothing_changes():
    """Callers that only pass the garden-wide totals must behave exactly as
    before — a missing key is not a wet plant."""
    state = compute_plant_warnings(
        _plant(), _water_schedule(2),
        weather={"rain": {"total_7day_mm": 40.0, "total_14day_mm": 80.0}},
        today=TODAY,
    )

    water = [w for w in state.warnings if w.care_type == "water"]
    assert water[0].trigger == "schedule_overdue"


def test_still_moist_never_outranks_a_real_warning():
    """It is advice, not an alarm. A frost warning on the same plant has to
    stay the headline."""
    plant = _plant(care_thresholds='{"min_temp_c": 0, "drought_mm_per_week": 15}')
    weather = _weather(
        WET_WEEK,
        temp={"days": [{"date": TODAY.isoformat(), "min": -4, "max": 3}]},
    )

    state = compute_plant_warnings(plant, _water_schedule(2), weather=weather, today=TODAY)

    assert state.top_warning is not None
    assert state.top_warning.care_type == "frost_protect"


def test_the_garden_wide_drought_warning_does_not_contradict_it():
    """"Very little rain" and "still moist" on one plant is the contradiction
    that teaches people to trust neither line."""
    weather = _weather(
        WET_WEEK,
        rain={"total_7day_mm": 1.0, "total_14day_mm": 2.0},
    )

    state = compute_plant_warnings(_plant(), _water_schedule(1), weather=weather, today=TODAY)

    codes = {w.code for w in state.warnings if w.care_type == "water"}
    assert codes == {"water_still_moist"}


def test_the_schedule_itself_is_not_rewritten():
    """Read-side only. The plant really is due, and the care summary keeps
    saying so — the warning explains why it can wait, it does not move the
    deadline, and one wet week must not silently push the plant a week out."""
    state = compute_plant_warnings(
        _plant(), _water_schedule(3), weather=_weather(WET_WEEK), today=TODAY,
    )

    assert state.care_summary["water"].status == "overdue"
    assert state.care_summary["water"].days_until_due == -3


def test_a_still_moist_plant_is_not_counted_as_needing_attention():
    """The whole point: it drops out of the "do something now" list."""
    state = compute_plant_warnings(
        _plant(), _water_schedule(2), weather=_weather(WET_WEEK), today=TODAY,
    )

    assert not any(w.severity in ("urgent", "warning") for w in state.warnings)


def test_a_timestamp_watering_date_still_matches_a_calendar_day():
    """`care_schedules.last_done` is a TIMESTAMP, so the database hands back a
    datetime — which is an instance of `date` and yet equals no day in the
    window. Left uncoerced, every watering reads as "never watered" and the
    feature quietly does nothing."""
    from datetime import datetime

    schedule = [{
        "care_type": "water",
        "next_due": TODAY - timedelta(days=1),
        "last_done": datetime(TODAY.year, TODAY.month, TODAY.day, 9, 30),
    }]

    state = compute_plant_warnings(
        _plant(), schedule, weather=_weather(DRY_WEEK), today=TODAY,
    )

    water = [w for w in state.warnings if w.care_type == "water"]
    assert water[0].code == "water_still_moist", "watered this morning"
