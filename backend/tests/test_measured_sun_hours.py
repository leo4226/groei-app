"""HTTP-level tests for the per-plant measured-sun override (#645).

A plant can be given a manual `measured_sun_hours` value which the frontend uses
in place of the modelled heatmap sun when judging sun-fit, and can clear it again
by sending null. Uses the shared client / seeded_db / auth_header fixtures.
"""
from unittest.mock import AsyncMock, patch

import pytest_asyncio

EXTRA_SCHEMA = """
CREATE TABLE plant_species (
    id INTEGER PRIMARY KEY,
    common_name_nl TEXT,
    common_name_en TEXT,
    care_thresholds TEXT,
    phenology_json TEXT
);
"""


@pytest_asyncio.fixture
async def db_ready(seeded_db):
    await seeded_db.executescript(EXTRA_SCHEMA)
    await seeded_db.commit()
    return seeded_db


async def _make_plant(client, auth_header) -> int:
    with patch("routers.plants.get_or_create_species", new=AsyncMock(return_value=None)), \
         patch("routers.plants.generate_thresholds", new=AsyncMock(return_value={})):
        resp = await client.post(
            "/api/plants", headers=auth_header,
            json={"name": "Hosta", "sun_requirement": "shade", "care_schedules": []},
        )
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


async def test_measured_sun_defaults_to_null(client, db_ready, auth_header):
    pid = await _make_plant(client, auth_header)
    resp = await client.get(f"/api/plants/{pid}", headers=auth_header)
    assert resp.status_code == 200, resp.text
    assert resp.json()["measured_sun_hours"] is None


async def test_set_and_clear_measured_sun(client, db_ready, auth_header):
    pid = await _make_plant(client, auth_header)

    # Set a measured value
    resp = await client.put(
        f"/api/plants/{pid}", headers=auth_header,
        json={"measured_sun_hours": 4.5},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["measured_sun_hours"] == 4.5

    # Persisted and returned on read
    resp = await client.get(f"/api/plants/{pid}", headers=auth_header)
    assert resp.json()["measured_sun_hours"] == 4.5

    # Clear it again with explicit null
    resp = await client.put(
        f"/api/plants/{pid}", headers=auth_header,
        json={"measured_sun_hours": None},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["measured_sun_hours"] is None


async def test_measured_sun_untouched_when_omitted(client, db_ready, auth_header):
    pid = await _make_plant(client, auth_header)
    await client.put(
        f"/api/plants/{pid}", headers=auth_header,
        json={"measured_sun_hours": 6.0},
    )
    # An unrelated update must not wipe the stored measured value.
    resp = await client.put(
        f"/api/plants/{pid}", headers=auth_header,
        json={"name": "Hosta (shade)"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "Hosta (shade)"
    assert body["measured_sun_hours"] == 6.0
