"""Tests for the water_amount field on garden watering logs.

Endpoints (prefix /api):
  POST /garden/water-log  — log a garden watering
  GET  /garden/water-log/latest — get latest watering

Both should accept and return the water_amount field (in ml).
"""

import json
import pytest
from httpx import AsyncClient, ASGITransport
from app import app  # noqa: E402 — app factory at project root

BASE = "/api"


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_log_watering_with_amount(client: AsyncClient):
    """POST /garden/water-log with water_amount returns it back."""
    payload = {"watered_at": "2025-06-01T10:00:00", "water_amount_ml": 500}
    resp = await client.post(f"{BASE}/garden/water-log", json=payload)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data.get("water_amount_ml") == 500


@pytest.mark.asyncio
async def test_log_watering_without_amount(client: AsyncClient):
    """POST /garden/water-log without water_amount returns null."""
    payload = {"watered_at": "2025-06-01T10:00:00"}
    resp = await client.post(f"{BASE}/garden/water-log", json=payload)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data.get("water_amount_ml") is None


@pytest.mark.asyncio
async def test_get_latest_water_amount(client: AsyncClient):
    """GET /garden/water-log/latest includes water_amount."""
    # First log one with amount
    await client.post(
        f"{BASE}/garden/water-log",
        json={"watered_at": "2025-06-01T10:00:00", "water_amount_ml": 750},
    )
    resp = await client.get(f"{BASE}/garden/water-log/latest")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "water_amount_ml" in data
