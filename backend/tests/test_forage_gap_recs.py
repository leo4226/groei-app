"""Bee-aware recommendations: a drachtplant blooming in a forage-gap month is
flagged and boosted (#709 follow-up)."""
import aiosqlite
import pytest

from services.plant_suggestions import recommend_for_garden

SCHEMA = """
CREATE TABLE plants (id INTEGER PRIMARY KEY AUTOINCREMENT, species_id INTEGER,
                     map_id INTEGER, is_active INTEGER DEFAULT 1,
                     quantity INTEGER NOT NULL DEFAULT 1);
CREATE TABLE plant_species (id INTEGER PRIMARY KEY, common_name_nl TEXT,
                            common_name_en TEXT, latin_name TEXT, sun_preference TEXT,
                            native_to_nl INTEGER, invasive_nl INTEGER,
                            pollinator_value INTEGER, flowering_months TEXT,
                            ecology_enriched_at TEXT, is_drachtplant INTEGER DEFAULT 0);
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
    # An empty garden → no forage yet → the whole bee season is a gap.
    return db


async def _species(db, sid, name, drachtplant, months, pv=2):
    await db.execute(
        "INSERT INTO plant_species (id,common_name_nl,latin_name,sun_preference,native_to_nl,"
        "invasive_nl,pollinator_value,flowering_months,ecology_enriched_at,is_drachtplant) "
        "VALUES (?,?,?,'full',1,0,?,?, '2026-01-01', ?)",
        (sid, name, f"Latin {sid}", pv, months, 1 if drachtplant else 0),
    )


@pytest.mark.asyncio
async def test_drachtplant_in_gap_month_is_flagged_and_ranked_first():
    db = await _db()
    # Candidate A: drachtplant blooming May (a bee-season forage gap for this empty garden).
    await _species(db, 1, "Drachtplant", drachtplant=True, months="[5]", pv=2)
    # Candidate B: same pollinator value, NOT a drachtplant.
    await _species(db, 2, "Gewone plant", drachtplant=False, months="[5]", pv=2)
    await db.commit()

    recs, _ = await recommend_for_garden(db, 7)
    by_id = {r.species_id: r for r in recs}
    assert by_id[1].is_drachtplant is True
    assert by_id[1].fills_forage_gap is True
    assert by_id[2].fills_forage_gap is False
    # The forage-gap filler outranks the equivalent non-drachtplant.
    assert recs[0].species_id == 1
    assert "drachtgat" in recs[0].reason
    await db.close()


@pytest.mark.asyncio
async def test_non_drachtplant_never_fills_forage_gap():
    db = await _db()
    await _species(db, 1, "Plant", drachtplant=False, months="[5,6,7]", pv=3)
    await db.commit()
    recs, _ = await recommend_for_garden(db, 7)
    assert recs[0].fills_forage_gap is False
    await db.close()
