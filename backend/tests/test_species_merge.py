"""Merging two species moves everything that names the source onto the target."""
import pytest

from routers.admin_panel import _repoint_species

SCHEMA = """
    CREATE TABLE IF NOT EXISTS plant_species (id INTEGER PRIMARY KEY, common_name_nl TEXT);
    CREATE TABLE IF NOT EXISTS user_confirmed_embeddings (id INTEGER PRIMARY KEY, species_id INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS plant_discoveries (id INTEGER PRIMARY KEY, species_id INTEGER);
    CREATE TABLE IF NOT EXISTS streek_species (id INTEGER PRIMARY KEY, species_id INTEGER);
    CREATE TABLE IF NOT EXISTS plant_photos (id INTEGER PRIMARY KEY, bioclip_species_id INTEGER);
    CREATE TABLE IF NOT EXISTS identify_log (id INTEGER PRIMARY KEY, top_species_id INTEGER, chosen_species_id INTEGER);
    CREATE TABLE IF NOT EXISTS dismissed_recommendations (
        id INTEGER PRIMARY KEY, map_id INTEGER NOT NULL, species_id INTEGER NOT NULL,
        UNIQUE (map_id, species_id)
    );
"""


@pytest.mark.asyncio
async def test_merge_keeps_confirmed_photos_finds_and_dismissals(seeded_db):
    db = seeded_db
    await db.executescript(SCHEMA)
    await db.executescript("""
        INSERT INTO plant_species (id, common_name_nl) VALUES (1, 'Dubbel'), (2, 'Echt');
        INSERT INTO plants (id, name, household_id, species_id) VALUES (5, 'Roos', 1, 1);
        INSERT INTO user_confirmed_embeddings (id, species_id) VALUES (10, 1);
        INSERT INTO plant_discoveries (id, species_id) VALUES (20, 1);
        INSERT INTO streek_species (id, species_id) VALUES (30, 1);
        INSERT INTO plant_photos (id, bioclip_species_id) VALUES (40, 1);
        INSERT INTO identify_log (id, engine, top_species_id, chosen_species_id) VALUES (50, 'bioclip', 1, 1);
        INSERT INTO dismissed_recommendations (map_id, species_id) VALUES (7, 1), (7, 2), (8, 1);
    """)

    await _repoint_species(db, 1, 2)

    for query in (
        "SELECT species_id AS s FROM plants WHERE id = 5",
        "SELECT species_id AS s FROM user_confirmed_embeddings",
        "SELECT species_id AS s FROM plant_discoveries",
        "SELECT species_id AS s FROM streek_species",
        "SELECT bioclip_species_id AS s FROM plant_photos",
        "SELECT chosen_species_id AS s FROM identify_log",
    ):
        rows = await db.execute_fetchall(query)
        assert [row["s"] for row in rows] == [2], query
    dismissed = await db.execute_fetchall(
        "SELECT map_id, species_id FROM dismissed_recommendations ORDER BY map_id"
    )
    assert [(r["map_id"], r["species_id"]) for r in dismissed] == [(7, 2), (8, 2)]
    assert await db.execute_fetchall("SELECT id FROM plant_species WHERE id = 1") == []
