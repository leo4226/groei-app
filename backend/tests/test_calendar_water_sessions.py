"""Tests for Calendar Water session projection with Care Rhythm.

Strict TDD: each test starts RED (feature not implemented), then goes
GREEN after the minimum change.

Tests use relative dates from today for stability.
"""
from datetime import date, timedelta

import pytest


# ── helpers ─────────────────────────────────────────────────────────────

async def _insert_rhythm_config(db, *, outdoor_weekdays=None, indoor_weekdays=None,
                           map_overrides=None):
    """Insert a saved Care Rhythm config for household 1."""
    import json
    from services.care_rhythm import normalize_rhythm_config
    config = normalize_rhythm_config({
        "indoor_weekdays": indoor_weekdays or [],
        "outdoor_weekdays": outdoor_weekdays or [],
        "map_overrides": map_overrides or [],
    })
    await db.execute_fetchall(
        """INSERT INTO household_care_rhythm_preferences
           (household_id, indoor_weekdays, outdoor_weekdays)
           VALUES (1, ?, ?)""",
        (json.dumps(config["indoor_weekdays"]),
         json.dumps(config["outdoor_weekdays"])),
    )
    for override in config["map_overrides"]:
        await db.execute_fetchall(
            """INSERT INTO map_care_rhythm_overrides
               (household_id, map_id, weekdays) VALUES (1, ?, ?)""",
            (override["map_id"], json.dumps(override["weekdays"])),
        )


# ═══════════════════════════════════════════════════════════════════════
# Test A — Saved routine + outdoor Water schedules → grouped routine
# ═══════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_a_outdoor_routine_groups_two_water_schedules(
    client, seeded_db, auth_header,
):
    """Saved outdoor routine (Sunday) + two Garden Water schedules with
    canonical dates later in the week → one grouped routine session on
    the preferred day, with canonical member dates, stable unique schedule
    IDs; schedule rows unchanged after GET."""
    db = seeded_db
    today = date.today()
    # Find next Sunday
    sunday = today + timedelta(days=(7 - today.isoweekday()) % 7 or 7)
    # Canonical dates later in the week belong to the preceding Sunday visit.
    tuesday = sunday + timedelta(days=2)
    thursday = sunday + timedelta(days=4)

    await db.executescript(f"""
        INSERT INTO maps (id, name, map_type, household_id) VALUES
          (1, 'Garden', 'outdoor', 1);
        INSERT INTO plants (id, name, household_id, map_id, is_active) VALUES
          (101, 'Rose', 1, 1, 1),
          (102, 'Basil', 1, 1, 1);
    """)
    await db.execute(
        "INSERT INTO care_schedules (id, plant_id, care_type, interval_days, next_due, is_active) "
        "VALUES (201, 101, 'water', 7, ?, 1)",
        (tuesday.isoformat(),),
    )
    await db.execute(
        "INSERT INTO care_schedules (id, plant_id, care_type, interval_days, next_due, is_active) "
        "VALUES (202, 102, 'water', 7, ?, 1)",
        (thursday.isoformat(),),
    )
    await db.commit()

    # Save rhythm with Sunday-only outdoor routine
    await _insert_rhythm_config(db, outdoor_weekdays=[7])

    # Request a range that includes the projected Sunday
    from_dt = sunday - timedelta(days=2)
    to_dt = sunday + timedelta(days=1)
    r = await client.get(
        "/api/calendar/events",
        params={"from": from_dt.isoformat(), "to": to_dt.isoformat()},
        headers=auth_header,
    )
    assert r.status_code == 200
    events = r.json()

    # Should see one grouped routine Water session
    waters = [e for e in events if e["type"] == "water"]
    grouped = [e for e in waters if e.get("grouped")]
    exact = [e for e in waters if not e.get("grouped")]

    assert len(grouped) == 1, f"Expected 1 grouped Water session, got {len(grouped)}"
    assert len(exact) == 0, f"Expected 0 exact Water events, got {len(exact)}"

    grouped_event = grouped[0]
    assert grouped_event["date"] == sunday.isoformat()
    assert grouped_event["map_id"] == 1
    assert grouped_event["group_count"] == 2
    assert grouped_event["routine_session"] is True
    assert grouped_event["routine_reason"] == "routine"
    assert grouped_event["canonical_date"] is None  # grouped event has no single canonical

    # Group members: each has its canonical_date
    members = grouped_event["group_members"]
    assert len(members) == 2

    member_by_plant = {m["plant_id"]: m for m in members}
    assert 101 in member_by_plant
    assert 102 in member_by_plant
    assert member_by_plant[101]["canonical_date"] == tuesday.isoformat()
    assert member_by_plant[102]["canonical_date"] == thursday.isoformat()

    # Stable unique schedule IDs
    member_sids = grouped_event["group_member_schedule_ids"]
    assert sorted(member_sids) == [201, 202]
    assert len(set(member_sids)) == 2

    wider_response = await client.get(
        "/api/calendar/events",
        params={
            "from": (sunday - timedelta(days=3)).isoformat(),
            "to": (sunday + timedelta(days=2)).isoformat(),
        },
        headers=auth_header,
    )
    wider_group = next(
        event for event in wider_response.json()
        if event["type"] == "water" and event["grouped"]
    )
    assert wider_group["group_member_event_ids"] == grouped_event[
        "group_member_event_ids"
    ]

    # Schedule rows unchanged after GET
    schedules = await db.execute_fetchall(
        "SELECT id, next_due, is_active FROM care_schedules ORDER BY id"
    )
    assert [dict(row) for row in schedules] == [
        {"id": 201, "next_due": tuesday.isoformat(), "is_active": 1},
        {"id": 202, "next_due": thursday.isoformat(), "is_active": 1},
    ]


