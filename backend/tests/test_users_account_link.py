"""`users.account_id` — the link that replaced guessing by name.

`accounts` and `users` are two id spaces for the same person. Nothing joined
them but a matching `name`, and migration 0025 dropped the UNIQUE constraint on
`users.name`, so every bridge in the codebase had to guess which row it meant.
That guessing produced three separate bugs: the settings page removing the
wrong member, a member listed twice with the same email, and a self-check that
could miss your own duplicate row.

Migration 0073 makes the link a real foreign key. These tests pin the
behaviour that used to depend on names lining up.
"""
import pytest


async def _ensure_care_log(db):
    """care_log is not in the shared schema (several test files define their
    own), so create it on demand rather than adding it globally."""
    await db.execute("""
        CREATE TABLE IF NOT EXISTS care_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plant_id INTEGER NOT NULL,
            care_type TEXT NOT NULL,
            done_by INTEGER NOT NULL,
            done_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            notes TEXT,
            skipped BOOLEAN DEFAULT FALSE
        )""")


async def _add_account(db, account_id: int, name: str, email: str, household_id: int = 1):
    await db.execute(
        "INSERT INTO accounts (id, household_id, email, name, password_hash) "
        "VALUES (?, ?, ?, ?, 'x')",
        (account_id, household_id, email, name),
    )


async def _add_user(db, user_id: int, name: str, account_id: int | None,
                    household_id: int = 1):
    await db.execute(
        "INSERT INTO users (id, name, household_id, account_id) VALUES (?, ?, ?, ?)",
        (user_id, name, household_id, account_id),
    )


class TestMembersList:
    @pytest.mark.asyncio
    async def test_one_row_per_account_however_the_names_collide(
        self, client, seeded_db, auth_header
    ):
        """Rows sharing a name no longer multiply the account.

        The join is on account_id now, so an unrelated `users` row with the same
        name is simply not linked — it cannot duplicate anybody.
        """
        await _add_user(seeded_db, 10, "Test", account_id=1)
        await _add_user(seeded_db, 11, "Test", account_id=None)   # stray namesake
        await seeded_db.commit()

        resp = await client.get("/api/household/members", headers=auth_header)
        assert resp.status_code == 200, resp.text
        members = resp.json()

        assert len(members) == 1
        assert members[0]["user_id"] == 10
        assert members[0]["is_self"] is True

    @pytest.mark.asyncio
    async def test_account_without_a_users_row_reports_null(
        self, client, seeded_db, auth_header
    ):
        await seeded_db.commit()
        resp = await client.get("/api/household/members", headers=auth_header)
        assert resp.status_code == 200
        assert resp.json()[0]["user_id"] is None


class TestProfileSave:
    @pytest.mark.asyncio
    async def test_rename_is_just_a_rename(self, client, seeded_db, auth_header):
        """The link survives a rename because it never depended on the name."""
        await _add_user(seeded_db, 10, "Test", account_id=1)
        await seeded_db.commit()

        resp = await client.patch(
            "/api/household/members/1", headers=auth_header, json={"name": "Leonardo"})
        assert resp.status_code == 200, resp.text

        rows = await seeded_db.execute_fetchall(
            "SELECT id, name, account_id FROM users WHERE account_id = 1")
        assert len(rows) == 1, "renaming must not create a second row"
        assert rows[0]["id"] == 10
        assert rows[0]["name"] == "Leonardo"

    @pytest.mark.asyncio
    async def test_rename_leaves_an_unrelated_namesake_alone(
        self, client, seeded_db, auth_header
    ):
        """The old UPDATE was `WHERE name = ?` and dragged every match along."""
        await _add_user(seeded_db, 10, "Test", account_id=1)
        await _add_user(seeded_db, 11, "Test", account_id=None)
        await seeded_db.commit()

        resp = await client.patch(
            "/api/household/members/1", headers=auth_header, json={"name": "Leonardo"})
        assert resp.status_code == 200, resp.text

        stray = await seeded_db.execute_fetchall("SELECT name FROM users WHERE id = 11")
        assert stray[0]["name"] == "Test"

    @pytest.mark.asyncio
    async def test_creates_the_link_when_no_users_row_exists_yet(
        self, client, seeded_db, auth_header
    ):
        await seeded_db.commit()
        resp = await client.patch(
            "/api/household/members/1", headers=auth_header, json={"name": "Test"})
        assert resp.status_code == 200, resp.text

        rows = await seeded_db.execute_fetchall(
            "SELECT account_id FROM users WHERE name = 'Test'")
        assert len(rows) == 1
        assert rows[0]["account_id"] == 1


