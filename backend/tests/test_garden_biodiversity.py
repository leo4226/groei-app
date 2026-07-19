"""Garden biodiversity scoring (recalibrated 2026-07-18, #444 audit).

Count-based components are graded against an area-scaled target. These tests
use a schema without a `maps` table, so garden area is unknown and the targets
fall back to the floor: native 5, diversity 8, streek 4. Weights: pollinator 40,
native 25, diversity 15, streek 12, abundance 8. Adding a plant never lowers the
score (targets depend on area, not plant count)."""
import aiosqlite
import pytest

from services.garden_biodiversity import compute_for_map

SCHEMA = """
CREATE TABLE plants (id INTEGER PRIMARY KEY AUTOINCREMENT, species_id INTEGER,
                     map_id INTEGER, is_active INTEGER DEFAULT 1,
                     quantity INTEGER NOT NULL DEFAULT 1);
CREATE TABLE plant_species (id INTEGER PRIMARY KEY, native_to_nl INTEGER,
                            invasive_nl INTEGER, flowering_months TEXT,
                            pollinator_value INTEGER);
"""


async def _db():
    db = await aiosqlite.connect(":memory:")
    db.row_factory = aiosqlite.Row
    await db.executescript(SCHEMA)
    return db


@pytest.mark.asyncio
async def test_native_graded_against_target():
    db = await _db()
    # 1 native, target 5 → 25 * 1/5 = 5. Non-natives don't change the native score.
    await db.execute("INSERT INTO plant_species (id,native_to_nl,pollinator_value,flowering_months) VALUES (1,1,0,'[]')")
    for i in (2, 3, 4):
        await db.execute("INSERT INTO plant_species (id,native_to_nl,pollinator_value,flowering_months) VALUES (?,0,0,'[]')", (i,))
    for sid in (1, 2, 3, 4):
        await db.execute("INSERT INTO plants (species_id,map_id,is_active) VALUES (?,7,1)", (sid,))
    await db.commit()
    b = await compute_for_map(db, 7)
    assert b.native_count == 1
    assert b.components["native"] == 5
    await db.close()


@pytest.mark.asyncio
async def test_adding_non_native_does_not_lower_native_score():
    db = await _db()
    await db.execute("INSERT INTO plant_species (id,native_to_nl,pollinator_value,flowering_months) VALUES (1,1,0,'[]')")
    await db.execute("INSERT INTO plants (species_id,map_id,is_active) VALUES (1,7,1)")
    await db.commit()
    before = (await compute_for_map(db, 7)).components["native"]
    # Add a non-native species/plant — native score must not drop.
    await db.execute("INSERT INTO plant_species (id,native_to_nl,pollinator_value,flowering_months) VALUES (2,0,0,'[]')")
    await db.execute("INSERT INTO plants (species_id,map_id,is_active) VALUES (2,7,1)")
    await db.commit()
    after = (await compute_for_map(db, 7)).components["native"]
    assert after == before == 5
    await db.close()


@pytest.mark.asyncio
async def test_abundance_bonus_rewards_quantity_with_diminishing_returns():
    db = await _db()
    # One species, single specimen → no abundance bonus (no "extra").
    await db.execute("INSERT INTO plant_species (id,native_to_nl,pollinator_value,flowering_months) VALUES (1,0,0,'[]')")
    await db.execute("INSERT INTO plants (species_id,map_id,is_active,quantity) VALUES (1,7,1,1)")
    await db.commit()
    single = await compute_for_map(db, 7)
    assert single.components["abundance"] == 0

    # Bump that record to 6 specimens → 5 extra → 10*5/15 ≈ 3.
    await db.execute("UPDATE plants SET quantity = 6 WHERE species_id = 1")
    await db.commit()
    many = await compute_for_map(db, 7)
    assert many.components["abundance"] == 3
    # Abundance only lifts the score; breadth components are unchanged.
    assert many.species_count == 1
    assert many.score == single.score + 3
    await db.close()


@pytest.mark.asyncio
async def test_abundance_bonus_caps_at_8():
    db = await _db()
    await db.execute("INSERT INTO plant_species (id,native_to_nl,pollinator_value,flowering_months) VALUES (1,0,0,'[]')")
    await db.execute("INSERT INTO plants (species_id,map_id,is_active,quantity) VALUES (1,7,1,1000)")
    await db.commit()
    b = await compute_for_map(db, 7)
    assert b.components["abundance"] == 8
    await db.close()


@pytest.mark.asyncio
async def test_native_score_caps_at_target():
    db = await _db()
    for i in range(1, 8):  # 7 natives, target 5 → capped at the 25-point weight
        await db.execute("INSERT INTO plant_species (id,native_to_nl,pollinator_value,flowering_months) VALUES (?,1,0,'[]')", (i,))
        await db.execute("INSERT INTO plants (species_id,map_id,is_active) VALUES (?,7,1)", (i,))
    await db.commit()
    b = await compute_for_map(db, 7)
    assert b.native_count == 7
    assert b.components["native"] == 25
    await db.close()