@pytest.mark.asyncio
async def test_pin_overdue_clamps_missed_session_without_false_overdue(
    client, seeded_db, auth_header,
):
    today = date.today()
    canonical_due = today + timedelta(days=1)
    missed_weekday = (today - timedelta(days=1)).isoweekday()
    await seeded_db.executescript("""
        INSERT INTO maps (id, name, map_type, household_id)
        VALUES (1, 'Garden', 'outdoor', 1);
        INSERT INTO plants (id, name, household_id, map_id, is_active)
        VALUES (101, 'Rose', 1, 1, 1);
    """)
    await seeded_db.execute(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, interval_days, next_due, is_active)
           VALUES (201, 101, 'water', 7, ?, 1)""",
        (canonical_due,),
    )
    await _insert_rhythm_config(
        seeded_db, outdoor_weekdays=[missed_weekday],
    )
    await seeded_db.commit()

    params = {
        "from": today.isoformat(),
        "to": (today + timedelta(days=2)).isoformat(),
    }
    month_response = await client.get(
        "/api/calendar/events", params=params, headers=auth_header,
    )
    assert month_response.status_code == 200
    assert [event for event in month_response.json() if event["type"] == "water"] == []

    agenda_response = await client.get(
        "/api/calendar/events",
        params={**params, "pin_overdue": True},
        headers=auth_header,
    )
    assert agenda_response.status_code == 200
    water_events = [
        event for event in agenda_response.json() if event["type"] == "water"
    ]
    assert len(water_events) == 1
    assert water_events[0]["date"] == today.isoformat()
    assert water_events[0]["canonical_date"] is None
    assert water_events[0]["group_members"][0]["canonical_date"] == canonical_due.isoformat()
    assert water_events[0]["overdue"] is False


@pytest.mark.asyncio
async def test_pin_overdue_preserves_stored_canonical_date_once(
    client, seeded_db, auth_header,
):
    today = date.today()
    canonical_due = today - timedelta(days=2)
    await seeded_db.executescript("""
        INSERT INTO maps (id, name, map_type, household_id)
        VALUES (1, 'Garden', 'outdoor', 1);
        INSERT INTO plants (id, name, household_id, map_id, is_active)
        VALUES (101, 'Rose', 1, 1, 1);
    """)
    await seeded_db.execute(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, interval_days, next_due, is_active)
           VALUES (201, 101, 'water', 7, ?, 1)""",
        (canonical_due,),
    )
    await _insert_rhythm_config(
        seeded_db, outdoor_weekdays=[today.isoweekday()],
    )
    await seeded_db.commit()

    response = await client.get(
        "/api/calendar/events",
        params={
            "from": today.isoformat(),
            "to": (today + timedelta(days=6)).isoformat(),
            "pin_overdue": True,
        },
        headers=auth_header,
    )
    assert response.status_code == 200
    water_events = [event for event in response.json() if event["type"] == "water"]
    assert len(water_events) == 1
    event = water_events[0]
    assert event["date"] == today.isoformat()
    assert event["group_member_schedule_ids"] == [201]
    assert event["group_members"][0]["canonical_date"] == canonical_due.isoformat()
    assert event["overdue"] is True


