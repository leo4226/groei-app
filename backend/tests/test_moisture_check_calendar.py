import json
from datetime import date

import pytest

from routers import calendar as calendar_router


TODAY = date(2026, 7, 16)


@pytest.mark.asyncio
async def test_calendar_groups_moisture_checks_per_map_with_member_reasons(
    client, auth_header, seeded_db, monkeypatch,
):
    await seeded_db.execute(
        "INSERT INTO maps (id, name, map_type, household_id) VALUES (1, 'Garden', 'outdoor', 1)"
    )
    await seeded_db.executemany(
        """INSERT INTO plants (id, name, map_id, household_id, is_active)
           VALUES (?, ?, 1, 1, 1)""",
        [(1, "Tomato"), (2, "Basil")],
    )
    await seeded_db.executemany(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, interval_days, next_due, is_active,
            is_ephemeral, notes)
           VALUES (?, ?, 'moisture_check', 1, ?, 1, 1, ?)""",
        [
            (11, 1, TODAY, json.dumps({
                "reason_nl": "De tomaat droogt sneller uit.",
                "reason_en": "The tomato is drying faster.",
                "temperature_source": "own_map",
                "water_schedule_id": 10,
            })),
            (21, 2, TODAY, json.dumps({
                "reason_nl": "De basilicum droogt sneller uit.",
                "reason_en": "The basil is drying faster.",
                "temperature_source": "own_map",
                "water_schedule_id": 20,
            })),
        ],
    )
    await seeded_db.commit()

    async def no_weather_sync(db):
        return {"warning_weather": None}

    async def no_moisture_sync(db, **kwargs):
        return {"created": 0, "updated": 0, "deactivated": 0}

    async def empty_outlook(db, **kwargs):
        return {"generated_at": TODAY, "maps": []}

    monkeypatch.setattr(calendar_router, "sync_ephemeral_schedules", no_weather_sync)
    monkeypatch.setattr(calendar_router, "sync_moisture_checks", no_moisture_sync)
    monkeypatch.setattr(calendar_router, "build_water_outlook", empty_outlook)

    response = await client.get(
        "/api/calendar/events",
        headers=auth_header,
        params={"from": TODAY.isoformat(), "to": TODAY.isoformat()},
    )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    event = payload[0]
    assert event["id"] == "moisture:1:2026-07-16"
    assert event["type"] == "moisture_check"
    assert event["map_id"] == 1
    assert event["grouped"] is True
    assert event["group_count"] == 2
    assert event["group_member_schedule_ids"] == [11, 21]
    assert event["weather_triggered"] is True
    assert event["reason_nl"]
    assert event["reason_en"]
    assert [member["reason_nl"] for member in event["group_members"]] == [
        "De tomaat droogt sneller uit.",
        "De basilicum droogt sneller uit.",
    ]
    assert [member["reason_en"] for member in event["group_members"]] == [
        "The tomato is drying faster.",
        "The basil is drying faster.",
    ]


@pytest.mark.asyncio
async def test_calendar_read_materializes_high_pressure_before_listing_events(
    client, auth_header, seeded_db, monkeypatch,
):
    await seeded_db.execute(
        "INSERT INTO maps (id, name, map_type, household_id) VALUES (1, 'Garden', 'outdoor', 1)"
    )
    await seeded_db.execute(
        """INSERT INTO plants (id, name, map_id, household_id, is_active)
           VALUES (1, 'Tomato', 1, 1, 1)"""
    )
    await seeded_db.execute(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, interval_days, next_due, is_active, is_ephemeral)
           VALUES (10, 1, 'water', 7, '2026-07-20', 1, 0)"""
    )
    await seeded_db.commit()

    async def no_weather_sync(db):
        return {"warning_weather": None}

    async def high_outlook(db, **kwargs):
        return {
            "generated_at": TODAY,
            "maps": [{
                "map_id": 1,
                "map_name": "Garden",
                "map_type": "outdoor",
                "level": "high",
                "weather_status": "fresh",
                "temperature_source": "own_map",
                "source_timestamp": "2026-07-16T09:00:00+00:00",
                "high_count": 1,
                "elevated_count": 0,
                "plants": [{
                    "plant_id": 1,
                    "plant_name": "Tomato",
                    "schedule_id": 10,
                    "environment": "outdoor_container",
                    "next_due": date(2026, 7, 20),
                    "recommended_check_date": TODAY,
                    "level": "high",
                    "score": 1.4,
                    "reason_nl": "De tomaat droogt sneller uit.",
                    "reason_en": "The tomato is drying faster.",
                    "factors": {},
                }],
            }],
        }

    monkeypatch.setattr(calendar_router, "sync_ephemeral_schedules", no_weather_sync)
    monkeypatch.setattr(calendar_router, "build_water_outlook", high_outlook)

    response = await client.get(
        "/api/calendar/events",
        headers=auth_header,
        params={"from": TODAY.isoformat(), "to": TODAY.isoformat()},
    )

    assert response.status_code == 200
    assert [event["id"] for event in response.json()] == ["moisture:1:2026-07-16"]
    checks = await seeded_db.execute_fetchall(
        """SELECT plant_id, is_active, is_ephemeral
           FROM care_schedules WHERE care_type = 'moisture_check'"""
    )
    assert checks == [{"plant_id": 1, "is_active": 1, "is_ephemeral": 1}]
