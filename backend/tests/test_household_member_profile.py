import pytest


@pytest.mark.asyncio
async def test_household_member_profile_update_updates_account_and_creates_legacy_user(
    client, seeded_db, auth_header,
):
    await seeded_db.execute(
        """INSERT INTO accounts (id, household_id, email, name, password_hash, avatar)
           VALUES (2, 1, 'lis@example.com', 'Lis', 'x', 'old_avatar')"""
    )
    await seeded_db.commit()

    response = await client.patch(
        "/api/household/members/2",
        headers=auth_header,
        json={"name": "Lisbeth", "avatar": "fern_2"},
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Lisbeth"
    assert response.json()["email"] == "lis@example.com"
    assert response.json()["avatar"] == "fern_2"

    account = await (await seeded_db.execute(
        "SELECT name, email, avatar FROM accounts WHERE id = 2"
    )).fetchone()
    assert dict(account) == {
        "name": "Lisbeth",
        "email": "lis@example.com",
        "avatar": "fern_2",
    }

    legacy_user = await (await seeded_db.execute(
        "SELECT name, avatar, household_id FROM users WHERE name = 'Lisbeth'"
    )).fetchone()
    assert dict(legacy_user) == {
        "name": "Lisbeth",
        "avatar": "fern_2",
        "household_id": 1,
    }

    members = await client.get("/api/household/members", headers=auth_header)
    assert members.status_code == 200
    assert members.json()[1]["name"] == "Lisbeth"
    assert members.json()[1]["email"] == "lis@example.com"
    assert members.json()[1]["avatar"] == "fern_2"


@pytest.mark.asyncio
async def test_household_member_profile_update_syncs_existing_legacy_user(
    client, seeded_db, auth_header,
):
    await seeded_db.execute(
        """INSERT INTO accounts (id, household_id, email, name, password_hash, avatar)
           VALUES (2, 1, 'lis@example.com', 'Lis', 'x', 'old_avatar')"""
    )
    await seeded_db.execute(
        "INSERT INTO users (id, name, avatar, household_id, language) VALUES (22, 'Lis', 'old_avatar', 1, 'en')"
    )
    await seeded_db.commit()

    response = await client.patch(
        "/api/household/members/2",
        headers=auth_header,
        json={"name": "Lisbeth", "avatar": "fern_2"},
    )

    assert response.status_code == 200
    legacy_user = await (await seeded_db.execute(
        "SELECT name, avatar, language FROM users WHERE id = 22"
    )).fetchone()
    assert dict(legacy_user) == {
        "name": "Lisbeth",
        "avatar": "fern_2",
        "language": "en",
    }