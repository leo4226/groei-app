"""Heat-triggered extra watering moments (#785)."""
import json
from datetime import date, timedelta
from urllib.parse import urlparse

import pytest
import pytest_asyncio
from icalendar import Calendar

import services.environment as env
from services.weather_task_service import (
    HEAT_WATER_KIND,
    _get_cached_weather,
    sync_ephemeral_schedules,
)

TODAY = date.today()


def _forecast(*max_temps: float) -> dict:
    """Build a 7-day temp_days payload starting today, as get_temp_data returns."""
    return {
        "days": [
            {
                "date": (TODAY + timedelta(days=index)).isoformat(),
                "min": 15.0,
                "max": float(temp),
            }
            for index, temp in enumerate(max_temps)
        ],
        "avg_max_7day": 20.0,
        "assessment": "warm",
    }


async def _seed_watered_household(seeded_db) -> None:
    """One outdoor garden with two plants and one indoor room with one plant."""
    await seeded_db.execute(
        "INSERT INTO maps (id, name, map_type, household_id) VALUES "
        "(1, 'Garden', 'outdoor', 1), (2, 'Living room', 'indoor', 1)"
    )
    await seeded_db.execute(
        "INSERT INTO plants (id, name, map_id, household_id, is_active) VALUES "
        "(1, 'Tomato', 1, 1, 1), (2, 'Basil', 1, 1, 1), (3, 'Monstera', 2, 1, 1)"
    )
    await seeded_db.execute(
        "INSERT INTO care_schedules (id, plant_id, care_type, interval_days, next_due, is_active, is_ephemeral) "
        "VALUES (1, 1, 'water', 4, ?, 1, 0)",
        ((TODAY + timedelta(days=5)).isoformat(),),
    )
    await seeded_db.execute(
        "INSERT INTO care_schedules (id, plant_id, care_type, interval_days, next_due, is_active, is_ephemeral) "
        "VALUES (2, 2, 'water', 4, ?, 1, 0)",
        ((TODAY + timedelta(days=5)).isoformat(),),
    )
    await seeded_db.execute(
        "INSERT INTO care_schedules (id, plant_id, care_type, interval_days, next_due, is_active, is_ephemeral) "
        "VALUES (3, 3, 'water', 7, ?, 1, 0)",
        ((TODAY + timedelta(days=6)).isoformat(),),
    )
    await seeded_db.commit()


@pytest_asyncio.fixture
async def watered_db(seeded_db):
    await _seed_watered_household(seeded_db)
    return seeded_db


async def _active_heat_water_rows(db) -> list[dict]:
    return await db.execute_fetchall(
        """SELECT plant_id, care_type, is_ephemeral, is_active, next_due,
                  rhythm_opt_out, notes
           FROM care_schedules
           WHERE care_type = 'water' AND is_ephemeral = 1
           ORDER BY plant_id"""
    )


# ── P1 regression: forecast-day selection ──────────────────────────────────


@pytest.mark.asyncio
async def test_get_cached_weather_uses_today_not_last_forecast_day(monkeypatch):
    async def fake_temp_data(db=None):
        # Heatwave today (34), mild rest of the week. The old days[-1] pick
        # used to report 22 and anchor tasks six days out.
        return _forecast(34, 30, 28, 26, 24, 22, 20)

    monkeypatch.setattr(env, "get_temp_data", fake_temp_data)
    weather = await _get_cached_weather()

    assert weather["max_24h"] == 34.0
    assert weather["min_24h"] == 15.0
    assert weather["forecast_date"] == TODAY


# ── Sync: creation and limits ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sync_creates_heat_water_rows_for_outdoor_and_indoor(
    watered_db, monkeypatch,
):
    async def fake_temp_data(db=None):
        return _forecast(31, 29, 28, 26, 24, 22, 20)

    monkeypatch.setattr(env, "get_temp_data", fake_temp_data)
    result = await sync_ephemeral_schedules(watered_db)

    assert result["created"] == 3
    rows = await _active_heat_water_rows(watered_db)
    assert [row["plant_id"] for row in rows] == [1, 2, 3]
    for row in rows:
        assert row["is_ephemeral"] == 1
        assert row["is_active"] == 1
        assert row["rhythm_opt_out"] == 1
        assert row["next_due"] == TODAY.isoformat()
        metadata = json.loads(row["notes"])
        assert metadata["kind"] == HEAT_WATER_KIND
        assert metadata["forecast_date"] == TODAY.isoformat()
        assert metadata["max_temp_c"] == 31.0
        assert metadata["threshold_c"] == 30.0


