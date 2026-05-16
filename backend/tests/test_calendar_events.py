"""Tests for GET /api/calendar/events.

These tests are written BEFORE the endpoint exists (TDD). They should fail
with 404 until Task A3 wires up the router. Each test seeds a different
plant + schedule combination to verify in-range, overdue, inactive, and
out-of-range behaviour.

Fixtures (`seeded_db`, `auth_header`, `client`) live in `conftest.py`.
"""
import pytest


@pytest.mark.asyncio
async def test_calendar_events_returns_schedules_in_range(client, seeded_db, auth_header):
    """A care_schedule with next_due in range becomes a calendar event."""
    db = seeded_db
    cur = await db.execute(
        "INSERT INTO plants (name, household_id) VALUES ('Test', 1)"
    )
    plant_id = cur.lastrowid
    await db.execute(
        "INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due, is_active) "
        "VALUES (?, 'water', 7, date('now', '+1 day'), 1)",
        (plant_id,),
    )
    await db.commit()

    r = await client.get(
        "/api/calendar/events",
        params={"from": "2026-05-01", "to": "2026-05-31"},
        headers=auth_header,
    )
    assert r.status_code == 200
    events = r.json()
    waters = [e for e in events if e["type"] == "water" and e["plant_id"] == plant_id]
    assert len(waters) == 1
    assert waters[0]["plant_name"] == "Test"
    assert waters[0]["overdue"] is False


@pytest.mark.asyncio
async def test_calendar_events_marks_overdue(client, seeded_db, auth_header):
    """A schedule with next_due before today is marked overdue=True."""
    db = seeded_db
    cur = await db.execute(
        "INSERT INTO plants (name, household_id) VALUES ('Late', 1)"
    )
    plant_id = cur.lastrowid
    await db.execute(
        "INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due, is_active) "
        "VALUES (?, 'water', 7, '2026-05-01', 1)",
        (plant_id,),
    )
    await db.commit()

    r = await client.get(
        "/api/calendar/events",
        params={"from": "2026-05-01", "to": "2026-05-31"},
        headers=auth_header,
    )
    assert r.status_code == 200
    waters = [e for e in r.json() if e["plant_id"] == plant_id]
    assert len(waters) == 1
    assert waters[0]["overdue"] is True


@pytest.mark.asyncio
async def test_calendar_events_excludes_inactive(client, seeded_db, auth_header):
    """Inactive schedules don't appear."""
    db = seeded_db
    cur = await db.execute(
        "INSERT INTO plants (name, household_id) VALUES ('Off', 1)"
    )
    plant_id = cur.lastrowid
    await db.execute(
        "INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due, is_active) "
        "VALUES (?, 'water', 7, '2026-05-10', 0)",
        (plant_id,),
    )
    await db.commit()

    r = await client.get(
        "/api/calendar/events",
        params={"from": "2026-05-01", "to": "2026-05-31"},
        headers=auth_header,
    )
    assert r.status_code == 200
    assert all(e["plant_id"] != plant_id for e in r.json())


@pytest.mark.asyncio
async def test_calendar_events_filters_by_range(client, seeded_db, auth_header):
    """A schedule with next_due outside the requested range is excluded."""
    db = seeded_db
    cur = await db.execute(
        "INSERT INTO plants (name, household_id) VALUES ('Far', 1)"
    )
    plant_id = cur.lastrowid
    await db.execute(
        "INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due, is_active) "
        "VALUES (?, 'water', 7, '2026-08-15', 1)",
        (plant_id,),
    )
    await db.commit()

    r = await client.get(
        "/api/calendar/events",
        params={"from": "2026-05-01", "to": "2026-05-31"},
        headers=auth_header,
    )
    assert r.status_code == 200
    assert all(e["plant_id"] != plant_id for e in r.json())
