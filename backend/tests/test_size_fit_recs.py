"""Size-aware recommendations: a plant that's too big for the garden is flagged
and softly pushed down, so a tree never tops the list for a small garden — but
is never hidden either (soft, not a filter).
"""
import json
from pathlib import Path

import aiosqlite
import pytest

from services.plant_suggestions import recommend_for_garden, _size_fit
from scripts.resolve_plant_habits import sci_key, SNAPSHOT

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


def _canvas(area_m2: float) -> str:
    # square garden of the given area, at the default 46 px/m scale
    side_px = (area_m2 ** 0.5) * 46
    return json.dumps({"scale_px_per_m": 46, "canvas_w": side_px, "canvas_h": side_px})


async def _db(area_m2: float):
    db = await aiosqlite.connect(":memory:")
    db.row_factory = _dict_row
    await db.executescript(SCHEMA)
    await db.execute("INSERT INTO maps (id, streek_slug, canvas_data) VALUES (7, NULL, ?)", (_canvas(area_m2),))
    return db


async def _species(db, sid, name, habit, height, pv=3):
    await db.execute(
        "INSERT INTO plant_species (id, common_name_nl, latin_name, sun_preference, native_to_nl, "
        "invasive_nl, pollinator_value, flowering_months, ecology_enriched_at, habit, mature_height_cm) "
        "VALUES (?,?,?, 'full', 1, 0, ?, '[4]', '2026-01-01', ?, ?)",
        (sid, name, f"Latin {sid}", pv, habit, height),
    )


def test_size_fit_thresholds():
    # balcony (10 m²): a big shrub/tree is too large; a perennial fits
    assert _size_fit("tree", 800, 10) == "large_for_space"
    assert _size_fit("shrub", 300, 10) == "large_for_space"
    assert _size_fit("perennial", 100, 10) == "fits"
    # small garden (30 m²): trees too big, large shrubs ok
    assert _size_fit("tree", 800, 30) == "large_for_space"
    assert _size_fit("large_shrub", 350, 30) == "fits"
    # big garden (400 m²): even a tree fits
    assert _size_fit("tree", 800, 400) == "fits"
    # unknown height or unknown area → never penalised (size can't be judged)
    assert _size_fit("tree", None, 10) == "unknown"
    assert _size_fit("tree", 800, None) == "unknown"
    # habit may be unknown, but a known tall height is still judged by height
    assert _size_fit(None, 800, 10) == "large_for_space"


def test_habit_snapshot_is_well_formed():
    data = json.loads(Path(SNAPSHOT).read_text(encoding="utf-8"))
    plants = data["plants"]
    assert len(plants) >= 50
    keys = [sci_key(p["scientific_name"]) for p in plants]
    assert len(set(keys)) == len(keys), "no duplicate species"
    valid = {"tree", "large_shrub", "shrub", "climber", "perennial", "grass", "groundcover", "bulb", "annual"}
    assert all(p["habit"] in valid for p in plants)
    assert all(isinstance(p["height_cm"], int) and p["height_cm"] > 0 for p in plants)


@pytest.mark.asyncio
async def test_tree_is_flagged_and_outranked_in_small_garden():
    db = await _db(area_m2=12)   # a courtyard
    # A perfect-value tree vs a perfect-value perennial, both top pollinators.
    await _species(db, 1, "Grote boom", "tree", 900, pv=3)
    await _species(db, 2, "Vaste plant", "perennial", 80, pv=3)
    await db.commit()

    recs, _ = await recommend_for_garden(db, 7)
    by_id = {r.species_id: r for r in recs}
    assert by_id[1].size_fit == "large_for_space"
    assert by_id[2].size_fit == "fits"
    # The perennial that fits outranks the equally-valuable tree.
    assert recs[0].species_id == 2
    # ...but the tree is still present (soft, not filtered) and honestly labelled.
    assert any(r.species_id == 1 for r in recs)
    assert "ruimte nodig" in by_id[1].reason
    await db.close()


@pytest.mark.asyncio
async def test_tree_ranks_normally_in_large_garden():
    db = await _db(area_m2=400)
    await _species(db, 1, "Grote boom", "tree", 900, pv=3)
    await _species(db, 2, "Vaste plant", "perennial", 80, pv=2)
    await db.commit()
    recs, _ = await recommend_for_garden(db, 7)
    by_id = {r.species_id: r for r in recs}
    assert by_id[1].size_fit == "fits"
    # With no size penalty, the higher-value tree leads.
    assert recs[0].species_id == 1
    await db.close()