@pytest.mark.asyncio
async def test_sync_skips_when_below_threshold(watered_db, monkeypatch):
    async def fake_temp_data(db=None):
        return _forecast(28, 29, 28, 26, 24, 22, 20)

    monkeypatch.setattr(env, "get_temp_data", fake_temp_data)
    result = await sync_ephemeral_schedules(watered_db)

    assert result["created"] == 0
    assert await _active_heat_water_rows(watered_db) == []


@pytest.mark.asyncio
async def test_sync_picks_nearest_qualifying_day(watered_db, monkeypatch):
    async def fake_temp_data(db=None):
        # Heat starts in two days; the moment lands on that day, not today.
        return _forecast(28, 29, 31, 30, 26, 24, 22)

    monkeypatch.setattr(env, "get_temp_data", fake_temp_data)
    await sync_ephemeral_schedules(watered_db)

    rows = await _active_heat_water_rows(watered_db)
    assert len(rows) == 3
    expected = (TODAY + timedelta(days=2)).isoformat()
    assert all(row["next_due"] == expected for row in rows)
    assert all(json.loads(row["notes"])["max_temp_c"] == 31.0 for row in rows)


@pytest.mark.asyncio
async def test_sync_skips_regular_watering_day_and_recently_watered(seeded_db, monkeypatch):
    await seeded_db.execute(
        "INSERT INTO maps (id, name, map_type, household_id) VALUES (1, 'Garden', 'outdoor', 1)"
    )
    await seeded_db.execute(
        "INSERT INTO plants (id, name, map_id, household_id, is_active) VALUES "
        "(1, 'Tomato', 1, 1, 1), (2, 'Basil', 1, 1, 1)"
    )
    # Plant 1 is due for regular water today; plant 2 was watered today.
    await seeded_db.execute(
        "INSERT INTO care_schedules (id, plant_id, care_type, interval_days, next_due, last_done, is_active, is_ephemeral) "
        "VALUES (1, 1, 'water', 4, ?, NULL, 1, 0)",
        (TODAY.isoformat(),),
    )
    await seeded_db.execute(
        "INSERT INTO care_schedules (id, plant_id, care_type, interval_days, next_due, last_done, is_active, is_ephemeral) "
        "VALUES (2, 2, 'water', 4, ?, ?, 1, 0)",
        ((TODAY + timedelta(days=2)).isoformat(), TODAY.isoformat()),
    )
    await seeded_db.commit()

    async def fake_temp_data(db=None):
        return _forecast(31, 29, 28, 26, 24, 22, 20)

    monkeypatch.setattr(env, "get_temp_data", fake_temp_data)
    result = await sync_ephemeral_schedules(seeded_db)

    assert result["created"] == 0
    assert await _active_heat_water_rows(seeded_db) == []


@pytest.mark.asyncio
async def test_sync_keeps_one_active_row_per_plant(watered_db, monkeypatch):
    async def fake_temp_data(db=None):
        return _forecast(31, 29, 28, 26, 24, 22, 20)

    monkeypatch.setattr(env, "get_temp_data", fake_temp_data)
    first = await sync_ephemeral_schedules(watered_db)
    second = await sync_ephemeral_schedules(watered_db)

    assert first["created"] == 3
    assert second["created"] == 0
    rows = await _active_heat_water_rows(watered_db)
    assert len(rows) == 3
    assert len({row["plant_id"] for row in rows}) == 3


