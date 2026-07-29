"""Same-function, right-size alternatives: attached to an oversized pick only,
so "no room for a willow?" offers smaller swaps serving the same function.
"""
import json
from pathlib import Path

import aiosqlite
import pytest

from services.plant_alternatives import alternatives_raw, alternatives_for, _sci_key, _SNAPSHOT
from services.plant_suggestions import recommend_for_garden

SCHEMA = """
CREATE TABLE plants (id INTEGER PRIMARY KEY AUTOINCREMENT, species_id INTEGER,
                     map_id INTEGER, is_active INTEGER DEFAULT 1, quantity INTEGER DEFAULT 1);
CREATE TABLE plant_species (id INTEGER PRIMARY KEY, common_name_nl TEXT,
                            common_name_en TEXT, latin_name TEXT, sun_preference TEXT,
                            native_to_nl INTEGER, invasive_nl INTEGER,
                            pollinator_value INTEGER, flowering_months TEXT,
                            ecology_enriched_at TEXT, is_drachtplant INTEGER DEFAULT 0,
                            is_moth_plant INTEGER DEFAULT 0,
                            habit TEXT, mature_height_cm INTEGER);
CREATE TABLE maps (id INTEGER PRIMARY KEY, streek_slug TEXT, canvas_data TEXT);
CREATE TABLE streek_species (id INTEGER PRIMARY KEY AUTOINCREMENT,
                             streek_slug TEXT, species_id INTEGER, category TEXT);
"""


def _dict_row(cursor, row):
    return {d[0]: row[i] for i, d in enumerate(cursor.description)}


def _canvas(area_m2):
    side = (area_m2 ** 0.5) * 46
    return json.dumps({"scale_px_per_m": 46, "canvas_w": side, "canvas_h": side})


def test_snapshot_well_formed_and_bilingual():
    data = json.loads(Path(_SNAPSHOT).read_text(encoding="utf-8"))["alternatives"]
    assert len(data) >= 10
    for big, entry in data.items():
        assert entry["function_nl"] and entry["function_en"]
        assert entry["picks"]
        for p in entry["picks"]:
            assert p["dutch_name"] and p["latin_name"]
            assert p["note_nl"] and p["note_en"]


def test_alternatives_lookup_matches_by_sci_key_incl_cultivars():
    # Salix caprea is curated; a cultivar string still resolves.
    assert alternatives_raw("Salix caprea 'Kilmarnock'") is not None
    assert _sci_key("Salix caprea 'Kilmarnock'") == "salix caprea"
    # A perennial we never curate → no alternatives.
    assert alternatives_raw("Origanum vulgare") is None
    assert alternatives_raw(None) is None


def test_alternatives_localize():
    nl = alternatives_for("Salix caprea", "nl")
    en = alternatives_for("Salix caprea", "en")
    assert nl["function"] != en["function"]
    assert nl["picks"][0]["note"] != en["picks"][0]["note"]


async def _db(area_m2):
    db = await aiosqlite.connect(":memory:")
    db.row_factory = _dict_row
    await db.executescript(SCHEMA)
    await db.execute("INSERT INTO maps (id, streek_slug, canvas_data) VALUES (7, NULL, ?)", (_canvas(area_m2),))
    return db


async def _species(db, sid, name, latin, habit, height):
    await db.execute(
        "INSERT INTO plant_species (id, common_name_nl, latin_name, sun_preference, native_to_nl, "
        "invasive_nl, pollinator_value, flowering_months, ecology_enriched_at, habit, mature_height_cm) "
        "VALUES (?,?,?, 'full', 1, 0, 3, '[4]', '2026-01-01', ?, ?)",
        (sid, name, latin, habit, height),
    )


@pytest.mark.asyncio
async def test_oversized_pick_gets_alternatives_but_a_fitting_one_does_not():
    db = await _db(area_m2=12)   # courtyard
    await _species(db, 1, "Boswilg", "Salix caprea", "tree", 800)      # oversized + curated
    await _species(db, 2, "Wilde marjolein", "Origanum vulgare", "perennial", 50)  # fits
    await db.commit()

    recs, _ = await recommend_for_garden(db, 7)
    by_id = {r.species_id: r for r in recs}
    assert by_id[1].size_fit == "large_for_space"
    assert by_id[1].alternatives is not None
    assert by_id[1].alternatives["function_nl"] == "vroege bijendracht"
    assert any(p["dutch_name"] == "Sleedoorn" for p in by_id[1].alternatives["picks"])
    # a fitting plant carries no alternatives
    assert by_id[2].size_fit == "fits"
    assert by_id[2].alternatives is None
    await db.close()


@pytest.mark.asyncio
async def test_no_alternatives_when_tree_fits_a_big_garden():
    db = await _db(area_m2=400)
    await _species(db, 1, "Boswilg", "Salix caprea", "tree", 800)
    await db.commit()
    recs, _ = await recommend_for_garden(db, 7)
    assert recs[0].size_fit == "fits"
    assert recs[0].alternatives is None
    await db.close()
