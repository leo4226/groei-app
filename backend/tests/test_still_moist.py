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


def _days(specs: list[dict], anchor: date = TODAY) -> list[WeatherDay]:
    """Build a window ending on `anchor`; specs are listed oldest first.

    The anchor matters: `assess_moisture` returns "unknown" unless the readings
    reach the day being asked about, so a window built around the wrong date
    makes a test pass for the wrong reason.
    """
    count = len(specs)
    return [
        WeatherDay(
            date=anchor - timedelta(days=count - 1 - index),
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


def _weather(specs, anchor: date = TODAY, **extra) -> dict:
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
            for day in _days(specs, anchor)
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


# ── The phone, not just the screen ───────────────────────────────────────────
#
# The screens learned to say "nog niet gieten" first. A push that contradicts
# the plant page is worse than either alone, and the push is the one that wakes
# you up, so this is the half that actually stops the nagging.

import pytest

from services.digest import hold_still_moist_water_rows


class _ForecastDb:
    """Just enough db for the hold: one outdoor map with coordinates."""

    def __init__(self, *, has_coordinates: bool = True):
        self.has_coordinates = has_coordinates

    async def execute_fetchall(self, query, params=()):
        if "FROM maps" in query:
            return [{
                "id": 1, "map_type": "outdoor",
                "lat": 52.3715 if self.has_coordinates else None,
                "lon": 4.8499 if self.has_coordinates else None,
            }]
        return []


def _due_row(row_id: int, **overrides) -> dict:
    return {
        "id": row_id,
        "care_type": "water",
        "next_due": TODAY - timedelta(days=1),
        "last_done": TODAY - timedelta(days=5),
        "is_ephemeral": 0,
        "plant_name": "Hortensia",
        "container_id": 9,
        "ground_zone_id": None,
        "mulch": None,
        "measured_sun_hours": None,
        "map_type": "outdoor",
        "map_id": 1,
        **overrides,
    }


def _patch_forecast(monkeypatch, specs):
    async def fake(lat, lon):
        return [
            {
                "date": day.date.isoformat(),
                "max_temp_c": day.max_temp_c,
                "precipitation_mm": day.precipitation_mm,
                "et0_mm": day.et0_mm,
                "humidity_pct": day.humidity_pct,
                "soil_moisture_pct": day.soil_moisture_pct,
            }
            for day in _days(specs)
        ]
    monkeypatch.setattr("services.weather_forecast.get_usable_forecast_days", fake)


@pytest.mark.asyncio
async def test_a_wet_week_holds_the_watering_push(monkeypatch):
    _patch_forecast(monkeypatch, WET_WEEK)

    kept = await hold_still_moist_water_rows(_ForecastDb(), 1, [_due_row(1)], TODAY)

    assert kept == []


@pytest.mark.asyncio
async def test_a_dry_week_still_buzzes(monkeypatch):
    _patch_forecast(monkeypatch, DRY_WEEK)

    kept = await hold_still_moist_water_rows(_ForecastDb(), 1, [_due_row(1)], TODAY)

    assert [row["id"] for row in kept] == [1]


@pytest.mark.asyncio
async def test_only_the_watering_is_held(monkeypatch):
    """Holding a fertilise or repot reminder because it rained would be
    nonsense, and muting the whole push is how one wrong rule becomes silence
    about everything."""
    _patch_forecast(monkeypatch, WET_WEEK)
    rows = [_due_row(1), _due_row(2, care_type="fertilize"), _due_row(3, care_type="prune")]

    kept = await hold_still_moist_water_rows(_ForecastDb(), 1, rows, TODAY)

    assert [row["id"] for row in kept] == [2, 3]


@pytest.mark.asyncio
async def test_an_indoor_plant_is_never_held(monkeypatch):
    _patch_forecast(monkeypatch, WET_WEEK)
    rows = [_due_row(1, map_type="indoor")]

    kept = await hold_still_moist_water_rows(_ForecastDb(), 1, rows, TODAY)

    assert [row["id"] for row in kept] == [1]


@pytest.mark.asyncio
async def test_an_all_indoor_household_never_fetches_a_forecast(monkeypatch):
    """Indoors can only ever return "unknown", so paying for the HTTP call on
    every hourly cron run would buy nothing."""
    calls = []

    async def fake(lat, lon):
        calls.append((lat, lon))
        return []

    monkeypatch.setattr("services.weather_forecast.get_usable_forecast_days", fake)

    await hold_still_moist_water_rows(
        _ForecastDb(), 1, [_due_row(1, map_type="indoor")], TODAY)

    assert calls == []


@pytest.mark.asyncio
async def test_no_forecast_means_the_push_goes_out(monkeypatch):
    """It fails towards sending. A missing forecast looks identical to a broken
    one, and a reminder you did not need beats a plant nobody watered."""
    _patch_forecast(monkeypatch, WET_WEEK)

    kept = await hold_still_moist_water_rows(
        _ForecastDb(has_coordinates=False), 1, [_due_row(1)], TODAY)

    assert [row["id"] for row in kept] == [1]


@pytest.mark.asyncio
async def test_a_held_push_is_deferred_not_cancelled(monkeypatch):
    """The guarantee that makes this a hold rather than a mute.

    `send_due_care_pushes` stamps `notified_for_due` on everything it delivers,
    and a stamped schedule never pings again until completion moves its due
    date. So a held row must reach neither the payload nor the stamp: if it were
    stamped anyway, a wet Tuesday would cost you the reminder for the whole due
    cycle, and the plant would go unwatered once it dried.
    """
    from services import digest

    _patch_forecast(monkeypatch, WET_WEEK)
    wet = _due_row(1, plant_name="Hortensia")
    dry = _due_row(2, care_type="fertilize", plant_name="Olijfboom")
    writes: list[tuple[str, tuple]] = []
    pushed: list[dict] = []

    class Db:
        async def execute_fetchall(self, query, params=()):
            if "FROM push_subscriptions ps" in query:
                return [{"account_id": 1, "household_id": 1, "language": "nl",
                         "quiet_start": None, "quiet_end": None,
                         "muted_care_types": None}]
            if "FROM care_schedules cs" in query:
                return [wet, dry]
            if "FROM maps" in query:
                return [{"id": 1, "map_type": "outdoor",
                         "lat": 52.3715, "lon": 4.8499}]
            if "FROM push_subscriptions WHERE" in query:
                return [{"id": 7, "endpoint": "https://push.example/x",
                         "p256dh": "k", "auth": "a"}]
            return []

        async def execute(self, query, params=()):
            writes.append((query, params))

        async def commit(self):
            return None

    def fake_send_push(sub, payload):
        pushed.append(payload)
        return "ok"

    monkeypatch.setattr(digest, "send_push", fake_send_push)
    monkeypatch.setattr(digest, "_now", lambda: _noon(TODAY))

    result = await digest.send_due_care_pushes(Db())

    assert result["push_sent"] == 1, "the fertilise reminder still goes out"
    body = str(pushed)
    assert "Olijfboom" in body
    assert "Hortensia" not in body, "the wet plant is not in the notification"

    stamped = [params for query, params in writes if "notified_for_due" in query]
    assert stamped, "the delivered row is stamped"
    assert all(params[-1] != wet["id"] for params in stamped), (
        "the held row is never stamped, so it pings again once the soil dries")


def _noon(day):
    from datetime import datetime, time

    from services.local_time import GARDEN_TZ

    return datetime.combine(day, time(12, 0), tzinfo=GARDEN_TZ)


@pytest.mark.asyncio
async def test_a_real_soil_reading_survives_the_trip_from_open_meteo(monkeypatch):
    """The bug this closes: Open-Meteo reports soil moisture in m³/m³ (0-1) and
    every threshold in the codebase is a percentage, so a real Amsterdam reading
    of 0.61 was compared against 30 and lost. The measured branch — the only
    part of this feature that is not an estimate — had never fired once, in any
    weather, since the day it was written."""
    from services import weather_forecast

    class Client:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return None
        async def get(self, url, params):
            class R:
                @staticmethod
                def raise_for_status(): return None
                @staticmethod
                def json():
                    return {"current": {}, "daily": {
                        "time": [TODAY.isoformat()],
                        "temperature_2m_max": [20.0], "temperature_2m_min": [12.0],
                        "precipitation_sum": [0.0], "et0_fao_evapotranspiration": [1.9],
                        "cloud_cover_mean": [50.0], "relative_humidity_2m_max": [80.0],
                        # Exactly what the live API returned for Amsterdam.
                        "soil_moisture_0_to_7cm_mean": [0.609],
                    }}
            return R()

    weather_forecast.clear_forecast_cache()
    monkeypatch.setattr(weather_forecast.httpx, "AsyncClient", Client)
    days = await weather_forecast.get_usable_forecast_days(52.3715, 4.8499)
    weather_forecast.clear_forecast_cache()

    assert days[0]["soil_moisture_pct"] == pytest.approx(60.9)

    result = assess_moisture(
        environment="outdoor_ground", today=TODAY, last_watered=None,
        weather_days=[WeatherDay(
            date=TODAY, max_temp_c=20.0, precipitation_mm=0.0, et0_mm=1.9,
            humidity_pct=80.0, soil_moisture_pct=days[0]["soil_moisture_pct"])],
    )

    assert result.verdict == "moist"
    assert result.factors["source"] == "soil_measurement"


# ── After rain moved the deadline ────────────────────────────────────────────

def test_a_rain_credited_plant_still_says_why_it_is_not_on_the_list():
    """Once rain moves `next_due` into the future the plant simply is not due,
    and every surface goes quiet for the ordinary reason. But a plant that was
    overdue yesterday and is silent today looks like something was missed, so
    the explanation has to outlive the warning it replaced."""
    schedule = [{
        "care_type": "water",
        # Its own rhythm says it was due two days ago; the deadline now sits in
        # the future, which only happens because something moved it.
        "next_due": TODAY + timedelta(days=2),
        "last_done": TODAY - timedelta(days=7),
        "interval_days": 5,
    }]

    state = compute_plant_warnings(
        _plant(), schedule, weather=_weather(WET_WEEK), today=TODAY,
    )

    water = [w for w in state.warnings if w.care_type == "water"]
    assert [w.code for w in water] == ["water_still_moist"]
    assert water[0].days_overdue == 0, "nothing is late any more"


def test_a_plant_that_is_simply_not_due_says_nothing():
    """The line is for a deadline rain moved, not for every wet outdoor plant.
    A standing "nog niet gieten" on everything all autumn is just noise."""
    schedule = [{
        "care_type": "water",
        "next_due": TODAY + timedelta(days=2),
        "last_done": TODAY - timedelta(days=3),
        "interval_days": 5,
    }]

    state = compute_plant_warnings(
        _plant(), schedule, weather=_weather(WET_WEEK), today=TODAY,
    )

    assert not [w for w in state.warnings if w.care_type == "water"]


def test_a_credited_plant_that_has_dried_out_is_due_again():
    """The credit is not permanent. Once the soil dries the schedule is back in
    charge, and a deadline in the future is just a deadline in the future."""
    schedule = [{
        "care_type": "water",
        "next_due": TODAY + timedelta(days=2),
        "last_done": TODAY - timedelta(days=7),
        "interval_days": 5,
    }]

    state = compute_plant_warnings(
        _plant(), schedule, weather=_weather(DRY_WEEK), today=TODAY,
    )

    assert not [w for w in state.warnings if w.care_type == "water"], (
        "not due today either way — but no moisture claim is made about it")


def test_a_lengthened_winter_interval_is_not_mistaken_for_a_rain_credit():
    """`next_due` is written from the SEASON-ADJUSTED interval. Comparing it
    against the raw `interval_days` makes every ordinary schedule look credited
    for exactly the extra seasonal days, and puts "nog niet gieten — grond is
    nog vochtig" on a plant nothing has happened to. A claim the app invents
    about soil it never looked at is the same failure as the warning that was
    wrong, pointed the other way."""
    # 10-day base doubled by a winter multiplier: the scheduler wrote next_due
    # 20 days out, so on day 12 this plant is simply not due yet.
    last_done = date(2026, 1, 1)
    schedule = [{
        "care_type": "water",
        "next_due": last_done + timedelta(days=20),
        "last_done": last_done,
        "interval_days": 10,
        "season_adjust": '{"winter": 2.0}',
    }]
    twelve_days_later = last_done + timedelta(days=12)

    state = compute_plant_warnings(
        _plant(), schedule,
        weather=_weather(WET_WEEK, anchor=twelve_days_later),
        today=twelve_days_later,
    )

    assert not [w for w in state.warnings if w.care_type == "water"]


def test_rain_over_one_garden_does_not_quiet_a_warning_in_another():
    """The read side has the same trap as the write side: one household, two
    gardens, and only one of them wet."""
    schedule = _water_schedule(2)
    weather = {
        "forecast_days_by_map": {
            1: _weather(WET_WEEK)["forecast_days"],
            2: _weather(DRY_WEEK)["forecast_days"],
        }
    }

    wet = compute_plant_warnings(
        _plant(map_id=1), schedule, weather=weather, today=TODAY)
    dry = compute_plant_warnings(
        _plant(map_id=2), schedule, weather=weather, today=TODAY)

    assert [w.code for w in wet.warnings if w.care_type == "water"] == ["water_still_moist"]
    assert [w.code for w in dry.warnings if w.care_type == "water"] == [None]


def test_a_plant_whose_own_map_has_no_forecast_gets_no_one_elses():
    """Absent weather for this map is no evidence. Falling back to another
    map's would be someone else's sky."""
    weather = {"forecast_days_by_map": {1: _weather(WET_WEEK)["forecast_days"]}}

    state = compute_plant_warnings(
        _plant(map_id=2), _water_schedule(2), weather=weather, today=TODAY)

    water = [w for w in state.warnings if w.care_type == "water"]
    assert water[0].code is None, "still a real watering warning"
