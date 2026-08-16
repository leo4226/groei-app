"""Request-level regression coverage for immediate account-token revalidation."""

import pytest

from tests.game_world import seed_game_world


@pytest.mark.asyncio
async def test_existing_account_in_unchanged_household_can_use_protected_route(
    client, seeded_db, auth_header
):
    response = await client.get("/api/auth/me", headers=auth_header)

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_deleted_account_token_is_rejected_by_protected_route(
    client, seeded_db, auth_header
):
    await seeded_db.execute("DELETE FROM accounts WHERE id = ?", (1,))
    await seeded_db.commit()

    response = await client.get("/api/auth/me", headers=auth_header)

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_moved_account_token_is_rejected_by_protected_route(
    client, seeded_db, auth_header
):
    await seeded_db.execute("INSERT INTO households (id, name) VALUES (?, ?)", (2, "Other"))
    await seeded_db.execute("UPDATE accounts SET household_id = ? WHERE id = ?", (2, 1))
    await seeded_db.commit()

    response = await client.get("/api/auth/me", headers=auth_header)

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_token_is_rejected_when_its_account_household_is_deleted(
    client, seeded_db, auth_header
):
    await seeded_db.execute("DELETE FROM households WHERE id = ?", (1,))
    await seeded_db.commit()

    response = await client.get("/api/auth/me", headers=auth_header)

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_game_account_actor_rejects_token_after_household_move(
    client, seeded_db, auth_header
):
    plant_ids = await seed_game_world(seeded_db, plant_count=3)
    created = await client.post(
        "/api/games",
        headers=auth_header,
        json={"map_ids": [10], "plant_ids": plant_ids, "clue_mode": "name"},
    )
    assert created.status_code == 201, created.text

    await seeded_db.execute("INSERT INTO households (id, name) VALUES (?, ?)", (2, "Other"))
    await seeded_db.execute("UPDATE accounts SET household_id = ? WHERE id = ?", (2, 1))
    await seeded_db.commit()

    response = await client.get(
        f"/api/games/{created.json()['join_code']}", headers=auth_header
    )

    assert response.status_code == 401
