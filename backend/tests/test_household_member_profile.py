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


@pytest.mark.asyncio
async def test_duplicate_legacy_users_do_not_duplicate_the_member(
    client, seeded_db, auth_header,
):
    """One row per account, however many legacy `users` rows share the name.

    `users.name` lost its UNIQUE constraint in migration 0025, so a household
    can hold several rows with the same name. Bridging accounts→users with a
    LEFT JOIN returned the account once per match, and settings showed the same
    person twice — same email, both badged "you", and duplicate React keys.
    """
    await seeded_db.execute(
        "INSERT INTO users (id, name, household_id) VALUES (41, 'Leon', 1)")
    await seeded_db.execute(
        "INSERT INTO users (id, name, household_id) VALUES (42, 'Leon', 1)")
    await seeded_db.execute(
        "UPDATE accounts SET name = 'Leon' WHERE id = 1")
    await seeded_db.commit()

    response = await client.get("/api/household/members", headers=auth_header)
    assert response.status_code == 200, response.text
    members = response.json()

    leons = [m for m in members if m["name"] == "Leon"]
    assert len(leons) == 1, f"account listed {len(leons)} times: {leons}"
    # Account ids must be unique across the list, or the UI gets duplicate keys.
    ids = [m["id"] for m in members]
    assert len(ids) == len(set(ids))
    # Exactly one member is the caller.
    assert sum(1 for m in members if m["is_self"]) == 1
    # The oldest legacy row wins — care history was attributed to it.
    assert leons[0]["user_id"] == 41


@pytest.mark.asyncio
async def test_profile_save_does_not_mint_a_second_legacy_user(
    client, seeded_db, auth_header,
):
    """Renaming must reuse the existing `users` row, not add another.

    The lookup only tried the *old* account name, so once accounts.name and
    users.name drifted apart it missed and inserted a duplicate — which is how
    a household ends up with two rows for one person.
    """
    await seeded_db.execute(
        "INSERT INTO accounts (id, household_id, email, name, password_hash) "
        "VALUES (2, 1, 'lis@example.com', 'Lis', 'x')")
    # The legacy row is already out of sync with the account name.
    await seeded_db.execute(
        "INSERT INTO users (id, name, household_id) VALUES (50, 'Lisbeth', 1)")
    await seeded_db.commit()

    resp = await client.patch(
        "/api/household/members/2", headers=auth_header, json={"name": "Lisbeth"})
    assert resp.status_code == 200, resp.text

    rows = await seeded_db.execute_fetchall(
        "SELECT id, name FROM users WHERE household_id = 1 AND name = 'Lisbeth'")
    assert len(rows) == 1, f"expected one row, got {[dict(r) for r in rows]}"
    assert rows[0]["id"] == 50, "should have reused the existing row"


@pytest.mark.asyncio
async def test_rename_does_not_collapse_two_people_onto_one_name(
    client, seeded_db, auth_header,
):
    """The UPDATE was name-keyed and unbounded, so it renamed every match."""
    await seeded_db.execute(
        "INSERT INTO accounts (id, household_id, email, name, password_hash) "
        "VALUES (2, 1, 'lis@example.com', 'Lis', 'x')")
    await seeded_db.execute("INSERT INTO users (id, name, household_id) VALUES (60, 'Lis', 1)")
    await seeded_db.execute("INSERT INTO users (id, name, household_id) VALUES (61, 'Lis', 1)")
    await seeded_db.commit()

    resp = await client.patch(
        "/api/household/members/2", headers=auth_header, json={"name": "Lisbeth"})
    assert resp.status_code == 200, resp.text

    renamed = await seeded_db.execute_fetchall(
        "SELECT id FROM users WHERE household_id = 1 AND name = 'Lisbeth'")
    assert len(renamed) == 1, "only one row should have been renamed"
    assert renamed[0]["id"] == 60
    # The other row is left alone rather than dragged along.
    other = await seeded_db.execute_fetchall("SELECT name FROM users WHERE id = 61")
    assert other[0]["name"] == "Lis"
