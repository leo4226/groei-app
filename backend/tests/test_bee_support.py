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
async def test_full_year_forage_supports_all_bees():
    db = await _db()
    # Forage every month → every bee's whole flight is covered → all supported.
    await db.execute("INSERT INTO plant_species (id,flowering_months,is_drachtplant) VALUES (1,'[1,2,3,4,5,6,7,8,9,10,11,12]',1)")
    await db.execute("INSERT INTO plants (species_id,map_id) VALUES (1,7)")
    await db.commit()
    b = await bee_support_for_map(db, 7)
    assert b.supported_count == b.total_bees
    assert b.forage_gap_months == []
    await db.close()


@pytest.mark.asyncio
async def test_supported_requires_full_flight_coverage_not_just_overlap():
    db = await _db()
    # Summer-only forage (Jun–Sep). A bee flying Mar–Jul is NOT supported
    # (Mar–May lack forage); a bee flying entirely within Jun–Sep is.
    await db.execute("INSERT INTO plant_species (id,flowering_months,is_drachtplant) VALUES (1,'[6,7,8,9]',1)")
    await db.execute("INSERT INTO plants (species_id,map_id) VALUES (1,7)")
    await db.commit()
    b = await bee_support_for_map(db, 7)
    # Not saturated — the early-spring gap excludes spring-flying bees.
    assert 0 < b.supported_count < b.total_bees
    assert b.forage_months[5] and b.forage_months[8]   # Jun, Sep
    assert all(m not in b.forage_gap_months for m in (6, 7, 8, 9))
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
