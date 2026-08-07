"""Container / provenance detail round-trips through create, read and update.

Regression cover for the add-plant audit (P1-1): the Add Plant form collected
form type, pot material, pot dimensions, drainage, substrate and the
acquired-from text, and `buildCreatePayload` dropped every one of them. These
tests fail against the pre-0063 schema.
"""
import pytest
from unittest.mock import AsyncMock, patch


@pytest.fixture
async def db_ready(seeded_db):
    await seeded_db.execute(
        "CREATE TABLE plant_species (id INTEGER PRIMARY KEY, common_name_nl TEXT,"
        " common_name_en TEXT, care_thresholds TEXT, phenology_json TEXT)"
    )
    await seeded_db.execute("ALTER TABLE plants ADD COLUMN icon_requested INTEGER DEFAULT 0")
    await seeded_db.commit()
    return seeded_db


async def _create(client, auth_header, **fields):
    """POST a plant with species/threshold generation stubbed out."""
    with patch("routers.plants.get_or_create_species", new=AsyncMock(return_value=None)), \
         patch("routers.plants.generate_thresholds", new=AsyncMock(return_value={})):
        resp = await client.post("/api/plants", json=fields, headers=auth_header)
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_create_persists_container_details(client, db_ready, auth_header):
    plant = await _create(
        client, auth_header,
        name="Potted Monstera",
        species="Monstera deliciosa",
        form_type="pot",
        pot_material="terracotta",
        pot_diameter_cm=18,
        pot_height_cm=22,
        has_drainage=True,
        substrate=["potgrond", "perliet"],
        acquired_from="Garden centre",
    )

    assert plant["form_type"] == "pot"
    assert plant["pot_material"] == "terracotta"
    assert plant["pot_diameter_cm"] == 18
    assert plant["pot_height_cm"] == 22
    assert plant["has_drainage"] is True
    assert plant["substrate"] == ["potgrond", "perliet"]
    assert plant["acquired_from"] == "Garden centre"

    # A re-read returns the same values, so they really landed in the table.
    again = await client.get(f"/api/plants/{plant['id']}", headers=auth_header)
    assert again.status_code == 200
    assert again.json()["substrate"] == ["potgrond", "perliet"]
    assert again.json()["pot_material"] == "terracotta"


@pytest.mark.asyncio
async def test_pot_diameter_backfills_pot_size_cm(client, db_ready, auth_header):
    """The form asks for a diameter; pot_size_cm drives the potted/bare icon."""
    plant = await _create(client, auth_header, name="Diameter only", pot_diameter_cm=24)
    assert plant["pot_size_cm"] == 24


@pytest.mark.asyncio
async def test_explicit_pot_size_wins_over_diameter(client, db_ready, auth_header):
    plant = await _create(
        client, auth_header, name="Both given", pot_size_cm=30, pot_diameter_cm=24,
    )
    assert plant["pot_size_cm"] == 30
    assert plant["pot_diameter_cm"] == 24


@pytest.mark.asyncio
async def test_omitted_details_default_cleanly(client, db_ready, auth_header):
    plant = await _create(client, auth_header, name="Bare minimum")
    assert plant["form_type"] is None
    assert plant["pot_material"] is None
    assert plant["has_drainage"] is None
    assert plant["substrate"] == []
    assert plant["acquired_from"] is None


@pytest.mark.asyncio
async def test_update_round_trips_substrate(client, db_ready, auth_header):
    created = await _create(client, auth_header, name="Repot me", substrate=["potgrond"])

    resp = await client.put(
        f"/api/plants/{created['id']}",
        json={"substrate": ["bark", "perliet"], "pot_material": "ceramic", "has_drainage": False},
        headers=auth_header,
    )
    assert resp.status_code == 200, resp.text
    plant = resp.json()
    assert plant["substrate"] == ["bark", "perliet"]
    assert plant["pot_material"] == "ceramic"
    assert plant["has_drainage"] is False


@pytest.mark.asyncio
async def test_update_can_clear_substrate(client, db_ready, auth_header):
    created = await _create(client, auth_header, name="Clear me", substrate=["potgrond"])

    resp = await client.put(
        f"/api/plants/{created['id']}", json={"substrate": []}, headers=auth_header,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["substrate"] == []
