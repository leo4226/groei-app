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
async def test_admin_can_use_previews(client, seeded_db, auth_header, monkeypatch):
    monkeypatch.setattr("auth.ADMIN_EMAIL", "test@example.com")
    res = await client.get("/api/admin/backfill-thresholds/preview", headers=auth_header)
    assert res.status_code == 200
    assert "missing_thresholds" in res.json()

    res = await client.get("/api/admin/backfill-care-schedules/preview", headers=auth_header)
    assert res.status_code == 200
    assert "missing_schedules" in res.json()


@pytest.mark.asyncio
async def test_token_for_deleted_account_is_rejected(client, seeded_db, monkeypatch):
    """A syntactically valid JWT whose account no longer exists must not pass."""
    monkeypatch.setattr("auth.ADMIN_EMAIL", "test@example.com")
    token = create_token(account_id=999, household_id=1)
    res = await client.get(
        "/api/admin/accounts", headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 403
