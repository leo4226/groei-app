"""Tests for the care undo endpoint (issue #174)."""
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
async def undo_db(seeded_db):
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
async def test_care_done_returns_previous_state(client, undo_db, auth_header):
    """/care/done now returns previous schedule state for undo."""
    res = await client.post(
        "/api/care/done",
        json={"plant_id": 1, "care_type": "water", "user_id": 1},
        headers=auth_header,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["previous_next_due"] == "2026-06-10"
    assert body["previous_last_done"] is None  # first time, no previous
    assert body["previous_last_done_by"] is None
    assert isinstance(body["care_log_id"], int)
    assert body["ok"] is True
    assert body["next_due"] > "2026-06-10"


@pytest.mark.asyncio
async def test_care_undo_restores_schedule(client, undo_db, auth_header):
    """Undo deletes care_log and restores schedule to previous state."""
    # First, mark care done and capture the undo data
    res = await client.post(
        "/api/care/done",
        json={"plant_id": 1, "care_type": "water", "user_id": 1},
        headers=auth_header,
    )
    assert res.status_code == 200
    done = res.json()
    care_log_id = done["care_log_id"]

    # Verify schedule was updated
    rows = await undo_db.execute_fetchall(
        "SELECT next_due, last_done, last_done_by FROM care_schedules WHERE id = 1"
    )
    assert rows[0]["last_done"] is not None
    assert rows[0]["last_done_by"] == 1
    assert str(rows[0]["next_due"]) > "2026-06-10"

    # Undo
    res2 = await client.post(
        "/api/care/undo",
        json={
            "care_log_id": care_log_id,
            "previous_next_due": done["previous_next_due"],
            "previous_last_done": done["previous_last_done"],
            "previous_last_done_by": done["previous_last_done_by"],
        },
        headers=auth_header,
    )
    assert res2.status_code == 200
    assert res2.json()["ok"] is True

    # Verify schedule is restored
    rows2 = await undo_db.execute_fetchall(
        "SELECT next_due, last_done, last_done_by FROM care_schedules WHERE id = 1"
    )
    assert rows2[0]["last_done"] is None  # restored to before first care
    assert rows2[0]["last_done_by"] is None
    assert str(rows2[0]["next_due"]) == "2026-06-10"

    # Verify care_log is deleted
    logs = await undo_db.execute_fetchall(
        "SELECT id FROM care_log WHERE id = ?", (care_log_id,)
    )
    assert len(logs) == 0


@pytest.mark.asyncio
async def test_care_undo_restores_existing_last_done_state(client, undo_db, auth_header):
    """Undo preserves the schedule state that existed before the new action."""
    await undo_db.execute(
        """UPDATE care_schedules
           SET next_due = ?, last_done = ?, last_done_by = ?
           WHERE id = 1""",
        ("2026-06-12", "2026-06-01T09:30:00", 1),
    )
    await undo_db.commit()

    res = await client.post(
        "/api/care/done",
        json={"plant_id": 1, "care_type": "water", "user_id": 1},
        headers=auth_header,
    )
    assert res.status_code == 200
    done = res.json()
    assert done["previous_next_due"] == "2026-06-12"
    assert done["previous_last_done"] == "2026-06-01T09:30:00"
    assert done["previous_last_done_by"] == 1

    res2 = await client.post(
        "/api/care/undo",
        json={
            "care_log_id": done["care_log_id"],
            "previous_next_due": done["previous_next_due"],
            "previous_last_done": done["previous_last_done"],
            "previous_last_done_by": done["previous_last_done_by"],
        },
        headers=auth_header,
    )
    assert res2.status_code == 200

    rows = await undo_db.execute_fetchall(
        "SELECT next_due, last_done, last_done_by FROM care_schedules WHERE id = 1"
    )
    assert str(rows[0]["next_due"]) == "2026-06-12"
    assert str(rows[0]["last_done"]) == "2026-06-01T09:30:00"
    assert rows[0]["last_done_by"] == 1


@pytest.mark.asyncio
async def test_care_undo_rejects_foreign_household(client, undo_db, auth_header):
    """Undo scoped to caller's household — 404 for foreign care_log."""
    # Create a care log for household 1
    res = await client.post(
        "/api/care/done",
        json={"plant_id": 1, "care_type": "water", "user_id": 1},
        headers=auth_header,
    )
    assert res.status_code == 200
    care_log_id = res.json()["care_log_id"]

    # Create a second household with different token
    await undo_db.execute(
        "INSERT INTO households (id, name) VALUES (2, 'Other')"
    )
    await undo_db.execute(
        "INSERT INTO accounts (id, household_id, email, name, password_hash) "
        "VALUES (2, 2, 'other@example.com', 'Other', 'x')"
    )
    await undo_db.commit()

    from auth import create_token
    other_header = {"Authorization": f"Bearer {create_token(account_id=2, household_id=2)}"}

    # Try to undo with foreign household — should 404
    res2 = await client.post(
        "/api/care/undo",
        json={
            "care_log_id": care_log_id,
            "previous_next_due": "2026-06-10",
            "previous_last_done": None,
            "previous_last_done_by": None,
        },
        headers=other_header,
    )
    assert res2.status_code == 404
    assert "not found" in res2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_care_undo_requires_auth(client, undo_db):
    """Undo endpoint requires authentication."""
    res = await client.post(
        "/api/care/undo",
        json={
            "care_log_id": 1,
            "previous_next_due": "2026-06-10",
            "previous_last_done": None,
            "previous_last_done_by": None,
        },
    )
    assert res.status_code in (401, 403)


@pytest.mark.asyncio
async def test_care_undo_nonexistent_log(client, undo_db, auth_header):
    """Undo on a non-existent care_log_id returns 404."""
    res = await client.post(
        "/api/care/undo",
        json={
            "care_log_id": 999,
            "previous_next_due": "2026-06-10",
            "previous_last_done": None,
            "previous_last_done_by": None,
        },
        headers=auth_header,
    )
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()
