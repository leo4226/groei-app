"""Tests for GET /api/calendar/events.

Each test seeds a different plant + schedule combination to verify in-range
(with recurring-occurrence expansion), overdue, inactive, and out-of-range
behaviour. Dates are computed relative to today — the endpoint expands
recurring schedules into virtual occurrences within the requested range.

Fixtures (`seeded_db`, `auth_header`, `client`) live in `conftest.py`.
"""
from datetime import date, timedelta

import pytest


@pytest.mark.asyncio
async def test_calendar_events_returns_schedules_in_range(client, seeded_db, auth_header):
    """A recurring schedule expands into one event per occurrence in range."""
    db = seeded_db
    cur = await db.execute(
        "INSERT INTO plants (name, household_id) VALUES ('Test', 1)"
    )
    plant_id = cur.lastrowid
    today = date.today()
    next_due = today + timedelta(days=1)
    await db.execute(
        "INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due, is_active) "
        "VALUES (?, 'water', 7, ?, 1)",
        (plant_id, next_due.isoformat()),
    )
    await db.commit()

    r = await client.get(
        "/api/calendar/events",
        params={"from": today.isoformat(), "to": (today + timedelta(days=13)).isoformat()},
        headers=auth_header,
    )
    assert r.status_code == 200
    events = r.json()
    waters = [e for e in events if e["type"] == "water" and e["plant_id"] == plant_id]
    # 14-day window, 7-day interval starting tomorrow → occurrences at +1 and +8
    assert [e["date"] for e in waters] == [
        next_due.isoformat(),
        (next_due + timedelta(days=7)).isoformat(),
    ]
    assert waters[0]["plant_name"] == "Test"
    assert waters[0]["overdue"] is False


@pytest.mark.asyncio
async def test_calendar_events_marks_overdue(client, seeded_db, auth_header):
    """A schedule occurrence before today is marked overdue=True."""
    db = seeded_db
    cur = await db.execute(
        "INSERT INTO plants (name, household_id) VALUES ('Late', 1)"
    )
    plant_id = cur.lastrowid
    today = date.today()
    next_due = today - timedelta(days=5)
    await db.execute(
        "INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due, is_active) "
        "VALUES (?, 'water', 7, ?, 1)",
        (plant_id, next_due.isoformat()),
    )
    await db.commit()

    # Range ends yesterday so only the missed occurrence falls inside it
    r = await client.get(
        "/api/calendar/events",
        params={
            "from": (today - timedelta(days=10)).isoformat(),
            "to": (today - timedelta(days=1)).isoformat(),
        },
        headers=auth_header,
    )
    assert r.status_code == 200
    waters = [e for e in r.json() if e["plant_id"] == plant_id]
    assert len(waters) == 1
    assert waters[0]["date"] == next_due.isoformat()
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
