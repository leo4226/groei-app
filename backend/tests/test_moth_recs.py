"""Night-moth (nachtvlinder) recommendations: a moth-forage plant is flagged,
and boosted when the garden has no night-moth plants yet.

Companion signal (not folded into the 0-100 score) — mirrors the bee forage-gap
machinery but with no month logic: the nudge fires whenever the garden holds
zero moth plants, and stops once it holds at least one.
"""
import json
from pathlib import Path

import aiosqlite
import pytest

from services.plant_suggestions import recommend_for_garden
from scripts.resolve_moth_plants import sci_key, SNAPSHOT

SCHEMA = """
CREATE TABLE plants (id INTEGER PRIMARY KEY AUTOINCREMENT, species_id INTEGER,
                     map_id INTEGER, is_active INTEGER DEFAULT 1,
                     quantity INTEGER NOT NULL DEFAULT 1);
CREATE TABLE plant_species (id INTEGER PRIMARY KEY, common_name_nl TEXT,
                            common_name_en TEXT, latin_name TEXT, sun_preference TEXT,
                            native_to_nl INTEGER, invasive_nl INTEGER,
                            pollinator_value INTEGER, flowering_months TEXT,
                            ecology_enriched_at TEXT, is_drachtplant INTEGER DEFAULT 0,
                            is_moth_plant INTEGER DEFAULT 0);
CREATE TABLE maps (id INTEGER PRIMARY KEY, streek_slug TEXT);
CREATE TABLE streek_species (id INTEGER PRIMARY KEY AUTOINCREMENT,
                             streek_slug TEXT, species_id INTEGER, category TEXT);
"""


def _dict_row(cursor, row):
    return {d[0]: row[i] for i, d in enumerate(cursor.description)}


async def _db():
    db = await aiosqlite.connect(":memory:")
    db.row_factory = _dict_row
    await db.executescript(SCHEMA)
    await db.execute("INSERT INTO maps (id,streek_slug) VALUES (7,NULL)")
    return db


async def _species(db, sid, name, moth, months="[6,7]", pv=2, planted_on=None):
    await db.execute(
        "INSERT INTO plant_species (id,common_name_nl,latin_name,sun_preference,native_to_nl,"
        "invasive_nl,pollinator_value,flowering_months,ecology_enriched_at,is_moth_plant) "
        "VALUES (?,?,?,'full',1,0,?,?, '2026-01-01', ?)",
        (sid, name, f"Latin {sid}", pv, months, 1 if moth else 0),
    )
    if planted_on is not None:
        await db.execute(
            "INSERT INTO plants (species_id,map_id,is_active) VALUES (?,?,1)", (sid, planted_on)
        )


def test_moth_snapshot_is_well_formed_with_unique_keys():
    """The committed moth_plants.json ships in the image and is joined by sci_key
    at deploy — guard against malformed JSON / duplicate species in CI."""
    data = json.loads(Path(SNAPSHOT).read_text(encoding="utf-8"))
    plants = data["plants"]
    assert len(plants) >= 20
    keys = [sci_key(p["scientific_name"]) for p in plants]
    assert all(keys), "every entry must yield a genus+species key"
    assert len(set(keys)) == len(keys), "no duplicate species in the curated list"
    # sci_key strips cultivars down to genus + species
    assert sci_key("Nicotiana alata 'Lime Green'") == "nicotiana alata"


@pytest.mark.asyncio
async def test_moth_plant_flagged_and_boosted_when_garden_has_none():
    db = await _db()
    # A: moth plant; B: same pollinator value, not a moth plant.
    await _species(db, 1, "Damastbloem", moth=True, pv=2)
    await _species(db, 2, "Gewone plant", moth=False, pv=2)
    await db.commit()

    recs, _ = await recommend_for_garden(db, 7)
    by_id = {r.species_id: r for r in recs}
    assert by_id[1].is_moth_plant is True
    assert by_id[1].supports_moth_gap is True
    assert by_id[2].is_moth_plant is False
    assert by_id[2].supports_moth_gap is False
    # The moth-gap filler outranks the equivalent non-moth plant.
    assert recs[0].species_id == 1
    assert "nachtvlinder" in recs[0].reason.lower()
    await db.close()


@pytest.mark.asyncio
async def test_no_moth_nudge_once_garden_already_has_a_moth_plant():
    db = await _db()
    # Garden already holds a moth plant (species 9, planted on map 7).
    await _species(db, 9, "Kamperfoelie", moth=True, planted_on=7)
    # Candidate moth plant should be flagged but NOT get the gap boost.
    await _species(db, 1, "Teunisbloem", moth=True, pv=2)
    await db.commit()

    recs, _ = await recommend_for_garden(db, 7)
    by_id = {r.species_id: r for r in recs}
    assert by_id[1].is_moth_plant is True
    assert by_id[1].supports_moth_gap is False       # garden already supports moths
    assert "nachtvlinder" not in (by_id[1].reason or "").lower()
    await db.close()
