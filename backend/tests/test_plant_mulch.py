"""Per-plant mulch flag round-trips through create, read and update (#799).

Cover for the mulch pressure factor: the flag must persist from the plant
edit surface through the API into the plants table and back out again.
"""
import pytest
from unittest.mock import AsyncMock, patch


@pytest.fixture
async def db_ready(seeded_db):
    """Seeded DB plus the pieces create_plant depends on that the minimal
    conftest schema omits (same shape as test_plant_container_details)."""
    await seeded_db.execute(
        "CREATE TABLE plant_species (id INTEGER PRIMARY KEY, common_name_nl TEXT,"
        " common_name_en TEXT, care_thresholds TEXT, phenology_json TEXT)"
    )
    await seeded_db.execute("ALTER TABLE plants ADD COLUMN icon_requested INTEGER DEFAULT 0")
    await seeded_db.commit()
    return seeded_db


async def _create(client, auth_header, **fields):
    """POST a plant with species/threshold generation stubbed out."""
    with patch("routers.plants.get_or_create_species", new=AsyncMock(return_value=None)),          patch("routers.plants.generate_thresholds", new=AsyncMock(return_value={})):
        resp = await client.post("/api/plants", json=fields, headers=auth_header)
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_mulch_round_trip(client, db_ready, auth_header):
    plant = await _create(client, auth_header, name="Mulched rose", mulch=True)
    assert plant["mulch"] is True

    again = await client.get(f"/api/plants/{plant['id']}", headers=auth_header)
    assert again.status_code == 200
    assert again.json()["mulch"] is True

    updated = await client.put(
        f"/api/plants/{plant['id']}",
        json={"mulch": False},
        headers=auth_header,
    )
    assert updated.status_code == 200
    assert updated.json()["mulch"] is False


@pytest.mark.asyncio
async def test_mulch_defaults_to_unknown(client, db_ready, auth_header):
    plant = await _create(client, auth_header, name="Unknown mulch")
    assert plant["mulch"] is None
