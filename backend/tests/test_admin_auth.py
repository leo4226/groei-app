"""Regression tests for #118: every /admin/* route must require the admin account.

The backfill endpoints used to have no auth dependency at all — anyone on the
internet could trigger paid LLM calls and DB writes.
"""
import pytest

from auth import create_token

ADMIN_ROUTES = [
    ("POST", "/api/admin/backfill-thresholds"),
    ("GET",  "/api/admin/backfill-thresholds/preview"),
    ("POST", "/api/admin/backfill-care-schedules"),
    ("GET",  "/api/admin/backfill-care-schedules/preview"),
    ("POST", "/api/admin/backfill-plant-types"),
    ("GET",  "/api/admin/accounts"),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path", ADMIN_ROUTES)
async def test_admin_routes_reject_unauthenticated(client, seeded_db, method, path):
    res = await client.request(method, path)
    assert res.status_code in (401, 403), f"{method} {path} allowed without auth"


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path", ADMIN_ROUTES)
async def test_admin_routes_reject_non_admin(client, seeded_db, auth_header, method, path):
    # Account 1 (test@example.com) is a valid login but not the admin.
    res = await client.request(method, path, headers=auth_header)
    assert res.status_code == 403, f"{method} {path} allowed for non-admin"


@pytest.mark.asyncio
async def test_admin_can_use_previews(client, seeded_db, auth_header):
    await seeded_db.execute("UPDATE accounts SET is_admin = 1 WHERE id = 1")
    await seeded_db.commit()
    res = await client.get("/api/admin/backfill-thresholds/preview", headers=auth_header)
    assert res.status_code == 200
    assert "missing_thresholds" in res.json()

    res = await client.get("/api/admin/backfill-care-schedules/preview", headers=auth_header)
    assert res.status_code == 200
    assert "missing_schedules" in res.json()


@pytest.mark.asyncio
async def test_is_admin_column_grants_admin_access(client, seeded_db, auth_header):
    await seeded_db.execute(
        "UPDATE accounts SET email = ?, is_admin = 1 WHERE id = 1",
        ("ops@example.com",),
    )
    await seeded_db.commit()

    res = await client.get("/api/admin/backfill-thresholds/preview", headers=auth_header)

    assert res.status_code == 200


@pytest.mark.asyncio
async def test_admin_email_without_is_admin_is_rejected(client, seeded_db, auth_header):
    old_admin_email = "leon_korbee" + "@hotmail.com"
    await seeded_db.execute(
        "UPDATE accounts SET email = ?, is_admin = 0 WHERE id = 1",
        (old_admin_email,),
    )
    await seeded_db.commit()

    res = await client.get("/api/admin/backfill-thresholds/preview", headers=auth_header)

    assert res.status_code == 403


@pytest.mark.asyncio
async def test_auth_me_exposes_is_admin_from_account_column(client, seeded_db, auth_header):
    await seeded_db.execute(
        "UPDATE accounts SET email = ?, is_admin = 1 WHERE id = 1",
        ("ops@example.com",),
    )
    await seeded_db.commit()

    res = await client.get("/api/auth/me", headers=auth_header)

    assert res.status_code == 200
    assert res.json()["is_admin"] is True


@pytest.mark.asyncio
async def test_token_for_deleted_account_is_rejected(client, seeded_db):
    """A syntactically valid JWT whose account no longer exists must not pass."""
    token = create_token(account_id=999, household_id=1)
    res = await client.get(
        "/api/admin/accounts", headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 403
