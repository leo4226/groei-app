"""HTTP-level tests for POST /api/plants (create_plant).

Uses the async `client` / `seeded_db` / `auth_header` fixtures from conftest.
`get_or_create_species` and `generate_thresholds` are patched so tests never
hit Claude/network. The in-memory schema is augmented with the `plant_species`
table that `get_plant` (returned at the end of create) joins.
"""
import json
from datetime import date
from unittest.mock import AsyncMock, patch

import pytest_asyncio

# Tables create_plant -> get_plant joins against, beyond conftest's base schema.
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
    """seeded_db + the extra tables the create→get_plant path needs."""
    await seeded_db.executescript(EXTRA_SCHEMA)
    await seeded_db.commit()
    return seeded_db


async def _schedules(db, plant_id, care_type=None):
    if care_type:
        return await db.execute_fetchall(
            "SELECT * FROM care_schedules WHERE plant_id = ? AND care_type = ? AND is_active = 1",
            (plant_id, care_type),
        )
    return await db.execute_fetchall(
        "SELECT * FROM care_schedules WHERE plant_id = ? AND is_active = 1", (plant_id,)
    )


async def test_create_plant_happy_path(client, db_ready, auth_header):
    with patch("routers.plants.get_or_create_species", new=AsyncMock(return_value=None)), \
         patch("routers.plants.generate_thresholds", new=AsyncMock(return_value={})):
        resp = await client.post(
            "/api/plants",
            headers=auth_header,
            json={
                "name": "Mien",
                "species": "Monstera deliciosa",
                "care_schedules": [{"care_type": "water", "interval_days": 7}],
            },
        )
    assert resp.status_code == 200, resp.text
    plant = resp.json()
    assert plant["name"] == "Mien"

    # Scoped to the authenticated account's household.
    row = await db_ready.execute_fetchall(
        "SELECT household_id FROM plants WHERE id = ?", (plant["id"],)
    )
    assert row[0]["household_id"] == 1

    # The explicit schedule was inserted with next_due = today.
    water = await _schedules(db_ready, plant["id"], "water")
    assert len(water) == 1
    assert str(water[0]["next_due"]) == date.today().isoformat()


async def test_create_plant_preserves_confirmed_rhythm_date_and_opt_out(client, db_ready, auth_header):
    proposed_date = "2026-07-20"
    with patch("routers.plants.get_or_create_species", new=AsyncMock(return_value=None)), \
         patch("routers.plants.generate_thresholds", new=AsyncMock(return_value={})):
        resp = await client.post(
            "/api/plants",
            headers=auth_header,
            json={
                "name": "Rhythm plant",
                "care_schedules": [{
                    "care_type": "water",
                    "interval_days": 7,
                    "next_due": proposed_date,
                    "rhythm_opt_out": True,
                }],
            },
        )

    assert resp.status_code == 200, resp.text
    water = await _schedules(db_ready, resp.json()["id"], "water")
    assert str(water[0]["next_due"]) == proposed_date
    assert water[0]["rhythm_opt_out"] == 1


async def test_seeds_from_cached_species_thresholds(client, db_ready, auth_header):
    await db_ready.execute(
        "INSERT INTO plant_species (id, care_thresholds) VALUES (1, ?)",
        (json.dumps({"water_interval_days": 9, "fertilise_months": [4, 5, 6]}),),
    )
    await db_ready.commit()
    with patch("routers.plants.get_or_create_species", new=AsyncMock(return_value=1)), \
         patch("routers.plants.generate_thresholds", new=AsyncMock(return_value={})):
        resp = await client.post(
            "/api/plants", headers=auth_header,
            json={"name": "Mien", "care_schedules": []},
        )
    assert resp.status_code == 200, resp.text
    pid = resp.json()["id"]
    water = await _schedules(db_ready, pid, "water")
    assert len(water) == 1
    assert water[0]["interval_days"] == 9
    assert len(await _schedules(db_ready, pid, "fertilize")) == 1


async def test_default_water_when_threshold_generation_fails(client, db_ready, auth_header):
    # Task 7: empty schedules + Claude down + no cached species -> exactly one
    # default water schedule (never zero).
    with patch("routers.plants.get_or_create_species", new=AsyncMock(return_value=None)), \
         patch("routers.plants.generate_thresholds", new=AsyncMock(side_effect=RuntimeError("claude down"))):
        resp = await client.post(
            "/api/plants", headers=auth_header,
            json={"name": "Mien", "care_schedules": []},
        )
    assert resp.status_code == 200, resp.text
    pid = resp.json()["id"]
    water = await _schedules(db_ready, pid, "water")
    assert len(water) == 1
    assert water[0]["interval_days"] == 7
    assert len(await _schedules(db_ready, pid)) == 1  # only the default water


