"""Bee support: overlap garden drachtplant bloom against bee flight periods."""
import aiosqlite
import pytest

from services.bees import bee_support_for_map, _all_bees

SCHEMA = """
CREATE TABLE plants (id INTEGER PRIMARY KEY AUTOINCREMENT, species_id INTEGER,
                     map_id INTEGER, is_active INTEGER DEFAULT 1);
CREATE TABLE plant_species (id INTEGER PRIMARY KEY, flowering_months TEXT,
                            is_drachtplant INTEGER);
"""


async def _db():
    db = await aiosqlite.connect(":memory:")
    db.row_factory = aiosqlite.Row
    await db.executescript(SCHEMA)
    return db


@pytest.mark.asyncio
async def test_empty_garden_supports_no_bees_and_gaps_span_bee_season():
    db = await _db()
    b = await bee_support_for_map(db, 7)
    assert b.supported_count == 0
    assert b.total_bees == len(_all_bees()) > 0
    # No forage at all → every month a bee flies is a gap.
    assert len(b.forage_gap_months) > 0
    assert all(not m for m in b.forage_months)
    await db.close()


@pytest.mark.asyncio
async def test_drachtplant_supports_bees_flying_in_its_bloom_months():
    db = await _db()
    # A drachtplant blooming May–Jul (5,6,7) supports bees flying then.
    await db.execute("INSERT INTO plant_species (id,flowering_months,is_drachtplant) VALUES (1,'[5,6,7]',1)")
    await db.execute("INSERT INTO plants (species_id,map_id) VALUES (1,7)")
    await db.commit()
    b = await bee_support_for_map(db, 7)
    assert b.forage_months[4] and b.forage_months[5] and b.forage_months[6]  # May,Jun,Jul
    assert b.supported_count > 0
    assert b.supported_count <= b.total_bees
    # Months 5,6,7 are now forage-covered → not in the gap list.
    assert all(m not in b.forage_gap_months for m in (5, 6, 7))
    await db.close()


@pytest.mark.asyncio
async def test_non_drachtplant_bloom_does_not_count_as_forage():
    db = await _db()
    await db.execute("INSERT INTO plant_species (id,flowering_months,is_drachtplant) VALUES (1,'[5,6,7]',0)")
    await db.execute("INSERT INTO plants (species_id,map_id) VALUES (1,7)")
    await db.commit()
    b = await bee_support_for_map(db, 7)
    assert b.supported_count == 0
    assert all(not m for m in b.forage_months)
    await db.close()
