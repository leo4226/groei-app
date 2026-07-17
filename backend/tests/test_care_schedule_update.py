"""Tests for PATCH /care/schedules/{id} endpoint.

Seam tests: auth guard, foreign plant guard, interval update, photo guard."""
import pytest
import pytest_asyncio


@pytest_asyncio.fixture
async def sched_db(seeded_db):
    db = seeded_db
    await db.executescript("""
        INSERT INTO plants (id, name, household_id) VALUES (1, 'Monstera', 1);
        INSERT INTO plants (id, name, household_id) VALUES (2, 'Foreign', 2);
        INSERT INTO households (id, name) VALUES (2, 'Other');
        INSERT INTO care_schedules
            (plant_id, care_type, interval_days, next_due, is_active, interval_source)
        VALUES (1, 'water', 7, '2026-06-10', 1, 'provisional');
        INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due, is_active)
        VALUES (1, 'photo', 30, '2026-06-20', 1);
    """)
    await db.commit()
    return db


@pytest.mark.asyncio
async def test_update_interval_requires_auth(client, sched_db):
    res = await client.patch(
        "/api/care/schedules/1",
        json={"interval_days": 14},
    )
    assert res.status_code in (401, 403)


@pytest.mark.asyncio
async def test_update_interval_rejects_foreign_schedule(client, sched_db, auth_header):
    # plant 2 belongs to household 2, account 1 is household 1
    await sched_db.executescript("""
        INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due, is_active)
        VALUES (2, 'water', 7, '2026-06-10', 1);
    """)
    await sched_db.commit()
    res = await client.patch(
        "/api/care/schedules/3",
        json={"interval_days": 14},
        headers=auth_header,
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_update_interval_success(client, sched_db, auth_header):
    res = await client.patch(
        "/api/care/schedules/1",
        json={"interval_days": 14},
        headers=auth_header,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["schedule_id"] == 1
    assert body["interval_days"] == 14

    rows = await sched_db.execute_fetchall(
        "SELECT interval_days, interval_source FROM care_schedules WHERE id = 1"
    )
    assert rows[0]["interval_days"] == 14
    assert rows[0]["interval_source"] == "manual"


@pytest.mark.asyncio
async def test_update_interval_rejects_photo_schedule(client, sched_db, auth_header):
    res = await client.patch(
        "/api/care/schedules/2",
        json={"interval_days": 14},
        headers=auth_header,
    )
    assert res.status_code == 400
    assert "photo" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_update_interval_rejects_nonpositive(client, sched_db, auth_header):
    res = await client.patch(
        "/api/care/schedules/1",
        json={"interval_days": 0},
        headers=auth_header,
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_update_interval_rejects_missing_field(client, sched_db, auth_header):
    res = await client.patch(
        "/api/care/schedules/1",
        json={},
        headers=auth_header,
    )
    assert res.status_code == 422
