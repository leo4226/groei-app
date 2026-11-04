"""Signing out everywhere and deleting your own account (Settings → You).

Fixture layout: household 1 from conftest holds account 1 (the owner, Leon).
`with_member` adds account 2 (Lisbeth, an editor) to the same household.
"""
import pytest
import pytest_asyncio

from auth import hash_password


EXTRA_SCHEMA = """
    CREATE TABLE care_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, plant_id INTEGER,
        care_type TEXT, done_at TEXT, done_by INTEGER, notes TEXT
    );
    CREATE TABLE weed_sightings (id INTEGER PRIMARY KEY AUTOINCREMENT, map_id INTEGER);
    CREATE TABLE zones (id INTEGER PRIMARY KEY AUTOINCREMENT, map_id INTEGER);
    CREATE TABLE ground_zones (id TEXT PRIMARY KEY, map_id INTEGER);
    CREATE TABLE objects (id INTEGER PRIMARY KEY AUTOINCREMENT, map_id INTEGER);
    CREATE TABLE password_reset_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER,
        token TEXT, expires_at TEXT, used_at TEXT
    );
"""


@pytest_asyncio.fixture
async def account_db(seeded_db):
    db = seeded_db
    await db.executescript(EXTRA_SCHEMA)
    await db.execute(
        "UPDATE accounts SET email = 'leon@example.com', password_hash = ?, role = 'owner' WHERE id = 1",
        (hash_password("leon-password"),),
    )
    await db.executescript("""
        INSERT INTO users (id, name, household_id, account_id) VALUES (1, 'Leon', 1, 1);
        INSERT INTO plants (id, name, household_id) VALUES (101, 'Monstera', 1);
        INSERT INTO maps (id, name, household_id) VALUES (11, 'Tuin', 1);
    """)
    await db.commit()
    return db


@pytest_asyncio.fixture
async def with_member(account_db):
    db = account_db
    await db.execute(
        "INSERT INTO accounts (id, household_id, email, name, password_hash, role) "
        "VALUES (2, 1, 'lisbeth@example.com', 'Lisbeth', ?, 'editor')",
        (hash_password("lisbeth-password"),),
    )
    await db.executescript("""
        INSERT INTO users (id, name, household_id, account_id) VALUES (2, 'Lisbeth', 1, 2);
        INSERT INTO care_log (plant_id, care_type, done_at, done_by) VALUES (101, 'water', '2026-10-01', 2);
    """)
    await db.commit()
    return db


async def _login(client, email: str, password: str) -> dict[str, str]:
    response = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


async def _count(db, sql: str, params=()) -> int:
    rows = await db.execute_fetchall(sql, params)
    return rows[0]["n"]


@pytest.mark.asyncio
async def test_logout_all_ends_every_session_including_this_one(client, account_db):
    phone = await _login(client, "leon@example.com", "leon-password")
    laptop = await _login(client, "leon@example.com", "leon-password")

    response = await client.post("/api/auth/logout-all", headers=phone)

    assert response.status_code == 204
    assert (await client.get("/api/auth/me", headers=phone)).status_code == 401
    assert (await client.get("/api/auth/me", headers=laptop)).status_code == 401
    # The password still works: signing in again is how you get back.
    fresh = await _login(client, "leon@example.com", "leon-password")
    assert (await client.get("/api/auth/me", headers=fresh)).status_code == 200


@pytest.mark.asyncio
async def test_logout_all_leaves_other_members_signed_in(client, with_member):
    leon = await _login(client, "leon@example.com", "leon-password")
    lisbeth = await _login(client, "lisbeth@example.com", "lisbeth-password")

    await client.post("/api/auth/logout-all", headers=leon)

    assert (await client.get("/api/auth/me", headers=lisbeth)).status_code == 200


@pytest.mark.asyncio
async def test_delete_account_needs_the_password(client, account_db):
    headers = await _login(client, "leon@example.com", "leon-password")

    response = await client.post(
        "/api/auth/delete-account", json={"password": "wrong"}, headers=headers,
    )

    assert response.status_code == 400
    assert response.json()["detail"] == {"code": "wrong_password"}
    assert await _count(account_db, "SELECT COUNT(*) n FROM accounts WHERE id = 1") == 1


