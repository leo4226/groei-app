"""Owner-only household administration and role-aware invites (#925).

Pins the post-#925 behaviour:
- household_invites.role: editor/viewer only, non-null, default editor.
- Invites are created only by the owner; requested role defaults to viewer.
- Join consumes the role stored on the invite row — never a browser-supplied
  role, and never owner.
- Owner-only: invite, rename household, remove member, change a member's role,
  edit another member's profile.
- Editor may edit only their own profile.
- Viewer stays blocked from all household writes (#923).
- Exactly one owner per household is preserved.
"""
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from auth import create_token


MIGRATIONS = Path(__file__).parents[1] / "alembic" / "versions"


def _header_for(account_id: int) -> dict[str, str]:
    token = create_token(account_id=account_id, household_id=1)
    return {"Authorization": f"Bearer {token}"}


async def _invite_row(db, code: str) -> dict:
    rows = await db.execute_fetchall("SELECT * FROM household_invites WHERE code = ?", (code,))
    return dict(rows[0])


async def _seed_invite(db, *, code: str, role: str | None = None, used: bool = False):
    """Insert a household_invites row for household 1, created by account 1."""
    values = (1, code, 1, datetime.utcnow() + timedelta(days=7))
    if role is None:
        await db.execute(
            "INSERT INTO household_invites (household_id, code, created_by, expires_at) "
            "VALUES (?, ?, ?, ?)",
            values,
        )
    else:
        await db.execute(
            "INSERT INTO household_invites (household_id, code, created_by, expires_at, role) "
            "VALUES (?, ?, ?, ?, ?)",
            (*values, role),
        )
    if used:
        await db.execute(
            "UPDATE household_invites SET used_at = ? WHERE code = ?",
            (datetime.utcnow(), code),
        )
    await db.commit()


# ── Migration shape ────────────────────────────────────────────────────────


def test_invite_role_migration_is_explicit_and_constrained():
    matches = list(MIGRATIONS.glob("0075_*household*invites*role*.py"))
    assert len(matches) == 1

    source = matches[0].read_text(encoding="utf-8")
    assert 'revision = "0075"' in source
    assert 'down_revision = "0074"' in source
    assert "household_invites" in source
    assert "ADD COLUMN" in source
    assert "role" in source
    # Backfill existing invites as editor so old codes keep their access level.
    assert "SET DEFAULT 'editor'" in source
    assert "SET NOT NULL" in source
    assert "role IN ('editor', 'viewer')" in source