@pytest.mark.asyncio
async def test_sync_deactivates_rows_when_forecast_cools(watered_db, monkeypatch):
    async def hot_temp_data(db=None):
        return _forecast(31, 29, 28, 26, 24, 22, 20)

    async def cool_temp_data(db=None):
        return _forecast(24, 26, 25, 22, 20, 18, 16)

    monkeypatch.setattr(env, "get_temp_data", hot_temp_data)
    await sync_ephemeral_schedules(watered_db)
    assert len(await _active_heat_water_rows(watered_db)) == 3

    monkeypatch.setattr(env, "get_temp_data", cool_temp_data)
    result = await sync_ephemeral_schedules(watered_db)

    assert result["deleted"] == 3
    rows = await _active_heat_water_rows(watered_db)
    assert len(rows) == 3
    assert all(row["is_active"] == 0 for row in rows)


@pytest.mark.asyncio
async def test_sync_cleans_up_when_regular_water_schedule_removed(
    watered_db, monkeypatch,
):
    async def fake_temp_data(db=None):
        return _forecast(31, 29, 28, 26, 24, 22, 20)

    monkeypatch.setattr(env, "get_temp_data", fake_temp_data)
    await sync_ephemeral_schedules(watered_db)
    await watered_db.execute(
        "UPDATE care_schedules SET is_active = 0 WHERE is_ephemeral = 0 AND care_type = 'water'"
    )
    await watered_db.commit()

    result = await sync_ephemeral_schedules(watered_db)

    assert result["deleted"] == 3
    rows = await _active_heat_water_rows(watered_db)
    assert len(rows) == 3
    assert all(row["is_active"] == 0 for row in rows)


@pytest.mark.asyncio
async def test_sync_skips_plants_without_regular_water(seeded_db, monkeypatch):
    await seeded_db.execute(
        "INSERT INTO maps (id, name, map_type, household_id) VALUES (1, 'Garden', 'outdoor', 1)"
    )
    await seeded_db.execute(
        "INSERT INTO plants (id, name, map_id, household_id, is_active) VALUES (1, 'Tomato', 1, 1, 1)"
    )
    await seeded_db.execute(
        "INSERT INTO care_schedules (id, plant_id, care_type, interval_days, next_due, is_active, is_ephemeral) "
        "VALUES (1, 1, 'fertilize', 30, ?, 1, 0)",
        (TODAY.isoformat(),),
    )
    await seeded_db.commit()

    async def fake_temp_data(db=None):
        return _forecast(31, 29, 28, 26, 24, 22, 20)

    monkeypatch.setattr(env, "get_temp_data", fake_temp_data)
    result = await sync_ephemeral_schedules(seeded_db)

    assert result["created"] == 0
    assert await _active_heat_water_rows(seeded_db) == []


# ── Calendar projection: one grouped moment per map and day ────────────────


@pytest.mark.asyncio
async def test_calendar_groups_heat_water_into_one_event_per_map(
    watered_db, client, auth_header, monkeypatch,
):
    async def fake_temp_data(db=None):
        return _forecast(31, 29, 28, 26, 24, 22, 20)

    monkeypatch.setattr(env, "get_temp_data", fake_temp_data)

    response = await client.get(
        "/api/calendar/events",
        params={"from": TODAY.isoformat(), "to": TODAY.isoformat()},
        headers=auth_header,
    )

    assert response.status_code == 200, response.text
    heat_water = [
        event for event in response.json()
        if event["type"] == "water" and event["weather_triggered"]
    ]
    # Outdoor garden (2 plants) and indoor room (1 plant) → two grouped cards.
    assert len(heat_water) == 2
    by_map = {event["map_id"]: event for event in heat_water}
    assert set(by_map) == {1, 2}
    assert by_map[1]["grouped"] is True
    assert by_map[1]["group_count"] == 2
    assert by_map[2]["group_count"] == 1
    for event in heat_water:
        assert event["grouped"] is True
        assert event["severity"] == "warning"
        assert "Extra water" in (event["reason_nl"] or "")
        assert "Extra watering" in (event["reason_en"] or "")
        assert event["action_nl"]
        assert event["map_name"]


