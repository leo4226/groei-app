"""Learn-from-dismissals: a waved-off species is excluded from a garden's
recommendations; the endpoint is household-scoped and idempotent.
"""
import aiosqlite
import pytest

from services.plant_suggestions import recommend_for_garden, _dismissed_ids

BASE = "/api"

_REC_SCHEMA = """
CREATE TABLE plants (id INTEGER PRIMARY KEY AUTOINCREMENT, species_id INTEGER,
                     map_id INTEGER, is_active INTEGER DEFAULT 1, quantity INTEGER DEFAULT 1);
CREATE TABLE plant_species (id INTEGER PRIMARY KEY, common_name_nl TEXT,
                            common_name_en TEXT, latin_name TEXT, sun_preference TEXT,
                            native_to_nl INTEGER, invasive_nl INTEGER,
                            pollinator_value INTEGER, flowering_months TEXT,
                            ecology_enriched_at TEXT, is_drachtplant INTEGER DEFAULT 0,
                            is_moth_plant INTEGER DEFAULT 0, habit TEXT, mature_height_cm INTEGER);
CREATE TABLE maps (id INTEGER PRIMARY KEY, streek_slug TEXT, canvas_data TEXT);
CREATE TABLE streek_species (id INTEGER PRIMARY KEY AUTOINCREMENT,
                             streek_slug TEXT, species_id INTEGER, category TEXT);
CREATE TABLE dismissed_recommendations (id INTEGER PRIMARY KEY AUTOINCREMENT,
                             map_id INTEGER, species_id INTEGER, created_at TEXT);
"""


def _dict_row(cursor, row):
    return {d[0]: row[i] for i, d in enumerate(cursor.description)}


async def _db():
    db = await aiosqlite.connect(":memory:")
    db.row_factory = _dict_row
    await db.executescript(_REC_SCHEMA)
    await db.execute("INSERT INTO maps (id, streek_slug) VALUES (7, NULL)")
    return db


async def _species(db, sid, name):
    await db.execute(
        "INSERT INTO plant_species (id, common_name_nl, latin_name, sun_preference, native_to_nl, "
        "invasive_nl, pollinator_value, flowering_months, ecology_enriched_at) "
        "VALUES (?,?,?, 'full', 1, 0, 3, '[6]', '2026-01-01')",
        (sid, name, f"Latin {sid}"),
    )


@pytest.mark.asyncio
async def test_dismissed_species_is_excluded_from_recommendations():
    db = await _db()
    await _species(db, 1, "Plant A")
    await _species(db, 2, "Plant B")
    await db.commit()

    recs, _ = await recommend_for_garden(db, 7)
    assert {r.species_id for r in recs} == {1, 2}

    # Dismiss species 1 for this garden.
    await db.execute("INSERT INTO dismissed_recommendations (map_id, species_id) VALUES (7, 1)")
    await db.commit()

    recs2, _ = await recommend_for_garden(db, 7)
    assert {r.species_id for r in recs2} == {2}
    assert await _dismissed_ids(db, 7) == {1}
    await db.close()


@pytest.mark.asyncio
async def test_dismissed_ids_guarded_without_table():
    db = await aiosqlite.connect(":memory:")
    db.row_factory = _dict_row
    await db.execute("CREATE TABLE maps (id INTEGER PRIMARY KEY)")
    await db.commit()
    assert await _dismissed_ids(db, 7) == set()   # no table → empty, never raises
    await db.close()


# ── endpoint (household ownership + idempotency) ──

async def _maps_and_dismissed(db):
    await db.execute("ALTER TABLE maps ADD COLUMN slug TEXT")
    await db.execute(
        "CREATE TABLE dismissed_recommendations (id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "map_id INTEGER, species_id INTEGER, created_at TEXT)"
    )


@pytest.mark.asyncio
async def test_dismiss_endpoint_is_idempotent_and_household_scoped(client, seeded_db, auth_header):
    await _maps_and_dismissed(seeded_db)
    await seeded_db.execute(
        "INSERT INTO maps (id, name, map_type, household_id, slug) VALUES (1, 'Tuin', 'outdoor', 1, 'mijn-tuin')"
    )
    await seeded_db.execute(
        "INSERT INTO maps (id, name, map_type, household_id, slug) VALUES (2, 'Andermans', 'outdoor', 999, 'andermans')"
    )
    await seeded_db.commit()

    r1 = await client.post(f"{BASE}/maps/mijn-tuin/dismiss-recommendation", json={"species_id": 5}, headers=auth_header)
    assert r1.status_code == 200, r1.text
    # second call is a no-op, not a duplicate row
    r2 = await client.post(f"{BASE}/maps/mijn-tuin/dismiss-recommendation", json={"species_id": 5}, headers=auth_header)
    assert r2.status_code == 200
    rows = await seeded_db.execute_fetchall("SELECT COUNT(*) AS n FROM dismissed_recommendations WHERE map_id = 1")
    assert rows[0]["n"] == 1

    # another household's map → 404
    r3 = await client.post(f"{BASE}/maps/andermans/dismiss-recommendation", json={"species_id": 5}, headers=auth_header)
    assert r3.status_code == 404

    # undo
    r4 = await client.delete(f"{BASE}/maps/mijn-tuin/dismiss-recommendation/5", headers=auth_header)
    assert r4.status_code == 200
    rows = await seeded_db.execute_fetchall("SELECT COUNT(*) AS n FROM dismissed_recommendations WHERE map_id = 1")
    assert rows[0]["n"] == 0
