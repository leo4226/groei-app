"""HTTP-level tests for primary plant map position updates."""
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
CREATE TABLE objects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    object_type TEXT,
    shape TEXT,
    map_id INTEGER,
    map_x REAL,
    map_y REAL,
    category TEXT,
    is_active INTEGER DEFAULT 1
);
"""


@pytest_asyncio.fixture
async def db_ready(seeded_db):
    await seeded_db.executescript(EXTRA_SCHEMA)
    await seeded_db.execute("INSERT INTO maps (id, name, map_type, household_id) VALUES (1, 'Garden', 'outdoor', 1)")
    await seeded_db.execute(
        """INSERT INTO objects (id, name, object_type, shape, map_id, map_x, map_y, category, is_active)
           VALUES (1, 'Terracotta pot', 'pot', 'circle', 1, 100, 100, 'container', 1)"""
    )
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


async def test_position_update_lifts_plant_out_of_container(client, db_ready, auth_header):
    pid = await _make_plant(client, auth_header)
    await db_ready.execute(
        "UPDATE plants SET map_id = 1, map_x = 100, map_y = 100, container_id = 1 WHERE id = ?",
        (pid,),
    )
    await db_ready.commit()

    resp = await client.put(
        f"/api/plants/{pid}/position",
        headers=auth_header,
        json={"map_id": 1, "map_x": 240.5, "map_y": 320.25, "ground_zone_id": None},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["map_x"] == 240.5
    assert body["map_y"] == 320.25
    assert body["container_id"] is None

    rows = await db_ready.execute_fetchall(
        "SELECT map_x, map_y, container_id, ground_zone_id FROM plants WHERE id = ?",
        (pid,),
    )
    assert rows[0]["map_x"] == 240.5
    assert rows[0]["map_y"] == 320.25
    assert rows[0]["container_id"] is None
    assert rows[0]["ground_zone_id"] is None
