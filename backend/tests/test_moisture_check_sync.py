import json
from datetime import date

import pytest

from services.moisture_check_service import sync_moisture_checks


TODAY = date(2026, 7, 16)


def _outlook(*, level="high", reason="Drying demand is high", generated_at=TODAY):
    return {
        "generated_at": generated_at,
        "maps": [{
            "map_id": 1,
            "map_name": "Garden",
            "map_type": "outdoor",
            "level": level,
            "weather_status": "fresh",
            "temperature_source": "own_map",
            "source_timestamp": "2026-07-16T09:00:00+00:00",
            "high_count": int(level == "high"),
            "elevated_count": int(level == "elevated"),
            "plants": [{
                "plant_id": 1,
                "plant_name": "Tomato",
                "schedule_id": 10,
                "environment": "outdoor_container",
                "next_due": date(2026, 7, 20),
                "recommended_check_date": generated_at,
                "level": level,
                "score": 1.4 if level == "high" else 0.2,
                "reason_nl": "De grond droogt sneller uit.",
                "reason_en": reason,
                "factors": {"temperature_source": "own_map"},
            }],
        }],
    }


async def _seed(db):
    await db.executemany(
        "INSERT INTO maps (id, name, map_type, household_id) VALUES (?, ?, ?, ?)",
        [(1, "Garden", "outdoor", 1), (2, "Other", "outdoor", 2)],
    )
    await db.executemany(
        """INSERT INTO plants (id, name, map_id, household_id, is_active)
           VALUES (?, ?, ?, ?, 1)""",
        [(1, "Tomato", 1, 1), (2, "Foreign", 2, 2)],
    )
    await db.executemany(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, interval_days, next_due, is_active, is_ephemeral)
           VALUES (?, ?, 'water', 7, ?, 1, 0)""",
        [(10, 1, date(2026, 7, 20)), (20, 2, date(2026, 7, 20))],
    )
    await db.execute(
        """CREATE UNIQUE INDEX uq_test_active_moisture_check
           ON care_schedules (plant_id)
           WHERE is_ephemeral = 1 AND is_active = TRUE
             AND care_type = 'moisture_check'"""
    )
    await db.commit()


@pytest.mark.asyncio
async def test_sync_creates_one_check_and_refreshes_bilingual_reason(seeded_db):
    await _seed(seeded_db)

    first = await sync_moisture_checks(
        seeded_db, household_id=1, outlook=_outlook(),
    )
    second = await sync_moisture_checks(
        seeded_db,
        household_id=1,
        outlook=_outlook(reason="Updated dry-weather reason"),
    )

    assert first == {"created": 1, "updated": 0, "deactivated": 0}
    assert second == {"created": 0, "updated": 1, "deactivated": 0}
    rows = await seeded_db.execute_fetchall(
        """SELECT id, plant_id, care_type, next_due, is_active, is_ephemeral, notes
           FROM care_schedules WHERE care_type = 'moisture_check'"""
    )
    assert len(rows) == 1
    assert rows[0]["plant_id"] == 1
    assert rows[0]["next_due"] == TODAY.isoformat()
    assert rows[0]["is_active"] == 1
    assert rows[0]["is_ephemeral"] == 1
    metadata = json.loads(rows[0]["notes"])
    assert metadata["water_schedule_id"] == 10
    assert metadata["reason_nl"] == "De grond droogt sneller uit."
    assert metadata["reason_en"] == "Updated dry-weather reason"
    assert metadata["temperature_source"] == "own_map"


@pytest.mark.asyncio
async def test_sync_deactivates_normalized_and_stale_checks_but_not_other_households(seeded_db):
    await _seed(seeded_db)
    await seeded_db.executemany(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, interval_days, next_due, is_active, is_ephemeral)
           VALUES (?, ?, 'moisture_check', 1, ?, 1, 1)""",
        [(11, 1, TODAY), (21, 2, TODAY)],
    )
    await seeded_db.commit()

    result = await sync_moisture_checks(
        seeded_db, household_id=1, outlook=_outlook(level="normal"),
    )

    assert result == {"created": 0, "updated": 0, "deactivated": 1}
    rows = await seeded_db.execute_fetchall(
        "SELECT id, is_active FROM care_schedules WHERE care_type = 'moisture_check' ORDER BY id"
    )
    assert rows == [{"id": 11, "is_active": 0}, {"id": 21, "is_active": 1}]


@pytest.mark.asyncio
async def test_same_day_still_moist_resolution_suppresses_recreation(seeded_db):
    await _seed(seeded_db)
    await seeded_db.execute(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, interval_days, next_due, is_active,
            is_ephemeral, last_done, last_done_by)
           VALUES (11, 1, 'moisture_check', 1, ?, 0, 1, ?, 1)""",
        (TODAY, "2026-07-16T10:00:00"),
    )
    await seeded_db.commit()

    result = await sync_moisture_checks(
        seeded_db, household_id=1, outlook=_outlook(),
    )

    assert result == {"created": 0, "updated": 0, "deactivated": 0}
    active = await seeded_db.execute_fetchall(
        """SELECT id FROM care_schedules
           WHERE plant_id = 1 AND care_type = 'moisture_check' AND is_active = 1"""
    )
    assert active == []

    # A sustained high-pressure episode must not recreate completed work.
    tomorrow = date(2026, 7, 17)
    sustained = await sync_moisture_checks(
        seeded_db,
        household_id=1,
        outlook=_outlook(generated_at=tomorrow),
    )
    assert sustained == {"created": 0, "updated": 0, "deactivated": 0}

    # Fresh normal pressure closes the episode; a later new high can create a check.
    await sync_moisture_checks(
        seeded_db,
        household_id=1,
        outlook=_outlook(level="normal", generated_at=tomorrow),
    )
    next_high = await sync_moisture_checks(
        seeded_db,
        household_id=1,
        outlook=_outlook(generated_at=date(2026, 7, 18)),
    )
    assert next_high == {"created": 1, "updated": 0, "deactivated": 0}


@pytest.mark.asyncio
async def test_canonical_water_completion_deactivates_an_existing_check(seeded_db):
    await _seed(seeded_db)
    assert await sync_moisture_checks(
        seeded_db, household_id=1, outlook=_outlook(),
    ) == {"created": 1, "updated": 0, "deactivated": 0}

    await seeded_db.execute(
        "UPDATE care_schedules SET last_done = ? WHERE id = 10",
        ("2026-07-16T12:00:00",),
    )
    await seeded_db.commit()

    result = await sync_moisture_checks(
        seeded_db,
        household_id=1,
        outlook=_outlook(generated_at=date(2026, 7, 17)),
    )

    assert result == {"created": 0, "updated": 0, "deactivated": 1}
    checks = await seeded_db.execute_fetchall(
        "SELECT is_active FROM care_schedules WHERE care_type = 'moisture_check'"
    )
    assert checks == [{"is_active": 0}]
