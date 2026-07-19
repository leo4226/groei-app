"""Soil-pH advice (advice-only): aggregate planted species' Ellenberg-derived
soil_ph_pref into a machine-readable advice code. Never touches the 0-100 score.
"""
import json
from pathlib import Path

import aiosqlite
import pytest

from services.soil_advice import soil_ph_advice_for_map
from scripts.resolve_soil_ph import sci_key, SNAPSHOT

SCHEMA = """
CREATE TABLE plants (id INTEGER PRIMARY KEY AUTOINCREMENT, species_id INTEGER,
                     map_id INTEGER, is_active INTEGER DEFAULT 1);
CREATE TABLE plant_species (id INTEGER PRIMARY KEY, common_name_nl TEXT,
                            latin_name TEXT, soil_ph_pref TEXT);
"""


def _dict_row(cursor, row):
    return {d[0]: row[i] for i, d in enumerate(cursor.description)}


async def _db():
    db = await aiosqlite.connect(":memory:")
    db.row_factory = _dict_row
    await db.executescript(SCHEMA)
    return db


async def _plant(db, sid, name, ph, map_id=1):
    await db.execute(
        "INSERT INTO plant_species (id, common_name_nl, latin_name, soil_ph_pref) VALUES (?,?,?,?)",
        (sid, name, f"Latin {sid}", ph),
    )
    await db.execute("INSERT INTO plants (species_id, map_id, is_active) VALUES (?,?,1)", (sid, map_id))


def test_snapshot_is_well_formed_with_unique_keys_and_valid_ph():
    data = json.loads(Path(SNAPSHOT).read_text(encoding="utf-8"))
    plants = data["plants"]
    assert len(plants) >= 20
    keys = [sci_key(p["scientific_name"]) for p in plants]
    assert all(keys)
    assert len(set(keys)) == len(keys), "no duplicate species in the curated list"
    assert all(p["ph"] in ("acid", "alkaline") for p in plants)
    assert sci_key("Hydrangea macrophylla 'Nikko Blue'") == "hydrangea macrophylla"


@pytest.mark.asyncio
async def test_acid_lovers_trigger_prefers_acid():
    db = await _db()
    await _plant(db, 1, "Rododendron", "acid")
    await _plant(db, 2, "Blauwe bosbes", "acid")
    await db.commit()
    advice = await soil_ph_advice_for_map(db, 1)
    assert advice.advice_code == "prefers_acid"
    assert advice.acid_count == 2 and advice.alkaline_count == 0
    assert "Rododendron" in advice.acid_examples
    await db.close()


@pytest.mark.asyncio
async def test_lime_lovers_trigger_prefers_alkaline():
    db = await _db()
    await _plant(db, 1, "Lavendel", "alkaline")
    await _plant(db, 2, "Buxus", "alkaline")
    await db.commit()
    advice = await soil_ph_advice_for_map(db, 1)
    assert advice.advice_code == "prefers_alkaline"
    await db.close()


@pytest.mark.asyncio
async def test_mixed_garden_triggers_mixed_even_with_one_each():
    db = await _db()
    await _plant(db, 1, "Rododendron", "acid")
    await _plant(db, 2, "Lavendel", "alkaline")
    await db.commit()
    advice = await soil_ph_advice_for_map(db, 1)
    assert advice.advice_code == "mixed"
    await db.close()


@pytest.mark.asyncio
async def test_single_lopsided_plant_gives_no_advice():
    db = await _db()
    await _plant(db, 1, "Lavendel", "alkaline")   # only one, below _MIN_SIGNAL
    await db.commit()
    advice = await soil_ph_advice_for_map(db, 1)
    assert advice.advice_code is None
    await db.close()


@pytest.mark.asyncio
async def test_missing_column_is_guarded():
    """Reduced schema without soil_ph_pref → empty advice, never a crash."""
    db = await aiosqlite.connect(":memory:")
    db.row_factory = _dict_row
    await db.executescript(
        "CREATE TABLE plants (id INTEGER PRIMARY KEY, species_id INTEGER, map_id INTEGER, is_active INTEGER);"
        "CREATE TABLE plant_species (id INTEGER PRIMARY KEY, latin_name TEXT);"
    )
    await db.commit()
    advice = await soil_ph_advice_for_map(db, 1)
    assert advice.advice_code is None and advice.acid_count == 0
    await db.close()
