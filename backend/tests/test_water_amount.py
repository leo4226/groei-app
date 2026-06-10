"""Tests for the water_amount field on garden watering logs.

Endpoints (prefix /api):
  POST /garden/water-log  — log a garden watering
  GET  /garden/water-log/latest — get latest watering

Both should accept and return the water_amount field (in ml).
"""

import pytest

BASE = "/api"


@pytest.mark.asyncio
async def test_log_watering_with_amount(client, seeded_db, auth_header):
    """POST /garden/water-log with water_amount returns it back."""
    payload = {"watered_at": "2025-06-01", "water_amount": 500}
    resp = await client.post(f"{BASE}/garden/water-log", json=payload, headers=auth_header)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data.get("water_amount") == 500


@pytest.mark.asyncio
async def test_log_watering_without_amount(client, seeded_db, auth_header):
    """POST /garden/water-log without water_amount returns null."""
    payload = {"watered_at": "2025-06-01"}
    resp = await client.post(f"{BASE}/garden/water-log", json=payload, headers=auth_header)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data.get("water_amount") is None


@pytest.mark.asyncio
async def test_get_latest_water_amount(client, seeded_db, auth_header):
    """GET /garden/water-log/latest includes water_amount."""
    # First log one with amount (needs auth header for POST)
    resp = await client.post(
        f"{BASE}/garden/water-log",
        json={"watered_at": "2025-06-01", "water_amount": 750},
        headers=auth_header,
    )
    assert resp.status_code == 200, resp.text
    # GET does NOT require auth
    resp = await client.get(f"{BASE}/garden/water-log/latest")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "water_amount" in data
