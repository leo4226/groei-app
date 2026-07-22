"""Growth-form companion signals (advice-only): carbon proxy (woody) + ground
cover, aggregated per garden. Never touches the 0-100 score.
"""
import json
from pathlib import Path

import aiosqlite
import pytest

from services.growth_signals import growth_form_signals_for_map
from scripts.resolve_growth_form import sci_key, SNAPSHOT

SCHEMA = """
CREATE TABLE plants (id INTEGER PRIMARY KEY AUTOINCREMENT, species_id INTEGER,
                     map_id INTEGER, is_active INTEGER DEFAULT 1);
CREATE TABLE plant_species (id INTEGER PRIMARY KEY, common_name_nl TEXT,
                            latin_name TEXT, is_woody INTEGER, is_ground_cover INTEGER);
"""


def _dict_row(cursor, row):
    return {d[0]: row[i] for i, d in enumerate(cursor.description)}


async def _db():
    db = await aiosqlite.connect(":memory:")
    db.row_factory = _dict_row
    await db.executescript(SCHEMA)
    return db


async def _plant(db, sid, name, woody=None, ground=None, map_id=1):
    await db.execute(
        "INSERT INTO plant_species (id, common_name_nl, latin_name, is_woody, is_ground_cover) VALUES (?,?,?,?,?)",
        (sid, name, f"Latin {sid}", woody, ground),
    )
    await db.execute("INSERT INTO plants (species_id, map_id, is_active) VALUES (?,?,1)", (sid, map_id))


def test_snapshot_is_well_formed_with_unique_keys_and_valid_forms():
    data = json.loads(Path(SNAPSHOT).read_text(encoding="utf-8"))
    plants = data["plants"]
    assert len(plants) >= 30
    keys = [sci_key(p["scientific_name"]) for p in plants]
    assert all(keys)
    assert len(set(keys)) == len(keys), "no duplicate species in the curated list"
    assert all(p["form"] in ("woody", "groundcover") for p in plants)
    # snapshot should carry both signals
    assert any(p["form"] == "woody" for p in plants)
    assert any(p["form"] == "groundcover" for p in plants)


@pytest.mark.asyncio
async def test_many_woody_species_reads_as_strong_carbon():
    db = await _db()
    await _plant(db, 1, "Eik", woody=1)
    await _plant(db, 2, "Beuk", woody=1)
    await _plant(db, 3, "Hazelaar", woody=1)
    await db.commit()
    sig = await growth_form_signals_for_map(db, 1)
    assert sig.woody_count == 3
    assert sig.carbon_level == "strong"
    await db.close()


@pytest.mark.asyncio
async def test_no_woody_reads_as_low_carbon():
    db = await _db()
    await _plant(db, 1, "Vaste plant", woody=None)
    await _plant(db, 2, "Eenjarige", woody=None)
    await db.commit()
    sig = await growth_form_signals_for_map(db, 1)
    assert sig.carbon_level == "low"
    assert sig.woody_count == 0
    await db.close()


@pytest.mark.asyncio
async def test_ground_cover_advice_fires_when_garden_has_plants_but_no_cover():
    db = await _db()
    await _plant(db, 1, "Plant A")
    await _plant(db, 2, "Plant B")
    await _plant(db, 3, "Plant C")
    await db.commit()
    sig = await growth_form_signals_for_map(db, 1)
    assert sig.ground_cover_count == 0
    assert sig.ground_cover_advice == "add"
    await db.close()


@pytest.mark.asyncio
async def test_no_ground_cover_advice_once_a_cover_is_present():
    db = await _db()
    await _plant(db, 1, "Klimop", ground=1)
    await _plant(db, 2, "Plant B")
    await _plant(db, 3, "Plant C")
    await db.commit()
    sig = await growth_form_signals_for_map(db, 1)
    assert sig.ground_cover_count == 1
    assert sig.ground_cover_advice is None
    assert "Klimop" in sig.ground_cover_examples
    await db.close()


@pytest.mark.asyncio
async def test_missing_columns_are_guarded():
    db = await aiosqlite.connect(":memory:")
    db.row_factory = _dict_row
    await db.executescript(
        "CREATE TABLE plants (id INTEGER PRIMARY KEY, species_id INTEGER, map_id INTEGER, is_active INTEGER);"
        "CREATE TABLE plant_species (id INTEGER PRIMARY KEY, latin_name TEXT);"
    )
    await db.commit()
    sig = await growth_form_signals_for_map(db, 1)
    assert sig.carbon_level is None and sig.woody_count == 0
    await db.close()
