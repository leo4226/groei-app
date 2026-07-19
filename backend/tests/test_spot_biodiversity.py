"""POST /api/spots/suitability — the crop/sun inspector's biodiversity lens.

Beyond sun suitability, each suggested species now carries native / streek /
drachtplant flags so the inspector can flag ecologically valuable picks. The
streek lookup is guarded, so this exercises both the "map has a streek" and
the "no streek tables" paths.
"""
import json

import pytest

BASE = "/api"

_DDL = """
DROP TABLE IF EXISTS plant_species;
DROP TABLE IF EXISTS maps;
DROP TABLE IF EXISTS streek_species;
CREATE TABLE IF NOT EXISTS plant_species (
    id INTEGER PRIMARY KEY,
    common_name_nl TEXT,
    common_name_en TEXT,
    latin_name TEXT,
    phenology_json TEXT,
    native_to_nl INTEGER,
    pollinator_value INTEGER,
    is_drachtplant INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS maps (id INTEGER PRIMARY KEY, streek_slug TEXT);
CREATE TABLE IF NOT EXISTS streek_species (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    streek_slug TEXT, species_id INTEGER, category TEXT
);
"""

# Phenology with a single growing month (June) needing 4h of sun.
_PHENOLOGY = json.dumps({
    "months": [{"month": 6, "phase": "growing", "sun_hours_needed": 4.0}],
    "sow_window": [4],
    "transplant_window": [5],
    "harvest_window": [8],
    "frost_sensitive": True,
    "interesting_facts_nl": "",
})

# 12 months of ample sun so every species lands in the "suitable" tier.
_FULL_SUN = [8.0] * 12


async def _seed(db):
    await db.executescript(_DDL)
    await db.execute("INSERT INTO maps (id, streek_slug) VALUES (7, 'twente')")
    # 1: streek + native + drachtplant, 2: native only, 3: plain
    for sid, nl, native, pv, dracht in [
        (1, "Streekplant", 1, 5, 1),
        (2, "Inheemse plant", 1, 3, 0),
        (3, "Gewone plant", 0, 0, 0),
    ]:
        await db.execute(
            "INSERT INTO plant_species "
            "(id, common_name_nl, common_name_en, latin_name, phenology_json, "
            "native_to_nl, pollinator_value, is_drachtplant) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (sid, nl, nl, f"Latin {sid}", _PHENOLOGY, native, pv, dracht),
        )
    await db.execute(
        "INSERT INTO streek_species (streek_slug, species_id, category) "
        "VALUES ('twente', 1, 'flora')"
    )
    await db.commit()


@pytest.mark.asyncio
async def test_suitability_carries_biodiversity_flags(client, seeded_db):
    await _seed(seeded_db)

    resp = await client.post(
        f"{BASE}/spots/suitability",
        json={"x": 0.0, "y": 0.0, "map_id": 7, "sun_by_month": _FULL_SUN},
    )
    assert resp.status_code == 200, resp.text
    species = {s["species_id"]: s for s in resp.json()["species"]}

    assert species[1]["is_streek"] is True
    assert species[1]["is_native"] is True
    assert species[1]["is_drachtplant"] is True
    assert species[1]["pollinator_value"] == 5

    assert species[2]["is_streek"] is False
    assert species[2]["is_native"] is True
    assert species[2]["is_drachtplant"] is False

    assert species[3]["is_streek"] is False
    assert species[3]["is_native"] is False


@pytest.mark.asyncio
async def test_suitability_survives_missing_streek_tables(client, seeded_db):
    """A map with no streek (or absent streek tables) still returns flags —
    is_streek just falls back to False for everything."""
    await seeded_db.executescript(_DDL)
    await seeded_db.execute("INSERT INTO maps (id, streek_slug) VALUES (9, NULL)")
    await seeded_db.execute(
        "INSERT INTO plant_species "
        "(id, common_name_nl, common_name_en, latin_name, phenology_json, "
        "native_to_nl, pollinator_value, is_drachtplant) "
        "VALUES (1, 'Plant', 'Plant', 'Latin', ?, 1, 2, 0)",
        (_PHENOLOGY,),
    )
    await seeded_db.commit()

    resp = await client.post(
        f"{BASE}/spots/suitability",
        json={"x": 0.0, "y": 0.0, "map_id": 9, "sun_by_month": _FULL_SUN},
    )
    assert resp.status_code == 200, resp.text
    species = resp.json()["species"]
    assert len(species) == 1
    assert species[0]["is_streek"] is False
    assert species[0]["is_native"] is True
