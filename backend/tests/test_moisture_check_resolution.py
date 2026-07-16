from datetime import date

import pytest

from services import moisture_check_service
from services.moisture_check_service import (
    MoistureCheckSelectionError,
    resolve_moisture_checks,
)


COMPLETED = date(2026, 7, 16)


async def _seed(db):
    await db.execute("""
        CREATE TABLE care_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plant_id INTEGER NOT NULL,
            care_type TEXT NOT NULL,
            done_at DATETIME NOT NULL,
            done_by INTEGER,
            skipped INTEGER NOT NULL DEFAULT 0
        )
    """)
    await db.executemany(
        "INSERT INTO households (id, name) VALUES (?, ?)",
        [(2, "Other")],
    )
    await db.executemany(
        "INSERT INTO users (id, name, household_id) VALUES (?, ?, ?)",
        [(1, "Leon", 1), (2, "Other user", 2)],
    )
    await db.executemany(
        "INSERT INTO maps (id, name, map_type, household_id) VALUES (?, ?, ?, ?)",
        [(1, "Garden", "outdoor", 1), (2, "Other", "outdoor", 2)],
    )
    await db.executemany(
        """INSERT INTO plants (id, name, map_id, household_id, is_active)
           VALUES (?, ?, ?, ?, 1)""",
        [(1, "Tomato", 1, 1), (2, "Fern", 1, 1), (3, "Foreign", 2, 2)],
    )
    await db.executemany(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, interval_days, next_due, is_active,
            is_ephemeral, last_done, last_done_by)
           VALUES (?, ?, 'water', ?, ?, 1, 0, ?, ?)""",
        [
            (10, 1, 7, date(2026, 7, 20), "2026-07-09T08:00:00", 1),
            (20, 2, 10, date(2026, 7, 22), None, None),
            (30, 3, 7, date(2026, 7, 20), None, None),
        ],
    )
    await db.executemany(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, interval_days, next_due, is_active, is_ephemeral)
           VALUES (?, ?, 'moisture_check', 1, ?, 1, 1)""",
        [(11, 1, COMPLETED), (21, 2, COMPLETED), (31, 3, COMPLETED)],
    )
    await db.commit()


@pytest.mark.asyncio
async def test_still_moist_dismisses_only_selected_checks(seeded_db):
    await _seed(seeded_db)

    result = await resolve_moisture_checks(
        seeded_db,
        household_id=1,
        map_id=1,
        check_schedule_ids=[11],
        outcome="still_moist",
        completed_at=COMPLETED,
        user_id=1,
    )

    assert result == {"outcome": "still_moist", "affected_count": 1}
    checks = await seeded_db.execute_fetchall(
        """SELECT id, is_active, last_done, last_done_by
           FROM care_schedules WHERE care_type = 'moisture_check' ORDER BY id"""
    )
    assert checks[0]["id"] == 11
    assert checks[0]["is_active"] == 0
    assert str(checks[0]["last_done"]).startswith("2026-07-16")
    assert checks[0]["last_done_by"] == 1
    assert checks[1]["is_active"] == 1
    water = await seeded_db.execute_fetchall(
        "SELECT next_due, last_done FROM care_schedules WHERE id = 10"
    )
    assert water == [{"next_due": "2026-07-20", "last_done": "2026-07-09T08:00:00"}]
    assert await seeded_db.execute_fetchall("SELECT id FROM care_log") == []


@pytest.mark.asyncio
async def test_watered_updates_only_selected_canonical_schedules_and_is_retry_safe(seeded_db):
    await _seed(seeded_db)

    first = await resolve_moisture_checks(
        seeded_db,
        household_id=1,
        map_id=1,
        check_schedule_ids=[11],
        outcome="watered",
        completed_at=COMPLETED,
        user_id=1,
    )
    retry = await resolve_moisture_checks(
        seeded_db,
        household_id=1,
        map_id=1,
        check_schedule_ids=[11],
        outcome="watered",
        completed_at=COMPLETED,
        user_id=1,
    )

    assert first == {"outcome": "watered", "affected_count": 1}
    assert retry == {"outcome": "watered", "affected_count": 0}
    schedules = await seeded_db.execute_fetchall(
        """SELECT id, next_due, last_done, last_done_by, is_active
           FROM care_schedules WHERE id IN (10, 11, 20, 21) ORDER BY id"""
    )
    assert schedules[0]["next_due"] == "2026-07-23"
    assert str(schedules[0]["last_done"]).startswith("2026-07-16")
    assert schedules[0]["last_done_by"] == 1
    assert schedules[1]["is_active"] == 0
    assert schedules[2]["next_due"] == "2026-07-22"
    assert schedules[2]["last_done"] is None
    assert schedules[3]["is_active"] == 1
    logs = await seeded_db.execute_fetchall(
        "SELECT plant_id, care_type, done_by, skipped FROM care_log"
    )
    assert logs == [{"plant_id": 1, "care_type": "water", "done_by": 1, "skipped": 0}]


