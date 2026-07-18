"""Drachtplant (Naturalis bee-forage) strengthens pollinator coverage, additively."""
import aiosqlite
import pytest

from services.garden_biodiversity import compute_for_map

SCHEMA = """
CREATE TABLE plants (id INTEGER PRIMARY KEY AUTOINCREMENT, species_id INTEGER,
                     map_id INTEGER, is_active INTEGER DEFAULT 1,
                     quantity INTEGER NOT NULL DEFAULT 1);
CREATE TABLE plant_species (id INTEGER PRIMARY KEY, native_to_nl INTEGER,
                            invasive_nl INTEGER, flowering_months TEXT,
                            pollinator_value INTEGER, is_drachtplant INTEGER);
"""


async def _db():
    db = await aiosqlite.connect(":memory:")
    db.row_factory = aiosqlite.Row
    await db.executescript(SCHEMA)
    return db


@pytest.mark.asyncio
async def test_drachtplant_covers_months_without_pollinator_value():
    db = await _db()
    # A drachtplant flowering Mar–Apr with UNKNOWN pollinator_value still covers
    # those months (Naturalis hard signal), where the old rule (pv>=2) would not.
    await db.execute(
        "INSERT INTO plant_species (id,native_to_nl,pollinator_value,flowering_months,is_drachtplant) "
        "VALUES (1,1,NULL,'[3,4]',1)"
    )
    await db.execute("INSERT INTO plants (species_id,map_id) VALUES (1,7)")
    await db.commit()
    b = await compute_for_map(db, 7)
    assert b.pollinator_coverage_months[2] is True   # March
    assert b.pollinator_coverage_months[3] is True   # April
    assert b.components["pollinator"] == 10           # 2 months * 5
    await db.close()


@pytest.mark.asyncio
async def test_non_drachtplant_low_value_still_excluded():
    db = await _db()
    # pollinator_value 1 and not a drachtplant → not counted (unchanged behaviour).
    await db.execute(
        "INSERT INTO plant_species (id,native_to_nl,pollinator_value,flowering_months,is_drachtplant) "
        "VALUES (1,1,1,'[3,4]',0)"
    )
    await db.execute("INSERT INTO plants (species_id,map_id) VALUES (1,7)")
    await db.commit()
    b = await compute_for_map(db, 7)
    assert b.components["pollinator"] == 0
    await db.close()
