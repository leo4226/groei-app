"""Regression tests for #119: admin account deletion must not destroy a shared
household, and /admin/accounts/bulk must be routable (defined before the
/{account_id} param route).

Fixture layout (account 1 / household 1 from conftest is the acting admin):
  household 2 — "Shared":  account 2 (Anna) + account 3 (Bob), plants for both
  household 3 — "Solo":    account 4 (Carol), one plant
"""
import pytest
import pytest_asyncio

EXTRA_SCHEMA = """
    CREATE TABLE care_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, plant_id INTEGER,
        care_type TEXT, done_at TEXT, done_by INTEGER, notes TEXT
    );
    CREATE TABLE garden_fertilize_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, fertilized_at TEXT, fertilized_by INTEGER
    );
    CREATE TABLE weed_sightings (id INTEGER PRIMARY KEY AUTOINCREMENT, map_id INTEGER);
    CREATE TABLE zones (id INTEGER PRIMARY KEY AUTOINCREMENT, map_id INTEGER);
    CREATE TABLE ground_zones (id TEXT PRIMARY KEY, map_id INTEGER);
    CREATE TABLE objects (id INTEGER PRIMARY KEY AUTOINCREMENT, map_id INTEGER);
    CREATE TABLE household_invites (
        id INTEGER PRIMARY KEY AUTOINCREMENT, household_id INTEGER, code TEXT,
        created_by INTEGER, expires_at TEXT, used_at TEXT
    );
    CREATE TABLE password_reset_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER,
        token TEXT, expires_at TEXT, used_at TEXT
    );
"""


@pytest_asyncio.fixture
async def delete_fixture(seeded_db):
    db = seeded_db
    await db.execute("UPDATE accounts SET is_admin = 1 WHERE id = 1")
    await db.executescript(EXTRA_SCHEMA)
    await db.executescript("""
        INSERT INTO households (id, name) VALUES (2, 'Shared'), (3, 'Solo');
        INSERT INTO accounts (id, household_id, email, name, password_hash) VALUES
            (2, 2, 'anna@example.com', 'Anna', 'x'),
            (3, 2, 'bob@example.com', 'Bob', 'x'),
            (4, 3, 'carol@example.com', 'Carol', 'x');
        INSERT INTO users (id, name, household_id) VALUES
            (12, 'Anna', 2), (13, 'Bob', 2), (14, 'Carol', 3);
        INSERT INTO plants (id, name, household_id) VALUES
            (102, 'Anna plant', 2), (103, 'Bob plant', 2), (104, 'Carol plant', 3);
        INSERT INTO maps (id, name, household_id) VALUES (22, 'Shared garden', 2), (33, 'Solo garden', 3);
        INSERT INTO care_log (plant_id, care_type, done_at, done_by) VALUES
            (102, 'water', '2026-06-01', 13);
        INSERT INTO care_schedules (plant_id, care_type, interval_days, last_done_by) VALUES
            (102, 'water', 7, 13);
        INSERT INTO household_invites (household_id, code, created_by, expires_at) VALUES
            (2, 'AAAAAA', 2, '2099-01-01'),
            (2, 'BBBBBB', 3, '2099-01-01');
        INSERT INTO password_reset_tokens (account_id, token, expires_at) VALUES
            (3, 'tok-bob', '2099-01-01');
    """)
    await db.commit()
    return db


async def _count(db, sql, params=()):
    rows = await db.execute_fetchall(sql, params)
    return rows[0]["n"]


