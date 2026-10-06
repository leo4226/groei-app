"""Care is attributed to the signed-in account, and profiles are self-service.

The client used to send a `user_id` from a device-local "active user" that
defaulted to the household's first member, so a second member on a fresh
device logged every watering as someone else. The server now derives the
profile from the token (services/identity.py).
"""
from datetime import date

import pytest
import pytest_asyncio

from services.garden_log import log_garden_fertilize


EXTRA_SCHEMA = """
    CREATE TABLE care_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, plant_id INTEGER,
        care_type TEXT, done_by INTEGER, done_at TEXT, notes TEXT,
        skipped BOOLEAN DEFAULT FALSE
    );
"""


@pytest_asyncio.fixture
async def household_db(seeded_db):
    db = seeded_db
    await db.executescript(EXTRA_SCHEMA)
    await db.executescript("""
        INSERT INTO accounts (id, household_id, email, name, password_hash, role, language)
        VALUES (2, 1, 'lisbeth@example.com', 'Lisbeth', 'x', 'editor', 'nl');
        INSERT INTO households (id, name) VALUES (2, 'Neighbours');
        INSERT INTO users (id, name, household_id, language, account_id) VALUES
          (1, 'Leon', 1, 'nl', 1),
          (2, 'Lisbeth', 1, 'nl', 2),
          (3, 'Neighbour', 2, 'nl', NULL);
        INSERT INTO plants (id, name, household_id) VALUES (1, 'Monstera', 1);
        INSERT INTO care_schedules (id, plant_id, care_type, interval_days, next_due, is_active)
        VALUES (1, 1, 'water', 7, '2026-06-10', 1);
    """)
    await db.commit()
    return db


@pytest.mark.asyncio
async def test_care_done_is_attributed_to_the_caller_whatever_the_body_says(
    client, household_db, auth_header,
):
    # The body names another member (and could name another household's).
    response = await client.post(
        "/api/care/done",
        json={"plant_id": 1, "care_type": "water", "user_id": 2},
        headers=auth_header,
    )

    assert response.status_code == 200, response.text
    log = await household_db.execute_fetchall("SELECT done_by FROM care_log")
    schedule = await household_db.execute_fetchall(
        "SELECT last_done_by FROM care_schedules WHERE id = 1"
    )
    assert log[0]["done_by"] == 1
    assert schedule[0]["last_done_by"] == 1


@pytest.mark.asyncio
async def test_care_skip_is_attributed_to_the_caller(client, household_db, auth_header):
    response = await client.post(
        "/api/care/skip",
        json={"plant_id": 1, "care_type": "water", "user_id": 3},
        headers=auth_header,
    )

    assert response.status_code == 200, response.text
    log = await household_db.execute_fetchall("SELECT done_by, skipped FROM care_log")
    assert log[0]["done_by"] == 1


@pytest.mark.asyncio
async def test_undo_drops_a_previous_attribution_from_another_household(
    client, household_db, auth_header,
):
    done = (await client.post(
        "/api/care/done",
        json={"plant_id": 1, "care_type": "water"},
        headers=auth_header,
    )).json()

    response = await client.post(
        "/api/care/undo",
        json={
            "care_log_id": done["care_log_id"],
            "previous_next_due": "2026-06-10",
            "previous_last_done": None,
            "previous_last_done_by": 3,
        },
        headers=auth_header,
    )

    assert response.status_code == 200, response.text
    rows = await household_db.execute_fetchall(
        "SELECT last_done_by FROM care_schedules WHERE id = 1"
    )
    assert rows[0]["last_done_by"] is None


@pytest.mark.asyncio
async def test_users_list_says_which_profile_is_whose(client, household_db, auth_header):
    response = await client.get("/api/users", headers=auth_header)

    assert response.status_code == 200
    assert {(user["id"], user["account_id"]) for user in response.json()} == {
        (1, 1), (2, 2),
    }


@pytest.mark.asyncio
async def test_member_cannot_change_another_members_language(
    client, household_db, auth_header,
):
    response = await client.patch(
        "/api/users/2/language", json={"language": "en"}, headers=auth_header,
    )

    assert response.status_code == 403
    rows = await household_db.execute_fetchall(
        "SELECT u.language AS user_language, a.language AS account_language "
        "FROM users u JOIN accounts a ON a.id = u.account_id WHERE u.id = 2"
    )
    assert rows[0]["user_language"] == "nl"
    assert rows[0]["account_language"] == "nl"


@pytest.mark.asyncio
async def test_renaming_another_member_no_longer_renames_the_caller(
    client, household_db, auth_header,
):
    response = await client.patch(
        "/api/users/2", json={"name": "Lisbeth K"}, headers=auth_header,
    )

    assert response.status_code == 403
    caller = await household_db.execute_fetchall("SELECT name FROM accounts WHERE id = 1")
    assert caller[0]["name"] != "Lisbeth K"


@pytest.mark.asyncio
async def test_renaming_yourself_updates_profile_and_account(
    client, household_db, auth_header,
):
    response = await client.patch(
        "/api/users/1", json={"name": " Leon K "}, headers=auth_header,
    )

    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Leon K"
    account = await household_db.execute_fetchall("SELECT name FROM accounts WHERE id = 1")
    assert account[0]["name"] == "Leon K"


@pytest.mark.asyncio
async def test_garden_fertilize_log_leaves_houseplants_alone(seeded_db):
    db = seeded_db
    await db.executescript("""
        INSERT INTO maps (id, name, map_type, household_id) VALUES
          (4, 'Garden', 'outdoor', 1), (5, 'Living room', 'indoor', 1);
        INSERT INTO plants (id, name, household_id, map_id) VALUES
          (1, 'Rose', 1, 4), (2, 'Monstera', 1, 5);
        INSERT INTO care_schedules (id, plant_id, care_type, interval_days, next_due, is_active)
        VALUES (10, 1, 'fertilize', 30, '2026-06-01', 1),
               (20, 2, 'fertilize', 30, '2026-06-01', 1);
    """)

    updated = await log_garden_fertilize(db, date(2026, 6, 5), None, household_id=1)

    assert updated == 1
    rows = await db.execute_fetchall(
        "SELECT id, last_done FROM care_schedules ORDER BY id"
    )
    assert str(rows[0]["last_done"]).startswith("2026-06-05")
    assert rows[1]["last_done"] is None
