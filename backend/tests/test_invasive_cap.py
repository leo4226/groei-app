"""Invasive soft cap (#444 audit, choice 3A): a garden with invasive species
can't display a perfect score — capped at 90, warning kept."""
import json

import aiosqlite
import pytest

from services.garden_biodiversity import compute_for_map

SCHEMA = """
CREATE TABLE plants (id INTEGER PRIMARY KEY AUTOINCREMENT, species_id INTEGER,
                     map_id INTEGER, is_active INTEGER DEFAULT 1,
                     quantity INTEGER NOT NULL DEFAULT 1);
CREATE TABLE plant_species (id INTEGER PRIMARY KEY, native_to_nl INTEGER,
                            invasive_nl INTEGER, flowering_months TEXT,
                            pollinator_value INTEGER, is_drachtplant INTEGER DEFAULT 0);
CREATE TABLE maps (id INTEGER PRIMARY KEY, streek_slug TEXT, canvas_data TEXT);
CREATE TABLE streek_species (id INTEGER PRIMARY KEY AUTOINCREMENT,
                             streek_slug TEXT, species_id INTEGER, category TEXT);
"""

ALL_MONTHS = json.dumps(list(range(1, 13)))


async def _db(invasive: bool):
    db = await aiosqlite.connect(":memory:")
    db.row_factory = aiosqlite.Row
    await db.executescript(SCHEMA)
    # small garden → floor targets (native 5, diversity 8, streek 4)
    side = (20 ** 0.5) * 46
    await db.execute(
        "INSERT INTO maps (id,streek_slug,canvas_data) VALUES (7,'twente',?)",
        (json.dumps({"scale_px_per_m": 46, "canvas_w": side, "canvas_h": side}),),
    )
    # 8 native streek pollinator species, all flowering year-round, with clumps →
    # pollinator 40 + native 25 + diversity 15 + streek 12 + abundance 8 = 100.
    for i in range(1, 9):
        await db.execute(
            "INSERT INTO plant_species (id,native_to_nl,invasive_nl,flowering_months,pollinator_value) "
            "VALUES (?,1,0,?,3)", (i, ALL_MONTHS),
        )
        await db.execute("INSERT INTO plants (species_id,map_id,is_active,quantity) VALUES (?,7,1,200)", (i,))
        await db.execute("INSERT INTO streek_species (streek_slug,species_id,category) VALUES ('twente',?,'flora')", (i,))
    if invasive:
        await db.execute(
            "INSERT INTO plant_species (id,native_to_nl,invasive_nl,flowering_months,pollinator_value) "
            "VALUES (99,0,1,?,0)", (ALL_MONTHS,),
        )
        await db.execute("INSERT INTO plants (species_id,map_id,is_active) VALUES (99,7,1)")
    await db.commit()
    return db


@pytest.mark.asyncio
async def test_perfect_garden_hits_100_without_invasives():
    db = await _db(invasive=False)
    b = await compute_for_map(db, 7)
    assert b.invasive_count == 0
    assert b.score == 100
    await db.close()


@pytest.mark.asyncio
async def test_invasive_soft_caps_score_at_90():
    db = await _db(invasive=True)
    b = await compute_for_map(db, 7)
    assert b.invasive_count == 1
    assert b.score == 90            # capped down from a would-be 100
    await db.close()
