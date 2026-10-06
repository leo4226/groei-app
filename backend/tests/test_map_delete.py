"""Deleting a map is all-or-nothing and does not trip over garden games."""
import pytest

EXTRA_SCHEMA = """
    CREATE TABLE IF NOT EXISTS zones (id INTEGER PRIMARY KEY, map_id INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS objects (id INTEGER PRIMARY KEY, map_id INTEGER, is_active INTEGER DEFAULT 1);
    CREATE TABLE IF NOT EXISTS ground_zones (id TEXT PRIMARY KEY, map_id INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS weed_sightings (id INTEGER PRIMARY KEY, map_id INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS garden_features (id INTEGER PRIMARY KEY, map_id INTEGER NOT NULL, feature_type TEXT);
    CREATE TABLE IF NOT EXISTS dismissed_recommendations (id INTEGER PRIMARY KEY, map_id INTEGER NOT NULL, species_id INTEGER);
    CREATE TABLE IF NOT EXISTS game_sessions (
        id INTEGER PRIMARY KEY, map_id INTEGER NOT NULL REFERENCES maps(id)
    );
    CREATE TABLE IF NOT EXISTS game_session_maps (
        session_id INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
        map_id INTEGER NOT NULL REFERENCES maps(id),
        PRIMARY KEY (session_id, map_id)
    );
    CREATE TABLE IF NOT EXISTS game_rounds (
        id INTEGER PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
        map_id INTEGER REFERENCES maps(id)
    );
"""


@pytest.mark.asyncio
async def test_deleting_a_map_used_in_games_cleans_up_everything(client, seeded_db, auth_header):
    db = seeded_db
    await db.execute("PRAGMA foreign_keys = ON")
    await db.executescript(EXTRA_SCHEMA)
    await db.executescript("""
        INSERT INTO maps (id, name, map_type, household_id) VALUES
          (1, 'Garden', 'outdoor', 1), (2, 'Balcony', 'outdoor', 1);
        INSERT INTO plants (id, name, household_id, map_id, map_x, map_y) VALUES (5, 'Rose', 1, 1, 10, 10);
        INSERT INTO plant_placements (plant_id, map_id, map_x, map_y) VALUES (5, 1, 1, 1);
        INSERT INTO zones (id, map_id) VALUES (1, 1);
        INSERT INTO objects (id, map_id) VALUES (1, 1);
        INSERT INTO garden_features (map_id, feature_type) VALUES (1, 'pond');
        INSERT INTO dismissed_recommendations (map_id, species_id) VALUES (1, 3);
        -- a game on this map alone, and one that also used the balcony
        INSERT INTO game_sessions (id, map_id) VALUES (10, 1), (11, 1);
        INSERT INTO game_session_maps (session_id, map_id) VALUES (10, 1), (11, 1), (11, 2);
        INSERT INTO game_rounds (id, session_id, map_id) VALUES (100, 10, 1), (101, 11, 1);
    """)
    await db.commit()

    response = await client.delete("/api/maps/1", headers=auth_header)

    assert response.status_code == 200, response.text
    assert await db.execute_fetchall("SELECT id FROM maps WHERE id = 1") == []
    plant = await db.execute_fetchall("SELECT map_id FROM plants WHERE id = 5")
    assert plant[0]["map_id"] is None
    for table in ("plant_placements", "zones", "objects", "garden_features", "dismissed_recommendations"):
        rows = await db.execute_fetchall(f"SELECT 1 FROM {table} WHERE map_id = 1")
        assert rows == [], table
    sessions = await db.execute_fetchall("SELECT id, map_id FROM game_sessions ORDER BY id")
    assert [dict(row) for row in sessions] == [{"id": 11, "map_id": 2}]
    rounds = await db.execute_fetchall("SELECT id, map_id FROM game_rounds ORDER BY id")
    assert [dict(row) for row in rounds] == [{"id": 101, "map_id": None}]