@pytest.mark.asyncio
async def test_routine_eligibility_keeps_frequent_and_opted_out_exact(
    client, seeded_db, auth_header,
):
    today = date.today()
    session_date = today + timedelta(
        days=(7 - today.isoweekday()) % 7 or 7,
    )
    await seeded_db.executescript("""
        INSERT INTO maps (id, name, map_type, household_id)
        VALUES (1, 'Garden', 'outdoor', 1);
        INSERT INTO plants (id, name, household_id, map_id, is_active) VALUES
          (101, 'Weekly', 1, 1, 1),
          (102, 'Ten days', 1, 1, 1),
          (103, 'Fortnightly', 1, 1, 1),
          (104, 'Frequent', 1, 1, 1),
          (105, 'Exact', 1, 1, 1),
          (106, 'Seasonal', 1, 1, 1);
    """)
    schedules = [
        (201, 101, 7, session_date + timedelta(days=1), 0),
        (202, 102, 10, session_date + timedelta(days=2), 0),
        (203, 103, 14, session_date + timedelta(days=4), 0),
        (204, 104, 3, session_date, 0),
        (205, 105, 14, session_date + timedelta(days=1), 1),
    ]
    await seeded_db.executemany(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, interval_days, next_due,
            rhythm_opt_out, is_active)
           VALUES (?, ?, 'water', ?, ?, ?, 1)""",
        schedules,
    )
    await seeded_db.execute(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, interval_days, next_due,
            season_adjust, is_active)
           VALUES (206, 106, 'water', 14, ?, ?, 1)""",
        (
            session_date,
            '{"spring": 0.2, "summer": 0.2, "autumn": 0.2, "winter": 0.2}',
        ),
    )
    await _insert_rhythm_config(seeded_db, outdoor_weekdays=[7])
    await seeded_db.commit()

    response = await client.get(
        "/api/calendar/events",
        params={
            "from": session_date.isoformat(),
            "to": (session_date + timedelta(days=4)).isoformat(),
        },
        headers=auth_header,
    )
    assert response.status_code == 200
    water_events = [event for event in response.json() if event["type"] == "water"]
    grouped = [event for event in water_events if event["grouped"]]
    exact = [event for event in water_events if not event["grouped"]]

    assert len(grouped) == 1
    assert grouped[0]["date"] == session_date.isoformat()
    assert grouped[0]["group_member_schedule_ids"] == [201, 202, 203]
    assert {event["schedule_id"]: event["routine_reason"] for event in exact} == {
        204: "too_frequent",
        205: "opted_out",
        206: "too_frequent",
    }