@pytest.mark.asyncio
async def test_calendar_heat_water_never_merges_with_regular_water(
    watered_db, client, auth_header, monkeypatch,
):
    # Make plant 1 due for regular water today so BOTH a regular group and a
    # heat-water reminder exist on the same day without merging.
    await watered_db.execute(
        "UPDATE care_schedules SET next_due = ? WHERE id = 1",
        (TODAY.isoformat(),),
    )
    await watered_db.commit()

    async def fake_temp_data(db=None):
        return _forecast(31, 29, 28, 26, 24, 22, 20)

    monkeypatch.setattr(env, "get_temp_data", fake_temp_data)
    response = await client.get(
        "/api/calendar/events",
        params={"from": TODAY.isoformat(), "to": TODAY.isoformat()},
        headers=auth_header,
    )

    assert response.status_code == 200, response.text
    water_events = [
        event for event in response.json()
        if event["type"] == "water"
    ]
    heat_water = [event for event in water_events if event["weather_triggered"]]
    regular = [event for event in water_events if not event["weather_triggered"]]
    assert len(heat_water) == 2
    assert regular, "regular water group expected on the due day"
    assert all("garden:" in event["id"] for event in regular)
    assert all(event["id"].startswith("heat-water:") for event in heat_water)


# ── ICS: heat-water moments sync by default ────────────────────────────────


@pytest.mark.asyncio
async def test_ics_feed_includes_heat_water_by_default(
    watered_db, client, auth_header, monkeypatch,
):
    async def fake_temp_data(db=None):
        return _forecast(31, 29, 28, 26, 24, 22, 20)

    monkeypatch.setattr(env, "get_temp_data", fake_temp_data)
    created = await client.post(
        "/api/calendar/subscription",
        headers=auth_header,
        json={"environment": "all", "privacy": True},
    )
    assert created.status_code == 201
    feed_path = urlparse(created.json()["feed_url"]).path

    feed = await client.get(feed_path)
    assert feed.status_code == 200, feed.text

    parsed = Calendar.from_ical(feed.content)
    summaries = [
        str(component["SUMMARY"])
        for component in parsed.walk()
        if component.name == "VEVENT"
    ]
    assert any("Water geven (extra)" in summary for summary in summaries)
    descriptions = " ".join(
        str(component.get("DESCRIPTION", ""))
        for component in parsed.walk()
        if component.name == "VEVENT"
    )
    assert "Extra water geven vanwege hitte" in descriptions


@pytest.mark.asyncio
async def test_ics_feed_respects_include_context_for_other_weather(
    watered_db, client, auth_header, monkeypatch,
):
    async def fake_temp_data(db=None):
        return _forecast(31, 29, 28, 26, 24, 22, 20)

    monkeypatch.setattr(env, "get_temp_data", fake_temp_data)

    # Give the outdoor plant a heat threshold so the real sync creates a
    # heat_protect task for today's 31 °C forecast (also exercises the
    # forecast-day fix: days[0], not days[-1]).
    await watered_db.execute(
        "UPDATE plants SET care_thresholds = ? WHERE id = 1",
        ('{"max_temp_c": 30, "bring_inside_below_c": 3}',),
    )
    await watered_db.commit()

    created = await client.post(
        "/api/calendar/subscription",
        headers=auth_header,
        json={"environment": "all", "include_context": False, "privacy": True},
    )
    assert created.status_code == 201
    feed_path = urlparse(created.json()["feed_url"]).path
    feed = await client.get(feed_path)
    assert feed.status_code == 200
    parsed = Calendar.from_ical(feed.content)
    summaries = [
        str(component["SUMMARY"])
        for component in parsed.walk()
        if component.name == "VEVENT"
    ]
    assert any("Water geven (extra)" in summary for summary in summaries)
    assert not any("Bescherm tegen hitte" in summary for summary in summaries)

    # Same household, context included → the heat protect task appears.
    created_context = await client.post(
        "/api/calendar/subscription",
        headers=auth_header,
        json={"environment": "all", "include_context": True, "privacy": True},
    )
    assert created_context.status_code == 201
    feed_path_context = urlparse(created_context.json()["feed_url"]).path
    feed_context = await client.get(feed_path_context)
    assert feed_context.status_code == 200
    parsed_context = Calendar.from_ical(feed_context.content)
    summaries_context = [
        str(component["SUMMARY"])
        for component in parsed_context.walk()
        if component.name == "VEVENT"
    ]
    assert any("Bescherm tegen hitte" in summary for summary in summaries_context)