@pytest.mark.asyncio
async def test_resolution_rejects_foreign_or_mixed_selection_without_writes(seeded_db):
    await _seed(seeded_db)

    with pytest.raises(MoistureCheckSelectionError):
        await resolve_moisture_checks(
            seeded_db,
            household_id=1,
            map_id=1,
            check_schedule_ids=[11, 31],
            outcome="watered",
            completed_at=COMPLETED,
            user_id=1,
        )

    checks = await seeded_db.execute_fetchall(
        "SELECT id, is_active FROM care_schedules WHERE id IN (11, 31) ORDER BY id"
    )
    assert checks == [{"id": 11, "is_active": 1}, {"id": 31, "is_active": 1}]
    assert await seeded_db.execute_fetchall("SELECT id FROM care_log") == []


@pytest.mark.asyncio
async def test_resolution_rolls_back_all_writes_on_failure(seeded_db, monkeypatch):
    await _seed(seeded_db)

    def fail_next_due(*args, **kwargs):
        raise RuntimeError("schedule calculation failed")

    monkeypatch.setattr(moisture_check_service, "calculate_next_due", fail_next_due)

    with pytest.raises(RuntimeError, match="schedule calculation failed"):
        await resolve_moisture_checks(
            seeded_db,
            household_id=1,
            map_id=1,
            check_schedule_ids=[11],
            outcome="watered",
            completed_at=COMPLETED,
            user_id=1,
        )

    water = await seeded_db.execute_fetchall(
        "SELECT next_due, last_done FROM care_schedules WHERE id = 10"
    )
    assert water == [{"next_due": "2026-07-20", "last_done": "2026-07-09T08:00:00"}]
    check = await seeded_db.execute_fetchall(
        "SELECT is_active FROM care_schedules WHERE id = 11"
    )
    assert check == [{"is_active": 1}]
    assert await seeded_db.execute_fetchall("SELECT id FROM care_log") == []


@pytest.mark.asyncio
async def test_resolve_endpoint_requires_authentication(client):
    response = await client.post(
        "/api/care/moisture-checks/resolve",
        json={
            "map_id": 1,
            "check_schedule_ids": [11],
            "outcome": "still_moist",
            "completed_at": COMPLETED.isoformat(),
            "user_id": 1,
        },
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_resolve_endpoint_updates_selected_water_schedule(
    client, auth_header, seeded_db,
):
    await _seed(seeded_db)

    response = await client.post(
        "/api/care/moisture-checks/resolve",
        headers=auth_header,
        json={
            "map_id": 1,
            "check_schedule_ids": [11],
            "outcome": "watered",
            "completed_at": COMPLETED.isoformat(),
            "user_id": 1,
        },
    )

    assert response.status_code == 200
    assert response.json() == {"outcome": "watered", "affected_count": 1}
    water = await seeded_db.execute_fetchall(
        "SELECT next_due FROM care_schedules WHERE id = 10"
    )
    assert water == [{"next_due": "2026-07-23"}]


@pytest.mark.asyncio
async def test_resolve_endpoint_returns_machine_code_for_invalid_selection(
    client, auth_header, seeded_db,
):
    await _seed(seeded_db)

    response = await client.post(
        "/api/care/moisture-checks/resolve",
        headers=auth_header,
        json={
            "map_id": 1,
            "check_schedule_ids": [31],
            "outcome": "still_moist",
            "completed_at": COMPLETED.isoformat(),
            "user_id": 1,
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == {"code": "invalid_check_selection"}
