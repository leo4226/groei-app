"""The suite must not assert against the live Amsterdam forecast.

`services.environment.get_temp_data` falls through to an Open-Meteo HTTP call
when no cache is warm. `_sync_ephemeral_schedules` then scans the whole 7-day
window for a day at or above `HEAT_WATER_MAX_TEMP_C` and, on a hit, inserts an
ephemeral heat-water schedule for every eligible outdoor plant — which showed up
in the calendar as an extra `heat-water:` card and broke any test asserting an
exact water-event count. Whether those tests passed depended on the weather.

The autouse `_neutral_weather` fixture in conftest pins a mild forecast. These
tests hold that in place and show the heat path still works when a hot day is
deliberately supplied.
"""
import pytest

from services.weather_task_service import HEAT_WATER_MAX_TEMP_C, sync_ephemeral_schedules


async def _outdoor_plant_with_water(db):
    await db.executescript("""
        INSERT INTO maps (id, name, map_type, household_id)
        VALUES (1, 'Garden', 'outdoor', 1);
        INSERT INTO plants (id, name, household_id, map_id, is_active)
        VALUES (101, 'Rose', 1, 1, 1);
        INSERT INTO care_schedules
          (id, plant_id, care_type, interval_days, next_due, is_active, is_ephemeral)
        VALUES (201, 101, 'water', 7, '2099-01-01', 1, 0);
    """)
    await db.commit()


async def _ephemeral_water(db):
    return await db.execute_fetchall(
        """SELECT id, next_due, notes FROM care_schedules
           WHERE care_type = 'water' AND is_ephemeral = 1 AND is_active = 1"""
    )


@pytest.mark.asyncio
async def test_default_forecast_creates_no_weather_tasks(seeded_db):
    """The neutral fixture must not trigger heat or frost work."""
    await _outdoor_plant_with_water(seeded_db)

    result = await sync_ephemeral_schedules(seeded_db)

    assert result["created"] == 0
    assert await _ephemeral_water(seeded_db) == []


@pytest.mark.asyncio
async def test_no_live_weather_call_during_tests(monkeypatch):
    """get_temp_data is stubbed, so nothing reaches Open-Meteo."""
    import httpx

    def _explode(*args, **kwargs):  # pragma: no cover - only runs on regression
        raise AssertionError("test suite attempted a live weather HTTP call")

    monkeypatch.setattr(httpx.AsyncClient, "get", _explode, raising=True)

    from services.environment import get_temp_data

    data = await get_temp_data()
    assert data["days"], "the stub should still return a usable forecast"
    assert all(day["max"] < HEAT_WATER_MAX_TEMP_C for day in data["days"])


@pytest.mark.asyncio
async def test_hot_day_still_creates_a_heat_water_task(seeded_db, monkeypatch):
    """The feature itself is untouched — supply a hot day and it fires."""
    from datetime import date, timedelta

    await _outdoor_plant_with_water(seeded_db)

    hot_day = date.today() + timedelta(days=2)
    days = [
        {"date": (date.today() + timedelta(days=offset)).isoformat(),
         "min": 18.0,
         "max": 33.0 if offset == 2 else 20.0}
        for offset in range(7)
    ]

    async def _hot(db=None):
        return {"days": days}

    monkeypatch.setattr("services.environment.get_temp_data", _hot, raising=True)

    result = await sync_ephemeral_schedules(seeded_db)

    assert result["created"] == 1
    rows = await _ephemeral_water(seeded_db)
    assert len(rows) == 1
    assert str(rows[0]["next_due"]) == hot_day.isoformat()