async def test_no_duplicate_when_form_and_thresholds_overlap(client, db_ready, auth_header):
    # Task 8: form sends water+fertilize AND cached thresholds exist -> the seed
    # is suppressed (no duplicate rows).
    await db_ready.execute(
        "INSERT INTO plant_species (id, care_thresholds) VALUES (1, ?)",
        (json.dumps({"water_interval_days": 9, "fertilise_months": [4, 5, 6]}),),
    )
    await db_ready.commit()
    with patch("routers.plants.get_or_create_species", new=AsyncMock(return_value=1)), \
         patch("routers.plants.generate_thresholds", new=AsyncMock(return_value={})):
        resp = await client.post(
            "/api/plants", headers=auth_header,
            json={
                "name": "Mien",
                "care_schedules": [
                    {"care_type": "water", "interval_days": 7},
                    {"care_type": "fertilize", "interval_days": 30},
                ],
            },
        )
    assert resp.status_code == 200, resp.text
    pid = resp.json()["id"]
    assert len(await _schedules(db_ready, pid, "water")) == 1
    assert len(await _schedules(db_ready, pid, "fertilize")) == 1


async def test_outdoor_plant_drops_rotate_and_mist(client, db_ready, auth_header):
    # Outdoor plants must never auto-acquire rotate/mist schedules even when the
    # client sends them. A plant on an outdoor map (or no map) is outdoor_ground.
    await db_ready.execute(
        "INSERT INTO maps (id, name, map_type, household_id) VALUES (1, 'Tuin', 'outdoor', 1)"
    )
    await db_ready.commit()
    with patch("routers.plants.get_or_create_species", new=AsyncMock(return_value=None)), \
         patch("routers.plants.generate_thresholds", new=AsyncMock(return_value={})):
        resp = await client.post(
            "/api/plants", headers=auth_header,
            json={
                "name": "Varen",
                "map_id": 1,
                "care_schedules": [
                    {"care_type": "water", "interval_days": 7},
                    {"care_type": "rotate", "interval_days": 7},
                    {"care_type": "mist", "interval_days": 3},
                ],
            },
        )
    assert resp.status_code == 200, resp.text
    pid = resp.json()["id"]
    assert len(await _schedules(db_ready, pid, "water")) == 1
    assert len(await _schedules(db_ready, pid, "rotate")) == 0
    assert len(await _schedules(db_ready, pid, "mist")) == 0


async def test_indoor_plant_keeps_rotate_and_mist(client, db_ready, auth_header):
    # Indoor plants legitimately get rotate/mist.
    await db_ready.execute(
        "INSERT INTO maps (id, name, map_type, household_id) VALUES (2, 'Woonkamer', 'indoor', 1)"
    )
    await db_ready.commit()
    with patch("routers.plants.get_or_create_species", new=AsyncMock(return_value=None)), \
         patch("routers.plants.generate_thresholds", new=AsyncMock(return_value={})):
        resp = await client.post(
            "/api/plants", headers=auth_header,
            json={
                "name": "Monstera",
                "map_id": 2,
                "care_schedules": [
                    {"care_type": "water", "interval_days": 7},
                    {"care_type": "rotate", "interval_days": 7},
                    {"care_type": "mist", "interval_days": 3},
                ],
            },
        )
    assert resp.status_code == 200, resp.text
    pid = resp.json()["id"]
    assert len(await _schedules(db_ready, pid, "rotate")) == 1
    assert len(await _schedules(db_ready, pid, "mist")) == 1


async def test_species_id_linked(client, db_ready, auth_header):
    with patch("routers.plants.get_or_create_species", new=AsyncMock(return_value=7)), \
         patch("routers.plants.generate_thresholds", new=AsyncMock(return_value={})):
        resp = await client.post(
            "/api/plants", headers=auth_header,
            json={"name": "Mien", "care_schedules": []},
        )
    assert resp.status_code == 200, resp.text
    pid = resp.json()["id"]
    row = await db_ready.execute_fetchall("SELECT species_id FROM plants WHERE id = ?", (pid,))
    assert row[0]["species_id"] == 7

async def test_species_link_prefers_scientific_species_field(client, db_ready, auth_header):
    get_species = AsyncMock(return_value=7)
    with patch("routers.plants.get_or_create_species", new=get_species), patch("routers.plants.generate_thresholds", new=AsyncMock(return_value={})):
        resp = await client.post(
            "/api/plants",
            headers=auth_header,
            json={
                "name": "Blauwe bes",
                "species": "Vaccinium corymbosum",
                "care_schedules": [],
            },
        )

    assert resp.status_code == 200, resp.text
    get_species.assert_awaited_once()
    assert get_species.await_args.args[1] == "Vaccinium corymbosum"
