"""PR 2 of the photo journal: care-log photos + photo-reminder schedule."""
import pytest
import pytest_asyncio

EXTRA_SCHEMA = """
    CREATE TABLE care_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, plant_id INTEGER,
        care_type TEXT, done_by INTEGER, done_at TEXT, notes TEXT,
        skipped BOOLEAN DEFAULT FALSE
    );
"""


@pytest_asyncio.fixture
async def care_db(seeded_db):
    db = seeded_db
    await db.executescript(EXTRA_SCHEMA)
    await db.executescript("""
        INSERT INTO plants (id, name, household_id) VALUES (1, 'Monstera', 1);
        INSERT INTO users (id, name, household_id) VALUES (1, 'Test', 1);
        INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due, is_active)
        VALUES (1, 'water', 7, '2026-06-10', 1);
    """)
    await db.commit()
    return db


@pytest.mark.asyncio
async def test_care_done_returns_care_log_id(client, care_db, auth_header):
    res = await client.post(
        "/api/care/done",
        json={"plant_id": 1, "care_type": "water", "user_id": 1},
        headers=auth_header,
    )
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body.get("care_log_id"), int)

    rows = await care_db.execute_fetchall(
        "SELECT id FROM care_log WHERE plant_id = 1"
    )
    assert rows[0]["id"] == body["care_log_id"]
