"""Streek bonus: streekeigen plants score extra, additively (never a penalty)."""
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
CREATE TABLE maps (id INTEGER PRIMARY KEY, streek_slug TEXT);
CREATE TABLE streek_species (id INTEGER PRIMARY KEY AUTOINCREMENT,
                             streek_slug TEXT, species_id INTEGER, category TEXT);
"""


async def _db():
    db = await aiosqlite.connect(":memory:")
    db.row_factory = aiosqlite.Row
    await db.executescript(SCHEMA)
    return db


async def _add_species(db, sid, streek=None):
    await db.execute(
        "INSERT INTO plant_species (id,native_to_nl,pollinator_value,flowering_months) VALUES (?,0,0,'[]')",
        (sid,),
    )
    await db.execute("INSERT INTO plants (species_id,map_id,is_active) VALUES (?,7,1)", (sid,))
    if streek:
        await db.execute(
            "INSERT INTO streek_species (streek_slug,species_id,category) VALUES (?,?, 'flora')",
            (streek, sid),
        )


@pytest.mark.asyncio
async def test_streek_bonus_counts_streekeigen_species():
    db = await _db()
    await db.execute("INSERT INTO maps (id,streek_slug) VALUES (7,'twente')")
    for sid in (1, 2, 3):
        await _add_species(db, sid, streek="twente")
    await _add_species(db, 4, streek=None)  # non-streek plant
    await db.commit()

    b = await compute_for_map(db, 7)
    assert b.streek_slug == "twente"
    assert b.streek_native_count == 3          # only the 3 streekeigen species
    assert b.components["streek"] == 9         # 3 * 3
    await db.close()


@pytest.mark.asyncio
async def test_streek_bonus_capped_at_weight():
    db = await _db()
    await db.execute("INSERT INTO maps (id,streek_slug) VALUES (7,'twente')")
    for sid in range(1, 8):                     # 7 streek species → 21 pre-cap
        await _add_species(db, sid, streek="twente")
    await db.commit()
    b = await compute_for_map(db, 7)
    assert b.streek_native_count == 7
    assert b.components["streek"] == 12         # capped at the streek weight
    await db.close()


@pytest.mark.asyncio
async def test_no_streek_no_bonus_and_no_error():
    """Map with no streek (or reduced schema) contributes nothing, never errors."""
    db = await _db()
    await db.execute("INSERT INTO maps (id,streek_slug) VALUES (7,NULL)")
    await _add_species(db, 1, streek=None)
    await db.commit()
    b = await compute_for_map(db, 7)
    assert b.streek_slug is None
    assert b.streek_native_count == 0
    assert b.components["streek"] == 0
    await db.close()


@pytest.mark.asyncio
async def test_streek_bonus_is_additive_only():
    """Adding a streek plant raises the total; it never lowers it."""
    db = await _db()
    await db.execute("INSERT INTO maps (id,streek_slug) VALUES (7,'twente')")
    await _add_species(db, 1, streek="twente")
    await db.commit()
    before = await compute_for_map(db, 7)
    await _add_species(db, 2, streek="twente")
    await db.commit()
    after = await compute_for_map(db, 7)
    assert after.score >= before.score
    assert after.components["streek"] > before.components["streek"]
    await db.close()
