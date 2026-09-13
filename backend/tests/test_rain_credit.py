"""Rain that has already watered the plant should move the deadline.

Suppressing a warning while the schedule still counts the days leaves two
answers on screen — "de grond is nog vochtig" next to "14 dagen te laat" — and
forces every surface to learn the suppression separately. The plant page did;
the map badge did not, and drew a watering droplet under a line saying not to
water. Moving the deadline fixes all of them at once, for the ordinary reason
that the plant is no longer due.

The risk runs the other way, so most of these tests are about what the credit
is NOT allowed to do. A reminder wrongly held back is a plant nobody waters.
"""
from datetime import date, timedelta

import pytest

from services.rain_credit import apply_rain_credit, credited_next_due
from services.water_pressure import WeatherDay


TODAY = date(2026, 9, 13)

WET = [{"rain": 9.0, "et0": 0.8, "max": 15.0}] * 5
DRY = [{"rain": 0.0, "et0": 4.5, "max": 27.0}] * 5


def _days(specs):
    n = len(specs)
    return [
        WeatherDay(date=TODAY - timedelta(days=n - 1 - i),
                   max_temp_c=s["max"], precipitation_mm=s["rain"], et0_mm=s["et0"])
        for i, s in enumerate(specs)
    ]


def _row(**overrides):
    return {
        "id": 1,
        "next_due": TODAY - timedelta(days=3),
        "last_done": TODAY - timedelta(days=8),
        "interval_days": 5,
        "season_adjust": None,
        "container_id": None,
        "ground_zone_id": "bed_1",
        "mulch": None,
        "measured_sun_hours": None,
        "map_type": "outdoor",
        **overrides,
    }


def test_rain_moves_an_overdue_deadline_forward():
    """Leon's blueberry: a 5-day schedule, 3 days late, after a week of rain."""
    assert credited_next_due(row=_row(), today=TODAY, weather_days=_days(WET)) > TODAY


def test_a_dry_week_leaves_the_deadline_alone():
    assert credited_next_due(row=_row(), today=TODAY, weather_days=_days(DRY)) is None


def test_the_credit_never_exceeds_a_real_watering():
    """A wet fortnight must not quietly turn a 5-day blueberry into a monthly
    one. Rain can buy at most as much time as actually watering it would."""
    granted = credited_next_due(row=_row(), today=TODAY, weather_days=_days(WET))

    assert granted is not None
    assert granted <= TODAY + timedelta(days=5)


def test_a_deadline_that_has_not_arrived_is_not_touched():
    """Only a due plant gets credited. Crediting early would let a forecast
    reschedule a plant that was never asking for anything."""
    row = _row(next_due=TODAY + timedelta(days=2))

    assert credited_next_due(row=row, today=TODAY, weather_days=_days(WET)) is None


def test_indoor_plants_are_never_credited():
    row = _row(map_type="indoor", container_id=3, ground_zone_id=None)

    assert credited_next_due(row=row, today=TODAY, weather_days=_days(WET)) is None


def test_a_schedule_with_no_interval_is_left_alone():
    """Without an interval there is no ceiling to cap the credit against, and an
    uncapped credit is the one that could push a plant out indefinitely."""
    assert credited_next_due(
        row=_row(interval_days=None), today=TODAY, weather_days=_days(WET)) is None


def test_no_weather_means_no_credit():
    assert credited_next_due(row=_row(), today=TODAY, weather_days=[]) is None


# ── Against the database ─────────────────────────────────────────────────────

class _Db:
    def __init__(self, rows, *, coordinates=True):
        self.rows = rows
        self.coordinates = coordinates
        self.writes: list[tuple[str, tuple]] = []
        self.commits = 0

    async def execute_fetchall(self, query, params=()):
        if "FROM maps" in query and "care_schedules" not in query:
            return [{"lat": 52.3715, "lon": 4.8499}] if self.coordinates else []
        if "FROM care_schedules cs" in query:
            return self.rows
        return []

    async def execute(self, query, params=()):
        self.writes.append((query, params))

    async def commit(self):
        self.commits += 1


@pytest.fixture
def wet_forecast(monkeypatch):
    async def fake(lat, lon):
        return [
            {"date": day.date.isoformat(), "max_temp_c": day.max_temp_c,
             "precipitation_mm": day.precipitation_mm, "et0_mm": day.et0_mm,
             "humidity_pct": None, "soil_moisture_pct": None}
            for day in _days(WET)
        ]
    monkeypatch.setattr("services.weather_forecast.get_usable_forecast_days", fake)


@pytest.mark.asyncio
async def test_it_writes_the_new_deadline_and_nothing_else(wet_forecast):
    """`last_done` and `care_log` are the record of what a person did. Rain is
    not a watering, and a log claiming Leon watered on a day he did not is worse
    than any reminder this saves him."""
    db = _Db([_row()])

    result = await apply_rain_credit(db, household_id=1, today=TODAY)

    assert result["credited"] == 1
    assert len(db.writes) == 1
    query, _ = db.writes[0]
    assert "next_due" in query
    assert "last_done" not in query
    assert "care_log" not in query
    assert db.commits == 1


@pytest.mark.asyncio
async def test_it_clears_the_push_stamp_for_the_old_deadline(wet_forecast):
    """`notified_for_due` records the date a push already went out for. Left
    pointing at the old deadline, the reminder for the new one would be
    swallowed as a duplicate and never arrive."""
    db = _Db([_row()])

    await apply_rain_credit(db, household_id=1, today=TODAY)

    query, _ = db.writes[0]
    assert "notified_for_due = NULL" in query


@pytest.mark.asyncio
async def test_a_household_without_coordinates_is_left_alone(wet_forecast):
    db = _Db([_row()], coordinates=False)

    result = await apply_rain_credit(db, household_id=1, today=TODAY)

    assert result["credited"] == 0
    assert db.writes == []


@pytest.mark.asyncio
async def test_an_all_indoor_household_never_fetches_a_forecast(monkeypatch):
    calls = []

    async def fake(lat, lon):
        calls.append(1)
        return []

    monkeypatch.setattr("services.weather_forecast.get_usable_forecast_days", fake)
    db = _Db([_row(map_type="indoor", container_id=3, ground_zone_id=None)])

    await apply_rain_credit(db, household_id=1, today=TODAY)

    assert calls == []
    assert db.writes == []
