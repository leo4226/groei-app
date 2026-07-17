"""Rate limiting on abuse-prone auth endpoints (issue #695).

The autouse `_reset_rate_limit` fixture (conftest) clears counters before each
test, so these start from a clean window.
"""
import pytest

BASE = "/api"
# Unknown email → forgot-password stays a clean 200 and never actually sends
# an email, so the test exercises only the rate limiter.
_PAYLOAD = {"email": "nobody@example.com"}


@pytest.mark.asyncio
async def test_forgot_password_blocks_after_limit(client, seeded_db):
    for _ in range(5):
        r = await client.post(f"{BASE}/auth/forgot-password", json=_PAYLOAD)
        assert r.status_code == 200
    blocked = await client.post(f"{BASE}/auth/forgot-password", json=_PAYLOAD)
    assert blocked.status_code == 429
    assert blocked.json()["detail"]["code"] == "rate_limited"


@pytest.mark.asyncio
async def test_rate_limit_is_per_client_ip(client, seeded_db):
    a = {"Fly-Client-IP": "203.0.113.1"}
    b = {"Fly-Client-IP": "203.0.113.2"}
    for _ in range(5):
        await client.post(f"{BASE}/auth/forgot-password", json=_PAYLOAD, headers=a)
    assert (await client.post(f"{BASE}/auth/forgot-password", json=_PAYLOAD, headers=a)).status_code == 429
    # A different client IP has its own budget and is unaffected.
    assert (await client.post(f"{BASE}/auth/forgot-password", json=_PAYLOAD, headers=b)).status_code == 200
