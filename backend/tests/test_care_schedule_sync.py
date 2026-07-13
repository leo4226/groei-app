"""Contract tests for atomic recurring-care schedule reconciliation (#606)."""
from datetime import date, timedelta

import pytest
import pytest_asyncio


@pytest_asyncio.fixture
async def schedule_sync_db(seeded_db):
    await seeded_db.executescript("""
        CREATE TABLE plant_species (
            id INTEGER PRIMARY KEY,
            phenology_json TEXT,
            common_name_nl TEXT,
            common_name_en TEXT
        );
        INSERT INTO households (id, name) VALUES (2, 'Other household');
        INSERT INTO maps (id, name, map_type, household_id) VALUES
            (1, 'Living room', 'indoor', 1),
            (2, 'Back garden', 'outdoor', 1);
        INSERT INTO plants (id, name, map_id, household_id, is_active) VALUES
            (1, 'Monstera', 1, 1, 1),
            (2, 'Rose', 2, 1, 1),
            (3, 'Foreign plant', 2, 2, 1);
        INSERT INTO care_schedules
            (id, plant_id, care_type, interval_days, next_due, last_done, is_active, is_ephemeral)
        VALUES
            (1, 1, 'water', 7, '2026-07-08', '2026-07-01T09:30:00', 1, 0),
            (2, 1, 'fertilize', 30, '2026-08-01', NULL, 0, 0),
            (3, 1, 'prune', 90, '2026-09-01', NULL, 1, 0),
            (4, 1, 'photo', 30, '2026-08-01', NULL, 1, 0),
            (5, 1, 'heat_protect', 1, '2026-07-13', NULL, 1, 1),
            (6, 3, 'water', 7, '2026-07-20', NULL, 1, 0);
    """)
    await seeded_db.commit()
    return seeded_db


@pytest.mark.asyncio
async def test_sync_creates_updates_reactivates_and_disables_atomically(
    client, schedule_sync_db, auth_header,
):
    response = await client.put(
        "/api/plants/1/care-schedules",
        headers=auth_header,
        json={"schedules": [
            {"care_type": "water", "interval_days": 14},
            {"care_type": "fertilize", "interval_days": 21},
            {"care_type": "pest_check", "interval_days": 30},
        ]},
    )

    assert response.status_code == 200
    returned = {row["care_type"]: row for row in response.json()["care_schedules"]}
    assert set(returned) == {"water", "fertilize", "pest_check", "photo", "heat_protect"}
    assert returned["water"]["interval_days"] == 14
    assert returned["water"]["next_due"] == "2026-07-15"
    assert returned["fertilize"]["next_due"] == str(date.today() + timedelta(days=21))
    assert returned["pest_check"]["next_due"] == str(date.today() + timedelta(days=30))

    rows = await schedule_sync_db.execute_fetchall(
        "SELECT care_type, interval_days, next_due, is_active, is_ephemeral "
        "FROM care_schedules WHERE plant_id = 1 ORDER BY id"
    )
    by_type = {row["care_type"]: row for row in rows}
    assert by_type["fertilize"]["is_active"] == 1
    assert by_type["prune"]["is_active"] == 0
    assert by_type["photo"]["is_active"] == 1
    assert by_type["heat_protect"]["is_active"] == 1
    assert by_type["heat_protect"]["is_ephemeral"] == 1


@pytest.mark.asyncio
async def test_sync_rejects_foreign_household(client, schedule_sync_db, auth_header):
    response = await client.put(
        "/api/plants/3/care-schedules",
        headers=auth_header,
        json={"schedules": [{"care_type": "water", "interval_days": 14}]},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("schedules", [
    [
        {"care_type": "water", "interval_days": 7},
        {"care_type": "water", "interval_days": 14},
    ],
    [{"care_type": "water", "interval_days": 0}],
    [{"care_type": "sing", "interval_days": 7}],
    [{"care_type": "heat_protect", "interval_days": 1}],
])
async def test_sync_rejects_invalid_payload_without_writes(
    client, schedule_sync_db, auth_header, schedules,
):
    before = await schedule_sync_db.execute_fetchall(
        "SELECT id, care_type, interval_days, next_due, is_active "
        "FROM care_schedules WHERE plant_id = 1 ORDER BY id"
    )

    response = await client.put(
        "/api/plants/1/care-schedules",
        headers=auth_header,
        json={"schedules": schedules},
    )

    assert response.status_code == 422
    after = await schedule_sync_db.execute_fetchall(
        "SELECT id, care_type, interval_days, next_due, is_active "
        "FROM care_schedules WHERE plant_id = 1 ORDER BY id"
    )
    assert after == before


@pytest.mark.asyncio
async def test_sync_rejects_environment_invalid_type_without_writes(
    client, schedule_sync_db, auth_header,
):
    response = await client.put(
        "/api/plants/2/care-schedules",
        headers=auth_header,
        json={"schedules": [{"care_type": "mist", "interval_days": 7}]},
    )

    assert response.status_code == 422
    rows = await schedule_sync_db.execute_fetchall(
        "SELECT id FROM care_schedules WHERE plant_id = 2"
    )
    assert rows == []
