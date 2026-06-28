"""HTTP-level tests for plant secondary placements (Phase 4a).

A plant's primary spot stays on plants.map_x/map_y; plant_placements holds
extra spots (the "dots") that open the same plant. Uses the shared
client / seeded_db / auth_header fixtures from conftest.
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
            json={"name": "Varen", "care_schedules": []},
        )
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


async def test_add_and_delete_placement(client, db_ready, auth_header):
    pid = await _make_plant(client, auth_header)

    resp = await client.post(
        f"/api/plants/{pid}/placements", headers=auth_header,
        json={"map_id": 1, "map_x": 12.5, "map_y": 30.0, "phase": "young"},
    )
    assert resp.status_code == 200, resp.text
    marker = resp.json()
    assert marker["plant_id"] == pid
    assert marker["map_x"] == 12.5
    assert marker["phase"] == "young"
    assert marker["name"] == "Varen"
    placement_id = marker["id"]

    # Persisted
    rows = await db_ready.execute_fetchall(
        "SELECT plant_id, map_id, map_x, phase FROM plant_placements WHERE id = ?",
        (placement_id,),
    )
    assert len(rows) == 1
    assert rows[0]["plant_id"] == pid

    # Delete
    resp = await client.delete(f"/api/plants/{pid}/placements/{placement_id}", headers=auth_header)
    assert resp.status_code == 200, resp.text
    rows = await db_ready.execute_fetchall(
        "SELECT id FROM plant_placements WHERE id = ?", (placement_id,)
    )
    assert rows == []


async def test_patch_placement_moves_it(client, db_ready, auth_header):
    pid = await _make_plant(client, auth_header)
    created = (await client.post(
        f"/api/plants/{pid}/placements", headers=auth_header,
        json={"map_id": 1, "map_x": 1.0, "map_y": 2.0},
    )).json()

    resp = await client.patch(
        f"/api/plants/{pid}/placements/{created['id']}", headers=auth_header,
        json={"map_x": 99.0, "map_y": 88.0},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["map_x"] == 99.0
    assert resp.json()["map_y"] == 88.0


async def test_delete_unknown_placement_404(client, db_ready, auth_header):
    pid = await _make_plant(client, auth_header)
    resp = await client.delete(f"/api/plants/{pid}/placements/9999", headers=auth_header)
    assert resp.status_code == 404
