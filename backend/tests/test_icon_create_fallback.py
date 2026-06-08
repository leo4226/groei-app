# backend/tests/test_icon_create_fallback.py
import pytest
from unittest.mock import AsyncMock, patch

EXTRA = """
CREATE TABLE locations (id INTEGER PRIMARY KEY, name TEXT, icon TEXT);
"""


@pytest.fixture
async def db_ready(seeded_db):
    await seeded_db.executescript(EXTRA)
    await seeded_db.execute("CREATE TABLE plant_species (id INTEGER PRIMARY KEY, care_thresholds TEXT, phenology_json TEXT)")
    await seeded_db.execute("ALTER TABLE plants ADD COLUMN icon_requested INTEGER DEFAULT 0")
    # Seed a minimal generated_icons catalog so match_icon_key can find "monstera"
    # without relying on the curated manifest.json being present in the test env.
    await seeded_db.execute(
        "CREATE TABLE generated_icons (id TEXT PRIMARY KEY, name TEXT, sci TEXT, cat TEXT, form TEXT, variant_of TEXT, family TEXT, url TEXT, source TEXT)"
    )
    await seeded_db.execute(
        "INSERT INTO generated_icons (id, name, sci, cat, form, url, source) VALUES ('monstera', 'Monstera', 'Monstera deliciosa', 'houseplant', 'potted', '/icons/monstera.svg', 'generated')"
    )
    await seeded_db.commit()
    return seeded_db


@pytest.mark.asyncio
async def test_unmatched_plant_gets_placeholder_and_flag(client, db_ready, auth_header):
    with patch("routers.plants.get_or_create_species", new=AsyncMock(return_value=None)), \
         patch("routers.plants.generate_thresholds", new=AsyncMock(return_value={})):
        resp = await client.post("/api/plants", headers=auth_header,
            json={"name": "Basterdkool", "species": "Bunias orientalis", "care_schedules": []})
    assert resp.status_code == 200, resp.text
    pid = resp.json()["id"]
    row = (await db_ready.execute_fetchall(
        "SELECT icon_key, icon_requested FROM plants WHERE id = ?", (pid,)))[0]
    assert row["icon_key"] and row["icon_key"].startswith("placeholder_")
    assert row["icon_requested"] in (1, True)


@pytest.mark.asyncio
async def test_matched_plant_keeps_real_icon(client, db_ready, auth_header):
    with patch("routers.plants.get_or_create_species", new=AsyncMock(return_value=None)), \
         patch("routers.plants.generate_thresholds", new=AsyncMock(return_value={})):
        resp = await client.post("/api/plants", headers=auth_header,
            json={"name": "Monstera", "care_schedules": []})
    pid = resp.json()["id"]
    row = (await db_ready.execute_fetchall(
        "SELECT icon_key, icon_requested FROM plants WHERE id = ?", (pid,)))[0]
    assert row["icon_key"] == "monstera"
    assert not row["icon_requested"]
