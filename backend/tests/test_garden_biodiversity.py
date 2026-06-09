"""Garden biodiversity: the Native component is count-based (capped), not a
ratio — so adding non-native plants never lowers the score."""
import aiosqlite
import pytest

from services.garden_biodiversity import compute_for_map

SCHEMA = """
CREATE TABLE plants (id INTEGER PRIMARY KEY AUTOINCREMENT, species_id INTEGER,
                     map_id INTEGER, is_active INTEGER DEFAULT 1);
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
async def test_native_is_count_based_not_ratio():
    db = await _db()
    # 1 native among 4 species → count-based gives 1*6=6 (a ratio would give ~8).
    await db.execute("INSERT INTO plant_species (id,native_to_nl,pollinator_value,flowering_months) VALUES (1,1,0,'[]')")
    for i in (2, 3, 4):
        await db.execute("INSERT INTO plant_species (id,native_to_nl,pollinator_value,flowering_months) VALUES (?,0,0,'[]')", (i,))
    for sid in (1, 2, 3, 4):
        await db.execute("INSERT INTO plants (species_id,map_id,is_active) VALUES (?,7,1)", (sid,))
    await db.commit()
    b = await compute_for_map(db, 7)
    assert b.native_count == 1
    assert b.components["native"] == 6
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
    assert after == before == 6
    await db.close()


@pytest.mark.asyncio
async def test_native_score_caps_at_30():
    db = await _db()
    for i in range(1, 8):  # 7 natives
        await db.execute("INSERT INTO plant_species (id,native_to_nl,pollinator_value,flowering_months) VALUES (?,1,0,'[]')", (i,))
        await db.execute("INSERT INTO plants (species_id,map_id,is_active) VALUES (?,7,1)", (i,))
    await db.commit()
    b = await compute_for_map(db, 7)
    assert b.native_count == 7
    assert b.components["native"] == 30
    await db.close()