class TestRemoveMember:
    """This endpoint had no test at all, and did not work.

    It read `current["name"]`, but `get_current_account` only ever injects
    `account_id` and `household_id` — so every call raised KeyError and 500'd.
    The remove button in settings has never removed anybody.
    """

    @pytest.mark.asyncio
    async def test_removing_another_member_works(self, client, seeded_db, auth_header):
        await _ensure_care_log(seeded_db)
        await _add_user(seeded_db, 10, "Test", account_id=1)
        await _add_account(seeded_db, 2, "Lisbeth", "lis@example.com")
        await _add_user(seeded_db, 11, "Lisbeth", account_id=2)
        await seeded_db.commit()

        resp = await client.delete("/api/household/members/11", headers=auth_header)
        assert resp.status_code == 204, resp.text

        assert await seeded_db.execute_fetchall("SELECT id FROM users WHERE id = 11") == []
        assert await seeded_db.execute_fetchall("SELECT id FROM accounts WHERE id = 2") == []
        # The caller is untouched.
        assert len(await seeded_db.execute_fetchall("SELECT id FROM users WHERE id = 10")) == 1

    @pytest.mark.asyncio
    async def test_care_history_is_reassigned_not_orphaned(
        self, client, seeded_db, auth_header
    ):
        """care_log.done_by is NOT NULL, so it must be moved, not nulled."""
        await _add_user(seeded_db, 10, "Test", account_id=1)
        await _add_account(seeded_db, 2, "Lisbeth", "lis@example.com")
        await _add_user(seeded_db, 11, "Lisbeth", account_id=2)
        await _ensure_care_log(seeded_db)
        await seeded_db.execute(
            "INSERT INTO care_log (id, plant_id, care_type, done_by) "
            "VALUES (1, 1, 'water', 11)")
        await seeded_db.commit()

        resp = await client.delete("/api/household/members/11", headers=auth_header)
        assert resp.status_code == 204, resp.text

        log = await seeded_db.execute_fetchall("SELECT done_by FROM care_log WHERE id = 1")
        assert log[0]["done_by"] == 10, "history should move to the remaining member"

    @pytest.mark.asyncio
    async def test_cannot_remove_yourself(self, client, seeded_db, auth_header):
        await _ensure_care_log(seeded_db)
        await _add_user(seeded_db, 10, "Test", account_id=1)
        await seeded_db.commit()

        resp = await client.delete("/api/household/members/10", headers=auth_header)
        assert resp.status_code == 400
        assert len(await seeded_db.execute_fetchall("SELECT id FROM users WHERE id = 10")) == 1

    @pytest.mark.asyncio
    async def test_cannot_remove_someone_in_another_household(
        self, client, seeded_db, auth_header
    ):
        await _ensure_care_log(seeded_db)
        await _add_user(seeded_db, 10, "Test", account_id=1)
        await seeded_db.execute("INSERT INTO households (id, name) VALUES (2, 'Elders')")
        await _add_account(seeded_db, 3, "Outsider", "out@example.com", household_id=2)
        await _add_user(seeded_db, 12, "Outsider", account_id=3, household_id=2)
        await seeded_db.commit()

        resp = await client.delete("/api/household/members/12", headers=auth_header)
        assert resp.status_code == 404
        assert len(await seeded_db.execute_fetchall("SELECT id FROM users WHERE id = 12")) == 1
