"""Contract tests for atomic recurring-care schedule reconciliation (#606)."""
from datetime import date, timedelta

import pytest
import pytest_asyncio

from routers.plants import _care_schedule_lock_clause


def test_postgres_row_lock_targets_only_the_owned_plant_table():
    class ProductionAdapter:
        transaction = object()

    assert _care_schedule_lock_clause(ProductionAdapter()) == " FOR UPDATE OF p"
    assert _care_schedule_lock_clause(object()) == ""


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
            (id, plant_id, care_type, interval_days, next_due, last_done, notes, season_adjust, is_active, is_ephemeral)
        VALUES
            (1, 1, 'water', 7, '2026-07-08', '2026-07-01T09:30:00', 'keep me', '{"summer": 1}', 1, 0),
            (2, 1, 'fertilize', 30, '2026-08-01', NULL, NULL, NULL, 0, 0),
            (3, 1, 'prune', 90, '2026-09-01', NULL, NULL, NULL, 1, 0),
            (4, 1, 'photo', 30, '2026-08-01', NULL, NULL, NULL, 1, 0),
            (5, 1, 'heat_protect', 1, '2026-07-13', NULL, NULL, NULL, 1, 1),
            (6, 3, 'water', 7, '2026-07-20', NULL, NULL, NULL, 1, 0);
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
    assert returned["water"]["notes"] == "keep me"
    assert returned["water"]["season_adjust"] == '{"summer": 1}'
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


@pytest.mark.asyncio
async def test_sync_rolls_back_every_write_when_reconciliation_fails(
    client, schedule_sync_db, auth_header,
):
    await schedule_sync_db.execute("""
        CREATE TRIGGER fail_prune_disable
        BEFORE UPDATE OF is_active ON care_schedules
        WHEN OLD.care_type = 'prune'
        BEGIN
            SELECT RAISE(ABORT, 'forced reconciliation failure');
        END
    """)
    await schedule_sync_db.commit()

    with pytest.raises(Exception, match="forced reconciliation failure"):
        await client.put(
            "/api/plants/1/care-schedules",
            headers=auth_header,
            json={"schedules": [
                {"care_type": "water", "interval_days": 14},
                {"care_type": "pest_check", "interval_days": 30},
            ]},
        )

    rows = await schedule_sync_db.execute_fetchall(
        "SELECT care_type, interval_days, next_due, is_active "
        "FROM care_schedules WHERE plant_id = 1 ORDER BY id"
    )
    by_type = {row["care_type"]: row for row in rows}
    assert by_type["water"]["interval_days"] == 7
    assert by_type["water"]["next_due"] == "2026-07-08"
    assert by_type["prune"]["is_active"] == 1
    assert "pest_check" not in by_type


@pytest.mark.asyncio
async def test_sync_disables_all_persisted_alias_and_canonical_duplicates(
    client, schedule_sync_db, auth_header,
):
    await schedule_sync_db.execute(
        """INSERT INTO care_schedules
           (plant_id, care_type, interval_days, next_due, is_active, is_ephemeral)
           VALUES (1, 'repot', 540, '2027-01-01', 1, 0),
                  (1, 'repot_check', 365, '2026-12-01', 1, 0)"""
    )
    await schedule_sync_db.commit()

    response = await client.put(
        "/api/plants/1/care-schedules",
        headers=auth_header,
        json={"schedules": []},
    )

    assert response.status_code == 200
    rows = await schedule_sync_db.execute_fetchall(
        "SELECT care_type, is_active FROM care_schedules "
        "WHERE plant_id = 1 AND care_type IN ('repot', 'repot_check') ORDER BY id"
    )
    assert [row["is_active"] for row in rows] == [0, 0]
