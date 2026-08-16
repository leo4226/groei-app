"""Role and capability coverage for database-derived household authorization."""
from datetime import datetime, timedelta
import sqlite3

import pytest
from fastapi import HTTPException

from auth import (
    create_token,
    get_current_account_from_token,
    require_admin,
    require_editor,
    require_owner,
)


CAPABILITIES = {
    "owner": {"can_edit": True, "can_manage_household": True},
    "editor": {"can_edit": True, "can_manage_household": False},
    "viewer": {"can_edit": False, "can_manage_household": False},
}


def _auth_header(account_id: int = 1) -> dict[str, str]:
    token = create_token(account_id=account_id, household_id=1)
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["owner", "editor", "viewer"])
async def test_auth_me_returns_the_current_database_role_and_capabilities(
    client, seeded_db, role,
):
    header = _auth_header()
    await seeded_db.execute("UPDATE accounts SET role = ? WHERE id = ?", (role, 1))
    await seeded_db.commit()

    response = await client.get("/api/auth/me", headers=header)

    assert response.status_code == 200
    assert response.json()["role"] == role
    assert response.json()["capabilities"] == CAPABILITIES[role]


@pytest.mark.asyncio
async def test_shared_account_fixture_defaults_bare_accounts_to_editor(seeded_db):
    await seeded_db.execute(
        """INSERT INTO accounts (id, household_id, email, name, password_hash)
           VALUES (?, ?, ?, ?, ?)""",
        (2, 1, "bare@example.com", "Bare", "x"),
    )
    await seeded_db.commit()

    rows = await seeded_db.execute_fetchall("SELECT role FROM accounts WHERE id = ?", (2,))

    assert rows[0]["role"] == "editor"


@pytest.mark.asyncio
async def test_shared_account_fixture_rejects_unknown_roles(seeded_db):
    with pytest.raises(sqlite3.IntegrityError):
        await seeded_db.execute(
            """INSERT INTO accounts (id, household_id, email, name, password_hash, role)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (2, 1, "invalid@example.com", "Invalid", "x", "administrator"),
        )


@pytest.mark.asyncio
async def test_shared_account_fixture_allows_only_one_owner_per_household(seeded_db):
    with pytest.raises(sqlite3.IntegrityError):
        await seeded_db.execute(
            """INSERT INTO accounts (id, household_id, email, name, password_hash, role)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (2, 1, "second-owner@example.com", "Second owner", "x", "owner"),
        )


@pytest.mark.asyncio
async def test_register_creates_an_owner_account(client, seeded_db):
    response = await client.post(
        "/api/auth/register",
        json={
            "email": "owner@example.com",
            "password": "safe-password",
            "name": "Owner",
            "household_name": "Owner Household",
            "language": "en",
        },
    )

    assert response.status_code == 200, response.text
    rows = await seeded_db.execute_fetchall(
        "SELECT role FROM accounts WHERE email = ?", ("owner@example.com",)
    )
    assert rows[0]["role"] == "owner"


@pytest.mark.asyncio
async def test_legacy_join_creates_an_editor_account(client, seeded_db):
    await seeded_db.execute(
        """CREATE TABLE household_invites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            household_id INTEGER NOT NULL,
            code TEXT NOT NULL UNIQUE,
            created_by INTEGER NOT NULL,
            expires_at DATETIME NOT NULL,
            used_at DATETIME
        )"""
    )
    await seeded_db.execute(
        """INSERT INTO household_invites
           (household_id, code, created_by, expires_at)
           VALUES (?, ?, ?, ?)""",
        (1, "JOINME", 1, datetime.utcnow() + timedelta(days=1)),
    )
    await seeded_db.commit()

    response = await client.post(
        "/api/household/join",
        json={
            "code": "joinme",
            "email": "editor@example.com",
            "password": "safe-password",
            "name": "Editor",
            "language": "en",
        },
    )

    assert response.status_code == 200, response.text
    rows = await seeded_db.execute_fetchall(
        "SELECT role FROM accounts WHERE email = ?", ("editor@example.com",)
    )
    assert rows[0]["role"] == "editor"


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["owner", "editor"])
async def test_editor_dependency_accepts_owners_and_editors(seeded_db, role):
    await seeded_db.execute("UPDATE accounts SET role = ? WHERE id = ?", (role, 1))
    await seeded_db.commit()
    current = await get_current_account_from_token(_auth_header()["Authorization"][7:], seeded_db)

    assert await require_editor(current) == current


@pytest.mark.asyncio
async def test_editor_dependency_rejects_viewers(seeded_db):
    await seeded_db.execute("UPDATE accounts SET role = ? WHERE id = ?", ("viewer", 1))
    await seeded_db.commit()
    current = await get_current_account_from_token(_auth_header()["Authorization"][7:], seeded_db)

    with pytest.raises(HTTPException) as error:
        await require_editor(current)

    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_owner_dependency_accepts_owners(seeded_db):
    await seeded_db.execute("UPDATE accounts SET role = ? WHERE id = ?", ("owner", 1))
    await seeded_db.commit()
    current = await get_current_account_from_token(_auth_header()["Authorization"][7:], seeded_db)

    assert await require_owner(current) == current


@pytest.mark.asyncio
async def test_household_owner_role_does_not_grant_global_admin_access(seeded_db):
    current = await get_current_account_from_token(_auth_header()["Authorization"][7:], seeded_db)

    with pytest.raises(HTTPException) as error:
        await require_admin(current, seeded_db)

    assert error.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["editor", "viewer"])
async def test_owner_dependency_rejects_non_owners(seeded_db, role):
    await seeded_db.execute("UPDATE accounts SET role = ? WHERE id = ?", (role, 1))
    await seeded_db.commit()
    current = await get_current_account_from_token(_auth_header()["Authorization"][7:], seeded_db)

    with pytest.raises(HTTPException) as error:
        await require_owner(current)

    assert error.value.status_code == 403