@pytest.mark.asyncio
async def test_delete_one_account_keeps_shared_household(client, delete_fixture, auth_header):
    db = delete_fixture
    res = await client.delete("/api/admin/accounts/3", headers=auth_header)
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "deleted"
    assert body["household_deleted"] is False

    # Bob's account, users row, and account-linked rows are gone
    assert await _count(db, "SELECT COUNT(*) n FROM accounts WHERE id = 3") == 0
    assert await _count(db, "SELECT COUNT(*) n FROM users WHERE id = 13") == 0
    assert await _count(db, "SELECT COUNT(*) n FROM password_reset_tokens WHERE account_id = 3") == 0
    assert await _count(db, "SELECT COUNT(*) n FROM household_invites WHERE created_by = 3") == 0

    # Anna and the shared household survive untouched
    assert await _count(db, "SELECT COUNT(*) n FROM accounts WHERE id = 2") == 1
    assert await _count(db, "SELECT COUNT(*) n FROM households WHERE id = 2") == 1
    assert await _count(db, "SELECT COUNT(*) n FROM plants WHERE household_id = 2") == 2
    assert await _count(db, "SELECT COUNT(*) n FROM maps WHERE household_id = 2") == 1
    assert await _count(db, "SELECT COUNT(*) n FROM users WHERE id = 12") == 1
    assert await _count(db, "SELECT COUNT(*) n FROM household_invites WHERE created_by = 2") == 1

    # Bob's care references were NULLed, not deleted
    rows = await db.execute_fetchall("SELECT done_by FROM care_log WHERE plant_id = 102")
    assert rows[0]["done_by"] is None
    rows = await db.execute_fetchall("SELECT last_done_by FROM care_schedules WHERE plant_id = 102")
    assert rows[0]["last_done_by"] is None


@pytest.mark.asyncio
async def test_delete_last_account_removes_household(client, delete_fixture, auth_header):
    db = delete_fixture
    res = await client.delete("/api/admin/accounts/4", headers=auth_header)
    assert res.status_code == 200
    assert res.json()["household_deleted"] is True

    assert await _count(db, "SELECT COUNT(*) n FROM accounts WHERE household_id = 3") == 0
    assert await _count(db, "SELECT COUNT(*) n FROM households WHERE id = 3") == 0
    assert await _count(db, "SELECT COUNT(*) n FROM plants WHERE household_id = 3") == 0
    assert await _count(db, "SELECT COUNT(*) n FROM maps WHERE household_id = 3") == 0
    assert await _count(db, "SELECT COUNT(*) n FROM users WHERE household_id = 3") == 0


@pytest.mark.asyncio
async def test_bulk_delete_whole_household(client, delete_fixture, auth_header):
    db = delete_fixture
    res = await client.request(
        "DELETE", "/api/admin/accounts/bulk",
        json={"account_ids": [2, 3]}, headers=auth_header,
    )
    # Would be 422 if the {account_id} route shadowed /bulk (route-order trap)
    assert res.status_code == 200
    body = res.json()
    assert body["households_cleared"] == 1

    assert await _count(db, "SELECT COUNT(*) n FROM accounts WHERE household_id = 2") == 0
    assert await _count(db, "SELECT COUNT(*) n FROM households WHERE id = 2") == 0
    assert await _count(db, "SELECT COUNT(*) n FROM plants WHERE household_id = 2") == 0

    # Unrelated household untouched
    assert await _count(db, "SELECT COUNT(*) n FROM accounts WHERE id = 4") == 1
    assert await _count(db, "SELECT COUNT(*) n FROM plants WHERE household_id = 3") == 1


@pytest.mark.asyncio
async def test_bulk_delete_partial_household_keeps_rest(client, delete_fixture, auth_header):
    db = delete_fixture
    res = await client.request(
        "DELETE", "/api/admin/accounts/bulk",
        json={"account_ids": [3]}, headers=auth_header,
    )
    assert res.status_code == 200
    assert res.json()["households_cleared"] == 0

    assert await _count(db, "SELECT COUNT(*) n FROM accounts WHERE id = 2") == 1
    assert await _count(db, "SELECT COUNT(*) n FROM households WHERE id = 2") == 1
    assert await _count(db, "SELECT COUNT(*) n FROM plants WHERE household_id = 2") == 2


@pytest.mark.asyncio
async def test_cannot_delete_self(client, delete_fixture, auth_header):
    res = await client.delete("/api/admin/accounts/1", headers=auth_header)
    assert res.status_code == 400

    res = await client.request(
        "DELETE", "/api/admin/accounts/bulk",
        json={"account_ids": [1, 3]}, headers=auth_header,
    )
    assert res.status_code == 400