# ── Invite creation ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_owner_can_create_viewer_invite(client, seeded_db):
    response = await client.post(
        "/api/household/invite",
        json={"role": "viewer"},
        headers=_header_for(1),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["role"] == "viewer"
    assert (await _invite_row(seeded_db, body["code"]))["role"] == "viewer"


@pytest.mark.asyncio
async def test_owner_can_create_editor_invite(client, seeded_db):
    response = await client.post(
        "/api/household/invite",
        json={"role": "editor"},
        headers=_header_for(1),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["role"] == "editor"
    assert (await _invite_row(seeded_db, body["code"]))["role"] == "editor"


@pytest.mark.asyncio
async def test_invite_defaults_to_viewer_for_least_privilege(client, seeded_db):
    response = await client.post("/api/household/invite", headers=_header_for(1))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["role"] == "viewer"
    assert (await _invite_row(seeded_db, body["code"]))["role"] == "viewer"


@pytest.mark.asyncio
async def test_invite_rejects_owner_role(client, seeded_db):
    response = await client.post(
        "/api/household/invite",
        json={"role": "owner"},
        headers=_header_for(1),
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_editor_cannot_create_invite(client, seeded_db):
    await seeded_db.execute(
        "INSERT INTO accounts (id, household_id, email, name, password_hash, role) "
        "VALUES (2, 1, 'editor@example.com', 'Editor', 'x', 'editor')"
    )
    await seeded_db.commit()

    response = await client.post(
        "/api/household/invite", json={"role": "viewer"}, headers=_header_for(2)
    )
    assert response.status_code == 403
    rows = await seeded_db.execute_fetchall("SELECT * FROM household_invites")
    assert rows == []


@pytest.mark.asyncio
async def test_viewer_cannot_create_invite(client, seeded_db):
    await seeded_db.execute(
        "INSERT INTO accounts (id, household_id, email, name, password_hash, role) "
        "VALUES (3, 1, 'viewer@example.com', 'Viewer', 'x', 'viewer')"
    )
    await seeded_db.commit()

    response = await client.post(
        "/api/household/invite", json={"role": "viewer"}, headers=_header_for(3)
    )
    assert response.status_code == 403
    rows = await seeded_db.execute_fetchall("SELECT * FROM household_invites")
    assert rows == []


# ── Join consumes the stored role ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_join_viewer_invite_creates_viewer_account(client, seeded_db):
    await _seed_invite(seeded_db, code="VIEW1", role="viewer")

    response = await client.post(
        "/api/household/join",
        json={
            "code": "view1",
            "email": "new-viewer@example.com",
            "password": "safe-password",
            "name": "New Viewer",
            "language": "en",
        },
    )
    assert response.status_code == 200, response.text
    rows = await seeded_db.execute_fetchall(
        "SELECT role FROM accounts WHERE email = ?", ("new-viewer@example.com",)
    )
    assert rows[0]["role"] == "viewer"


@pytest.mark.asyncio
async def test_join_editor_invite_creates_editor_account(client, seeded_db):
    await _seed_invite(seeded_db, code="EDIT1", role="editor")

    response = await client.post(
        "/api/household/join",
        json={
            "code": "edit1",
            "email": "new-editor@example.com",
            "password": "safe-password",
            "name": "New Editor",
            "language": "en",
        },
    )
    assert response.status_code == 200, response.text
    rows = await seeded_db.execute_fetchall(
        "SELECT role FROM accounts WHERE email = ?", ("new-editor@example.com",)
    )
    assert rows[0]["role"] == "editor"


@pytest.mark.asyncio
async def test_join_legacy_invite_without_role_creates_editor(client, seeded_db):
    """Invites created before roles existed join as editor — never owner."""
    await _seed_invite(seeded_db, code="LEGAC", role=None)

    response = await client.post(
        "/api/household/join",
        json={
            "code": "legac",
            "email": "legacy@example.com",
            "password": "safe-password",
            "name": "Legacy",
            "language": "en",
        },
    )
    assert response.status_code == 200, response.text
    rows = await seeded_db.execute_fetchall(
        "SELECT role FROM accounts WHERE email = ?", ("legacy@example.com",)
    )
    assert rows[0]["role"] == "editor"


@pytest.mark.asyncio
async def test_malicious_join_payload_cannot_elevate_to_owner(client, seeded_db):
    """A browser-supplied role must be ignored; the invite row is the authority."""
    await _seed_invite(seeded_db, code="VIEW2", role="viewer")

    response = await client.post(
        "/api/household/join",
        json={
            "code": "view2",
            "email": "tricky@example.com",
            "password": "safe-password",
            "name": "Tricky",
            "language": "en",
            "role": "owner",  # must be ignored
        },
    )
    assert response.status_code == 200, response.text
    rows = await seeded_db.execute_fetchall(
        "SELECT role FROM accounts WHERE email = ?", ("tricky@example.com",)
    )
    assert rows[0]["role"] == "viewer"
    owners = await seeded_db.execute_fetchall(
        "SELECT COUNT(*) AS n FROM accounts WHERE household_id = 1 AND role = 'owner'"
    )
    assert owners[0]["n"] == 1


@pytest.mark.asyncio
async def test_malicious_join_payload_cannot_elevate_beyond_editor(client, seeded_db):
    await _seed_invite(seeded_db, code="EDIT2", role="editor")

    response = await client.post(
        "/api/household/join",
        json={
            "code": "edit2",
            "email": "tricky-editor@example.com",
            "password": "safe-password",
            "name": "Tricky Editor",
            "language": "en",
            "role": "owner",
        },
    )
    assert response.status_code == 200, response.text
    rows = await seeded_db.execute_fetchall(
        "SELECT role FROM accounts WHERE email = ?", ("tricky-editor@example.com",)
    )
    assert rows[0]["role"] == "editor"


# ── Owner-only administration ──────────────────────────────────────────────


async def _seed_extra_members(db) -> dict[int, str]:
    """Household 1 gains editor account 2 and viewer account 3 (+ users rows)."""
    await db.execute(
        "INSERT INTO accounts (id, household_id, email, name, password_hash, role) "
        "VALUES (2, 1, 'editor@example.com', 'Editor', 'x', 'editor')"
    )
    await db.execute(
        "INSERT INTO accounts (id, household_id, email, name, password_hash, role) "
        "VALUES (3, 1, 'viewer@example.com', 'Viewer', 'x', 'viewer')"
    )
    await db.execute(
        "INSERT INTO users (id, name, household_id, account_id) "
        "VALUES (2, 'Editor', 1, 2), (3, 'Viewer', 1, 3)"
    )
    await db.commit()
    return {2: "editor", 3: "viewer"}


@pytest.mark.asyncio
async def test_owner_can_rename_household(client, seeded_db):
    response = await client.patch(
        "/api/household", json={"name": "Renamed"}, headers=_header_for(1)
    )
    assert response.status_code == 200, response.text
    rows = await seeded_db.execute_fetchall("SELECT name FROM households WHERE id = 1")
    assert rows[0]["name"] == "Renamed"


@pytest.mark.asyncio
async def test_editor_cannot_rename_household_and_name_is_unchanged(client, seeded_db):
    await _seed_extra_members(seeded_db)
    before = (await seeded_db.execute_fetchall(
        "SELECT name FROM households WHERE id = 1"))[0]["name"]

    response = await client.patch(
        "/api/household", json={"name": "Blocked"}, headers=_header_for(2)
    )
    assert response.status_code == 403
    after = (await seeded_db.execute_fetchall(
        "SELECT name FROM households WHERE id = 1"))[0]["name"]
    assert after == before


@pytest.mark.asyncio
async def test_viewer_cannot_rename_household(client, seeded_db):
    await _seed_extra_members(seeded_db)
    before = (await seeded_db.execute_fetchall(
        "SELECT name FROM households WHERE id = 1"))[0]["name"]

    response = await client.patch(
        "/api/household", json={"name": "Blocked"}, headers=_header_for(3)
    )
    assert response.status_code == 403
    after = (await seeded_db.execute_fetchall(
        "SELECT name FROM households WHERE id = 1"))[0]["name"]
    assert after == before


@pytest.mark.asyncio
async def test_editor_cannot_remove_member(client, seeded_db):
    await _seed_extra_members(seeded_db)

    response = await client.delete("/api/household/members/3", headers=_header_for(2))
    assert response.status_code == 403
    remaining = await seeded_db.execute_fetchall(
        "SELECT id FROM accounts WHERE id = 3 AND household_id = 1"
    )
    assert len(remaining) == 1


@pytest.mark.asyncio
async def test_viewer_cannot_remove_member(client, seeded_db):
    await _seed_extra_members(seeded_db)

    response = await client.delete("/api/household/members/2", headers=_header_for(3))
    assert response.status_code == 403
    remaining = await seeded_db.execute_fetchall(
        "SELECT id FROM accounts WHERE id = 2 AND household_id = 1"
    )
    assert len(remaining) == 1


@pytest.mark.asyncio
async def test_editor_cannot_edit_another_member_profile(client, seeded_db):
    await _seed_extra_members(seeded_db)
    before = (await seeded_db.execute_fetchall(
        "SELECT name, avatar FROM accounts WHERE id = 3"))[0]

    response = await client.patch(
        "/api/household/members/3",
        json={"name": "Hacked", "avatar": "evil"},
        headers=_header_for(2),
    )
    assert response.status_code == 403
    after = (await seeded_db.execute_fetchall(
        "SELECT name, avatar FROM accounts WHERE id = 3"))[0]
    assert dict(after) == dict(before)


@pytest.mark.asyncio
async def test_viewer_cannot_edit_member_profile(client, seeded_db):
    await _seed_extra_members(seeded_db)
    before = (await seeded_db.execute_fetchall(
        "SELECT name, avatar FROM accounts WHERE id = 2"))[0]

    response = await client.patch(
        "/api/household/members/2",
        json={"name": "Hacked", "avatar": "evil"},
        headers=_header_for(3),
    )
    assert response.status_code == 403
    after = (await seeded_db.execute_fetchall(
        "SELECT name, avatar FROM accounts WHERE id = 2"))[0]
    assert dict(after) == dict(before)


@pytest.mark.asyncio
async def test_editor_can_edit_own_profile(client, seeded_db):
    await _seed_extra_members(seeded_db)

    response = await client.patch(
        "/api/household/members/2",
        json={"name": "Editor Renamed", "avatar": "leaf"},
        headers=_header_for(2),
    )
    assert response.status_code == 200, response.text
    rows = await seeded_db.execute_fetchall(
        "SELECT name, avatar FROM accounts WHERE id = 2")
    assert dict(rows[0]) == {"name": "Editor Renamed", "avatar": "leaf"}


@pytest.mark.asyncio
async def test_owner_can_edit_any_member_profile(client, seeded_db):
    await _seed_extra_members(seeded_db)

    response = await client.patch(
        "/api/household/members/2",
        json={"name": "By Owner", "avatar": "crown"},
        headers=_header_for(1),
    )
    assert response.status_code == 200, response.text
    rows = await seeded_db.execute_fetchall(
        "SELECT name, avatar FROM accounts WHERE id = 2")
    assert dict(rows[0]) == {"name": "By Owner", "avatar": "crown"}


# ── Role change endpoint ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_owner_can_change_member_role_between_editor_and_viewer(client, seeded_db):
    await _seed_extra_members(seeded_db)

    to_viewer = await client.patch(
        "/api/household/members/2/role",
        json={"role": "viewer"},
        headers=_header_for(1),
    )
    assert to_viewer.status_code == 200, to_viewer.text
    assert to_viewer.json()["role"] == "viewer"
    rows = await seeded_db.execute_fetchall("SELECT role FROM accounts WHERE id = 2")
    assert rows[0]["role"] == "viewer"

    to_editor = await client.patch(
        "/api/household/members/2/role",
        json={"role": "editor"},
        headers=_header_for(1),
    )
    assert to_editor.status_code == 200, to_editor.text
    assert to_editor.json()["role"] == "editor"
    rows = await seeded_db.execute_fetchall("SELECT role FROM accounts WHERE id = 2")
    assert rows[0]["role"] == "editor"

    owners = await seeded_db.execute_fetchall(
        "SELECT COUNT(*) AS n FROM accounts WHERE household_id = 1 AND role = 'owner'"
    )
    assert owners[0]["n"] == 1


@pytest.mark.asyncio
async def test_role_change_rejects_owner_target_role(client, seeded_db):
    await _seed_extra_members(seeded_db)

    response = await client.patch(
        "/api/household/members/2/role",
        json={"role": "owner"},
        headers=_header_for(1),
    )
    assert response.status_code == 422
    rows = await seeded_db.execute_fetchall("SELECT role FROM accounts WHERE id = 2")
    assert rows[0]["role"] == "editor"


@pytest.mark.asyncio
async def test_role_change_cannot_alter_the_owner(client, seeded_db):
    await _seed_extra_members(seeded_db)

    response = await client.patch(
        "/api/household/members/1/role",
        json={"role": "viewer"},
        headers=_header_for(1),
    )
    assert response.status_code == 400
    rows = await seeded_db.execute_fetchall("SELECT role FROM accounts WHERE id = 1")
    assert rows[0]["role"] == "owner"


@pytest.mark.asyncio
async def test_role_change_missing_member_is_404(client, seeded_db):
    response = await client.patch(
        "/api/household/members/999/role",
        json={"role": "viewer"},
        headers=_header_for(1),
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_editor_cannot_change_roles(client, seeded_db):
    await _seed_extra_members(seeded_db)

    response = await client.patch(
        "/api/household/members/3/role",
        json={"role": "editor"},
        headers=_header_for(2),
    )
    assert response.status_code == 403
    rows = await seeded_db.execute_fetchall("SELECT role FROM accounts WHERE id = 3")
    assert rows[0]["role"] == "viewer"


@pytest.mark.asyncio
async def test_viewer_cannot_change_roles(client, seeded_db):
    await _seed_extra_members(seeded_db)

    response = await client.patch(
        "/api/household/members/2/role",
        json={"role": "viewer"},
        headers=_header_for(3),
    )
    assert response.status_code == 403
    rows = await seeded_db.execute_fetchall("SELECT role FROM accounts WHERE id = 2")
    assert rows[0]["role"] == "editor"


# ── Member list exposes role + capabilities ────────────────────────────────


@pytest.mark.asyncio
async def test_member_list_exposes_role_and_capabilities(client, seeded_db):
    await _seed_extra_members(seeded_db)

    response = await client.get("/api/household/members", headers=_header_for(1))
    assert response.status_code == 200
    members = {m["name"]: m for m in response.json()}

    assert members["Test"]["role"] == "owner"
    assert members["Test"]["capabilities"] == {
        "can_edit": True,
        "can_manage_household": True,
    }
    assert members["Editor"]["role"] == "editor"
    assert members["Editor"]["capabilities"] == {
        "can_edit": True,
        "can_manage_household": False,
    }
    assert members["Viewer"]["role"] == "viewer"
    assert members["Viewer"]["capabilities"] == {
        "can_edit": False,
        "can_manage_household": False,
    }

    # No password hashes, session details, or invite secrets leak out.
    for member in response.json():
        assert "password_hash" not in member
        assert "code" not in member


@pytest.mark.asyncio
async def test_auth_me_exposes_role_and_capabilities_for_editor(client, seeded_db):
    await seeded_db.execute(
        "INSERT INTO accounts (id, household_id, email, name, password_hash, role) "
        "VALUES (2, 1, 'editor@example.com', 'Editor', 'x', 'editor')"
    )
    await seeded_db.commit()

    response = await client.get("/api/auth/me", headers=_header_for(2))
    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "editor"
    assert body["capabilities"] == {"can_edit": True, "can_manage_household": False}
    assert body["is_admin"] is False
