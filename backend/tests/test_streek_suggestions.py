"""Streek recommendations: "Planten uit jouw streek" + streekeigen ranking boost."""
import aiosqlite
import pytest

from services.plant_suggestions import recommend_for_streek, recommend_for_garden

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
    # dict rows support both r["x"] and r.get("x") — the recommender uses .get()
    # for optional columns (asyncpg Records provide it in prod; sqlite3.Row does not).
    return {d[0]: row[i] for i, d in enumerate(cursor.description)}


async def _db():
    db = await aiosqlite.connect(":memory:")
    db.row_factory = _dict_row
    await db.executescript(SCHEMA)
    await db.execute("INSERT INTO maps (id,streek_slug) VALUES (7,'twente')")
    return db


async def _species(db, sid, name, streek=False, pv=2, enriched=True):
    await db.execute(
        "INSERT INTO plant_species (id,common_name_nl,latin_name,sun_preference,native_to_nl,"
        "invasive_nl,pollinator_value,flowering_months,ecology_enriched_at) "
        "VALUES (?,?,?,'full',1,0,?, '[6]', ?)",
        (sid, name, f"Latin {sid}", pv, "2026-01-01" if enriched else None),
    )
    if streek:
        await db.execute(
            "INSERT INTO streek_species (streek_slug,species_id,category) VALUES ('twente',?,'flora')",
            (sid,),
        )


@pytest.mark.asyncio
async def test_recommend_for_streek_returns_unplanted_streek_flora():
    db = await _db()
    await _species(db, 1, "Streekplant A", streek=True)
    await _species(db, 2, "Streekplant B", streek=True)
    await _species(db, 3, "Gewone plant", streek=False)
    # species 1 already in the garden → excluded from suggestions
    await db.execute("INSERT INTO plants (species_id,map_id,is_active) VALUES (1,7,1)")
    await db.commit()

    name, recs = await recommend_for_streek(db, 7)
    assert name == "Twente"
    ids = {r.species_id for r in recs}
    assert ids == {2}                       # B suggested; A already planted; C not streek
    assert recs[0].is_streek is True
    assert "hoort thuis in Twente" in recs[0].reason
    assert "belongs in Twente" in recs[0].reason_en
    await db.close()


@pytest.mark.asyncio
async def test_streekeigen_boosts_ranking_in_garden_suggestions():
    db = await _db()
    # Two equally-valuable candidates; only #2 is streekeigen → ranks first.
    await _species(db, 1, "Niet-streek", streek=False, pv=2)
    await _species(db, 2, "Streekplant", streek=True, pv=2)
    await db.commit()
    recs, _ = await recommend_for_garden(db, 7)
    assert recs[0].species_id == 2
    assert recs[0].is_streek is True
    await db.close()


@pytest.mark.asyncio
async def test_no_streek_returns_empty():
    db = await aiosqlite.connect(":memory:")
    db.row_factory = _dict_row
    await db.executescript(SCHEMA)
    await db.execute("INSERT INTO maps (id,streek_slug) VALUES (7,NULL)")
    await db.commit()
    name, recs = await recommend_for_streek(db, 7)
    assert recs == []
    await db.close()