@pytest.mark.asyncio
async def test_member_leaves_and_their_history_stays(client, with_member):
    db = with_member
    lisbeth = await _login(client, "lisbeth@example.com", "lisbeth-password")

    response = await client.post(
        "/api/auth/delete-account", json={"password": "lisbeth-password"}, headers=lisbeth,
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"household_deleted": False}
    assert await _count(db, "SELECT COUNT(*) n FROM accounts WHERE id = 2") == 0
    assert await _count(db, "SELECT COUNT(*) n FROM users WHERE id = 2") == 0
    # The household, its plants and the care she logged all stay.
    assert await _count(db, "SELECT COUNT(*) n FROM households WHERE id = 1") == 1
    assert await _count(db, "SELECT COUNT(*) n FROM plants WHERE id = 101") == 1
    rows = await db.execute_fetchall("SELECT done_by FROM care_log WHERE plant_id = 101")
    assert [row["done_by"] for row in rows] == [None]
    assert (await client.get("/api/auth/me", headers=lisbeth)).status_code == 401


@pytest.mark.asyncio
async def test_viewer_can_delete_their_own_account(client, with_member):
    db = with_member
    await db.execute("UPDATE accounts SET role = 'viewer' WHERE id = 2")
    await db.commit()
    lisbeth = await _login(client, "lisbeth@example.com", "lisbeth-password")

    response = await client.post(
        "/api/auth/delete-account", json={"password": "lisbeth-password"}, headers=lisbeth,
    )

    assert response.status_code == 200, response.text
    assert await _count(db, "SELECT COUNT(*) n FROM accounts WHERE id = 2") == 0


@pytest.mark.asyncio
async def test_owner_cannot_leave_while_others_are_in_the_household(client, with_member):
    db = with_member
    leon = await _login(client, "leon@example.com", "leon-password")

    response = await client.post(
        "/api/auth/delete-account", json={"password": "leon-password"}, headers=leon,
    )

    assert response.status_code == 409
    assert response.json()["detail"] == {"code": "owner_has_members"}
    assert await _count(db, "SELECT COUNT(*) n FROM accounts WHERE id = 1") == 1
    assert await _count(db, "SELECT COUNT(*) n FROM plants WHERE household_id = 1") == 1


@pytest.mark.asyncio
async def test_last_member_takes_the_household_with_them(client, account_db):
    db = account_db
    # Garden-wide logs reference the household directly; they used to block
    # the household delete on Postgres.
    await db.execute(
        "INSERT INTO garden_water_log (watered_at, watered_by, household_id) VALUES ('2026-10-01', 1, 1)"
    )
    await db.commit()
    leon = await _login(client, "leon@example.com", "leon-password")

    response = await client.post(
        "/api/auth/delete-account", json={"password": "leon-password"}, headers=leon,
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"household_deleted": True}
    assert await _count(db, "SELECT COUNT(*) n FROM accounts WHERE id = 1") == 0
    assert await _count(db, "SELECT COUNT(*) n FROM households WHERE id = 1") == 0
    assert await _count(db, "SELECT COUNT(*) n FROM plants WHERE household_id = 1") == 0
    assert await _count(db, "SELECT COUNT(*) n FROM maps WHERE household_id = 1") == 0
    assert await _count(db, "SELECT COUNT(*) n FROM garden_water_log WHERE household_id = 1") == 0


@pytest.mark.asyncio
async def test_guessing_the_password_to_delete_is_rate_limited(client, account_db):
    headers = await _login(client, "leon@example.com", "leon-password")

    statuses = [
        (await client.post(
            "/api/auth/delete-account", json={"password": f"guess-{index}"}, headers=headers,
        )).status_code
        for index in range(6)
    ]

    assert statuses == [400] * 5 + [429]
    assert await _count(account_db, "SELECT COUNT(*) n FROM accounts WHERE id = 1") == 1
