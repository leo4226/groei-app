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

@pytest.mark.asyncio
async def test_members_carry_the_legacy_user_id_and_self_flag(
    client, seeded_db, auth_header,
):
    """The settings page must not have to guess which `users` row a member is.

    `accounts` and `users` are joined only by name, so the browser used to do
    `users.find(u => u.name === member.name)` to find the id that DELETE
    /household/members/{user_id} wants — which removes the wrong person when
    two members share a name. The join belongs on the server.
    """
    await seeded_db.execute(
        """INSERT INTO accounts (id, household_id, email, name, password_hash)
           VALUES (2, 1, 'lis@example.com', 'Lisbeth', 'x')"""
    )
    await seeded_db.execute(
        "INSERT INTO users (id, name, household_id) VALUES (77, 'Lisbeth', 1)"
    )
    await seeded_db.commit()

    response = await client.get("/api/household/members", headers=auth_header)
    assert response.status_code == 200
    members = {m["name"]: m for m in response.json()}

    assert members["Lisbeth"]["user_id"] == 77
    assert members["Lisbeth"]["is_self"] is False
    # account_id=1 is the token's own account, whatever it happens to be named.
    assert sum(1 for m in response.json() if m["is_self"]) == 1


@pytest.mark.asyncio
async def test_member_without_a_legacy_user_row_reports_null_user_id(
    client, seeded_db, auth_header,
):
    """An account that never got a `users` row must not break the list.

    The client uses `user_id` to decide whether removal is even offered, so a
    missing row has to surface as null rather than silently matching someone.
    """
    await seeded_db.execute(
        """INSERT INTO accounts (id, household_id, email, name, password_hash)
           VALUES (3, 1, 'ghost@example.com', 'Ghost', 'x')"""
    )
    await seeded_db.commit()

    response = await client.get("/api/household/members", headers=auth_header)
    assert response.status_code == 200
    ghost = next(m for m in response.json() if m["name"] == "Ghost")
    assert ghost["user_id"] is None
