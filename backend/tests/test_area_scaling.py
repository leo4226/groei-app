"""Area-scaled scoring: a bigger garden needs proportionally more plants for the
same count-based points (#444 audit, choice 1A)."""
import json

import aiosqlite
import pytest

from services.garden_biodiversity import compute_for_map, _score_targets

SCHEMA = """
CREATE TABLE plants (id INTEGER PRIMARY KEY AUTOINCREMENT, species_id INTEGER,
                     map_id INTEGER, is_active INTEGER DEFAULT 1,
                     quantity INTEGER NOT NULL DEFAULT 1);
CREATE TABLE plant_species (id INTEGER PRIMARY KEY, native_to_nl INTEGER,
                            invasive_nl INTEGER, flowering_months TEXT,
                            pollinator_value INTEGER);
CREATE TABLE maps (id INTEGER PRIMARY KEY, canvas_data TEXT);
"""


async def _db(area_m2: float | None):
    db = await aiosqlite.connect(":memory:")
    db.row_factory = aiosqlite.Row
    await db.executescript(SCHEMA)
    canvas = None
    if area_m2 is not None:
        side = (area_m2 ** 0.5) * 46  # scale_px_per_m = 46
        canvas = json.dumps({"scale_px_per_m": 46, "canvas_w": side, "canvas_h": side})
    await db.execute("INSERT INTO maps (id, canvas_data) VALUES (7, ?)", (canvas,))
    # 5 native species, one specimen each
    for i in range(1, 6):
        await db.execute("INSERT INTO plant_species (id,native_to_nl,pollinator_value,flowering_months) VALUES (?,1,0,'[]')", (i,))
        await db.execute("INSERT INTO plants (species_id,map_id,is_active) VALUES (?,7,1)", (i,))
    await db.commit()
    return db


def test_targets_scale_sublinearly_with_area():
    small = _score_targets(4)      # tiny → floor
    ref = _score_targets(40)       # reference
    big = _score_targets(360)      # 9x area → 3x targets (sqrt)
    assert small["native"] == 5 and small["diversity"] == 8      # floors
    assert ref["native"] == 5 and ref["diversity"] == 8
    assert big["native"] > ref["native"] and big["diversity"] > ref["diversity"]
    assert big["native"] == 15 and big["diversity"] == 24        # 5*3, 8*3


@pytest.mark.asyncio
async def test_same_plants_score_lower_in_a_bigger_garden():
    small = await _db(20)     # below reference → floor targets
    big = await _db(360)      # large → higher targets
    b_small = await compute_for_map(small, 7)
    b_big = await compute_for_map(big, 7)
    # 5 natives fully meet a small garden's target (25) but only part of a big
    # garden's (target 15 → 25*5/15 ≈ 8).
    assert b_small.components["native"] == 25
    assert b_big.components["native"] < b_small.components["native"]
    assert b_big.score < b_small.score
    await small.close()
    await big.close()


@pytest.mark.asyncio
async def test_area_exposed_in_profile():
    db = await _db(100)
    b = await compute_for_map(db, 7)
    assert b.area_m2 is not None and 95 < b.area_m2 < 105
    assert set(b.score_targets) == {"diversity", "native", "streek"}
    await db.close()