@pytest.mark.asyncio
async def test_environment_days_and_map_override_create_separate_sessions(
    client, seeded_db, auth_header,
):
    today = date.today()
    sunday = today + timedelta(days=(7 - today.isoweekday()) % 7 or 7)
    monday = sunday + timedelta(days=1)
    tuesday = sunday + timedelta(days=2)
    await seeded_db.executescript("""
        INSERT INTO maps (id, name, map_type, household_id) VALUES
          (1, 'Garden', 'outdoor', 1),
          (2, 'Living room', 'indoor', 1),
          (3, 'Greenhouse', 'outdoor', 1);
        INSERT INTO plants (id, name, household_id, map_id, is_active) VALUES
          (101, 'Rose', 1, 1, 1),
          (102, 'Fern', 1, 2, 1),
          (103, 'Tomato', 1, 3, 1);
    """)
    await seeded_db.executemany(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, interval_days, next_due, is_active)
           VALUES (?, ?, 'water', 7, ?, 1)""",
        [
            (201, 101, sunday + timedelta(days=4)),
            (202, 102, monday + timedelta(days=3)),
            (203, 103, tuesday + timedelta(days=2)),
        ],
    )
    await _insert_rhythm_config(
        seeded_db,
        outdoor_weekdays=[7],
        indoor_weekdays=[1],
        map_overrides=[{"map_id": 3, "weekdays": [2]}],
    )
    await seeded_db.commit()

    response = await client.get(
        "/api/calendar/events",
        params={"from": sunday.isoformat(), "to": tuesday.isoformat()},
        headers=auth_header,
    )
    assert response.status_code == 200
    sessions = {
        (event["map_id"], event["date"])
        for event in response.json()
        if event["type"] == "water" and event["routine_session"]
    }
    assert sessions == {
        (1, sunday.isoformat()),
        (2, monday.isoformat()),
        (3, tuesday.isoformat()),
    }


@pytest.mark.asyncio
async def test_exact_occurrence_id_is_stable_across_query_ranges(
    client, seeded_db, auth_header,
):
    today = date.today()
    canonical_date = today + timedelta(days=3)
    first_due = canonical_date - timedelta(days=3)
    await seeded_db.executescript("""
        INSERT INTO maps (id, name, map_type, household_id)
        VALUES (1, 'Garden', 'outdoor', 1);
        INSERT INTO plants (id, name, household_id, map_id, is_active)
        VALUES (101, 'Mint', 1, 1, 1);
    """)
    await seeded_db.execute(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, interval_days, next_due, is_active)
           VALUES (201, 101, 'water', 3, ?, 1)""",
        (first_due,),
    )
    await _insert_rhythm_config(
        seeded_db, outdoor_weekdays=[today.isoweekday()],
    )
    await seeded_db.commit()

    async def event_id(from_date: date) -> str:
        response = await client.get(
            "/api/calendar/events",
            params={
                "from": from_date.isoformat(),
                "to": canonical_date.isoformat(),
            },
            headers=auth_header,
        )
        assert response.status_code == 200
        return next(
            event["id"] for event in response.json()
            if event["schedule_id"] == 201
            and event["canonical_date"] == canonical_date.isoformat()
        )

    assert await event_id(canonical_date) == await event_id(first_due)


@pytest.mark.asyncio
async def test_legacy_pin_does_not_duplicate_natural_occurrence_at_range_start(
    client, seeded_db, auth_header,
):
    today = date.today()
    await seeded_db.executescript("""
        INSERT INTO maps (id, name, map_type, household_id)
        VALUES (1, 'Garden', 'outdoor', 1);
        INSERT INTO plants (id, name, household_id, map_id, is_active)
        VALUES (101, 'Rose', 1, 1, 1);
    """)
    await seeded_db.execute(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, interval_days, next_due, is_active)
           VALUES (201, 101, 'water', 7, ?, 1)""",
        (today - timedelta(days=7),),
    )
    await seeded_db.commit()

    response = await client.get(
        "/api/calendar/events",
        params={
            "from": today.isoformat(),
            "to": today.isoformat(),
            "pin_overdue": True,
        },
        headers=auth_header,
    )
    assert response.status_code == 200
    water_events = [event for event in response.json() if event["type"] == "water"]
    assert len(water_events) == 1
    assert water_events[0]["group_member_schedule_ids"] == [201]


@pytest.mark.asyncio
async def test_water_lookahead_does_not_fetch_non_water_schedules(
    client, seeded_db, auth_header, monkeypatch,
):
    from routers import calendar as calendar_router

    today = date.today()
    seen_care_types: list[str] = []
    original_compute = calendar_router.compute_plant_warnings

    def capture_schedules(plant, schedules, *args, **kwargs):
        seen_care_types.extend(schedule["care_type"] for schedule in schedules)
        return original_compute(plant, schedules, *args, **kwargs)

    monkeypatch.setattr(
        calendar_router, "compute_plant_warnings", capture_schedules,
    )
    await seeded_db.executescript("""
        INSERT INTO maps (id, name, map_type, household_id)
        VALUES (1, 'Garden', 'outdoor', 1);
        INSERT INTO plants (id, name, household_id, map_id, is_active)
        VALUES (101, 'Rose', 1, 1, 1);
    """)
    await seeded_db.executemany(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, interval_days, next_due, is_active)
           VALUES (?, 101, ?, ?, ?, 1)""",
        [
            (201, "water", 7, today + timedelta(days=1)),
            (202, "fertilize", 30, today + timedelta(days=3)),
        ],
    )
    await _insert_rhythm_config(
        seeded_db, outdoor_weekdays=[today.isoweekday()],
    )
    await seeded_db.commit()

    response = await client.get(
        "/api/calendar/events",
        params={
            "from": today.isoformat(),
            "to": (today + timedelta(days=1)).isoformat(),
        },
        headers=auth_header,
    )
    assert response.status_code == 200
    assert "water" in seen_care_types
    assert "fertilize" not in seen_care_types