@pytest.mark.asyncio
async def test_soil_zone_sync_never_touches_another_maps_zone(seeded_db):
    from routers.maps import _sync_soil_zones

    db = seeded_db
    await db.executescript("""
        CREATE TABLE IF NOT EXISTS ground_zones (
            id TEXT PRIMARY KEY, map_id INTEGER NOT NULL, name TEXT,
            zone_type TEXT, polygon TEXT, soil_note TEXT
        );
        INSERT INTO ground_zones (id, map_id, name, zone_type, polygon)
        VALUES ('zone_1_111', 99, 'Their bed', 'soil', '[]'),
               ('zone_2_222', 7, 'Removed bed', 'soil', '[]');
        INSERT INTO plants (id, name, household_id, ground_zone_id) VALUES (8, 'Tulip', 1, 'zone_2_222');
    """)
    zones = [
        # Reuses a public garden's zone id: must not rename or move theirs.
        {"id": "zone_1_111", "type": "soil", "label": "Defaced", "x": 0, "y": 0, "width": 5, "height": 5},
        {"id": "zone_3_333", "type": "soil", "label": "New bed", "x": 1, "y": 1, "width": 2, "height": 2},
        {"id": "zone_4_444", "type": "soil", "label": "Broken"},  # malformed: skipped, no 500
    ]

    await _sync_soil_zones(db, 7, zones)

    rows = {r["id"]: dict(r) for r in await db.execute_fetchall("SELECT * FROM ground_zones")}
    assert rows["zone_1_111"]["name"] == "Their bed"
    assert rows["zone_1_111"]["map_id"] == 99
    assert rows["zone_3_333"]["map_id"] == 7
    assert "zone_2_222" not in rows  # removed in the editor
    assert "zone_4_444" not in rows
    plant = await db.execute_fetchall("SELECT ground_zone_id FROM plants WHERE id = 8")
    assert plant[0]["ground_zone_id"] is None


class _FakeStorage:
    def put(self, key, data, content_type):
        return f"https://cdn.test/{key}"


async def _full_map_table(db):
    for column in (
        "slug TEXT", "svg_file TEXT", "viewbox TEXT", "scale_info TEXT", "sort_order INTEGER",
        "canvas_data TEXT", "lat REAL", "lon REAL", "bearing REAL", "thumbnail_file TEXT",
        "streek_slug TEXT", "streek_source TEXT", "is_public BOOLEAN", "photos_public BOOLEAN",
        "place_name TEXT", "country_code TEXT",
    ):
        await db.execute(f"ALTER TABLE maps ADD COLUMN {column}")
    await db.executescript("""
        CREATE TABLE IF NOT EXISTS ground_zones (
            id TEXT PRIMARY KEY, map_id INTEGER NOT NULL, name TEXT,
            zone_type TEXT, polygon TEXT, soil_note TEXT
        );
        INSERT INTO maps (id, name, map_type, slug, household_id, svg_file, viewbox, sort_order,
                          bearing, streek_source, is_public, photos_public)
        VALUES (7, 'Garden', 'outdoor', 'garden', 1, 'maps/garden.svg', '0 0 680 680', 1,
                0, 'auto', 0, 0);
        INSERT INTO ground_zones (id, map_id, name, zone_type, polygon)
        VALUES ('zone_old', 7, 'Old bed', 'soil', '[]');
    """)
    await db.commit()


@pytest.mark.asyncio
async def test_a_malformed_zone_does_not_fail_the_layout_save(client, seeded_db, auth_header, monkeypatch):
    import json
    import routers.maps as maps_router

    monkeypatch.setattr(maps_router, "build_storage_from_env", lambda: _FakeStorage())
    await _full_map_table(seeded_db)
    canvas = json.dumps({"zones": [{"id": "broken", "type": "soil"}]})

    response = await client.put("/api/maps/7", json={"canvas_data": canvas}, headers=auth_header)

    assert response.status_code == 200, response.text
    saved = await seeded_db.execute_fetchall("SELECT canvas_data FROM maps WHERE id = 7")
    assert saved[0]["canvas_data"] == canvas


@pytest.mark.asyncio
async def test_zone_sync_rolls_back_with_a_failed_map_update(client, seeded_db, auth_header, monkeypatch):
    """The sync deletes zones and unassigns plants; if the map row itself then
    fails to save, those deletions must not stick."""
    import json
    import routers.maps as maps_router

    monkeypatch.setattr(maps_router, "build_storage_from_env", lambda: _FakeStorage())
    await _full_map_table(seeded_db)
    await seeded_db.execute(
        "CREATE TRIGGER refuse_map_update BEFORE UPDATE ON maps "
        "BEGIN SELECT RAISE(ABORT, 'map update refused'); END"
    )
    await seeded_db.commit()
    canvas = json.dumps({"zones": []})  # removing every bed

    with pytest.raises(Exception):
        await client.put("/api/maps/7", json={"canvas_data": canvas}, headers=auth_header)

    zones = await seeded_db.execute_fetchall("SELECT id FROM ground_zones WHERE map_id = 7")
    assert [row["id"] for row in zones] == ["zone_old"]
