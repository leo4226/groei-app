"""Household data export endpoints."""
import pytest
import pytest_asyncio


EXTRA_SCHEMA = """
    ALTER TABLE maps ADD COLUMN slug TEXT;
    ALTER TABLE maps ADD COLUMN svg_file TEXT;
    ALTER TABLE maps ADD COLUMN viewbox TEXT;
    ALTER TABLE maps ADD COLUMN scale_info TEXT;
    ALTER TABLE maps ADD COLUMN sort_order INTEGER DEFAULT 0;
    ALTER TABLE maps ADD COLUMN created_at TEXT;
    ALTER TABLE maps ADD COLUMN lat REAL;
    ALTER TABLE maps ADD COLUMN lon REAL;
    ALTER TABLE maps ADD COLUMN bearing REAL;
    ALTER TABLE maps ADD COLUMN thumbnail_file TEXT;

    CREATE TABLE objects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        object_type TEXT NOT NULL,
        shape TEXT NOT NULL,
        diameter_cm INTEGER,
        width_cm INTEGER,
        depth_cm INTEGER,
        material TEXT,
        color TEXT,
        map_id INTEGER,
        map_x REAL,
        map_y REAL,
        rotation REAL DEFAULT 0,
        notes TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT,
        updated_at TEXT,
        category TEXT DEFAULT 'container',
        label TEXT,
        preset TEXT
    );

    CREATE TABLE ground_zones (
        id TEXT PRIMARY KEY,
        map_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        zone_type TEXT NOT NULL,
        polygon TEXT NOT NULL,
        soil_note TEXT,
        created_at TEXT
    );

    CREATE TABLE plant_species (
        id INTEGER PRIMARY KEY,
        common_name_nl TEXT,
        common_name_en TEXT,
        latin_name TEXT,
        phenology_json TEXT,
        climate_zone TEXT,
        care_thresholds TEXT,
        water_interval_days INTEGER
    );

    CREATE TABLE care_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plant_id INTEGER NOT NULL,
        care_type TEXT NOT NULL,
        done_by INTEGER NOT NULL,
        done_at TEXT DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        skipped BOOLEAN DEFAULT FALSE
    );

    CREATE TABLE garden_fertilize_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fertilized_at DATE NOT NULL,
        fertilized_by INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE plant_photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plant_id INTEGER NOT NULL,
        household_id INTEGER NOT NULL,
        r2_key TEXT NOT NULL,
        url TEXT NOT NULL,
        note TEXT,
        taken_at TEXT DEFAULT CURRENT_TIMESTAMP,
        care_log_id INTEGER,
        bioclip_species_id INTEGER,
        bioclip_confidence REAL,
        species_mismatch BOOLEAN DEFAULT FALSE,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
"""


@pytest_asyncio.fixture
async def export_db(seeded_db):
    db = seeded_db
    await db.executescript(EXTRA_SCHEMA)
    await db.executescript("""
        INSERT INTO households (id, name) VALUES (2, 'Other Household');
        INSERT INTO accounts (id, household_id, email, name, password_hash)
        VALUES (2, 2, 'other@example.com', 'Other', 'x');
        INSERT INTO users (id, name, household_id, language)
        VALUES (1, 'Leon', 1, 'nl'), (2, 'Other User', 2, 'en');

        INSERT INTO locations (id, name, icon, household_id)
        VALUES (1, 'Living room', 'house', 1), (2, 'Foreign room', 'x', 2);
        INSERT INTO maps (id, name, slug, svg_file, viewbox, map_type, household_id)
        VALUES (1, 'Garden', 'garden', 'garden.svg', '0 0 100 100', 'outdoor', 1),
               (2, 'Other map', 'other-map', 'other.svg', '0 0 100 100', 'outdoor', 2);
        INSERT INTO objects (id, name, object_type, shape, map_id, category)
        VALUES (1, 'Terracotta pot', 'pot', 'circle', 1, 'container'),
               (2, 'Foreign pot', 'pot', 'circle', 2, 'container');
        INSERT INTO ground_zones (id, map_id, name, zone_type, polygon)
        VALUES ('bed-1', 1, 'Border', 'plant_bed', '[]'),
               ('bed-2', 2, 'Foreign border', 'plant_bed', '[]');
        INSERT INTO plant_species (id, common_name_nl, latin_name)
        VALUES (1, 'Gatenplant', 'Monstera deliciosa'),
               (2, 'Vreemde varen', 'Foreign fern');
        INSERT INTO plants (id, name, species, location_id, map_id, map_x, map_y,
                            container_id, ground_zone_id, species_id, household_id)
        VALUES (1, 'Monstera', 'Monstera deliciosa', 1, 1, 10, 20, 1, 'bed-1', 1, 1),
               (2, 'Foreign fern', 'Fern', 2, 2, 30, 40, 2, 'bed-2', 2, 2);
        INSERT INTO care_schedules (id, plant_id, care_type, interval_days, next_due, is_active)
        VALUES (1, 1, 'water', 7, '2026-06-14', 1),
               (2, 2, 'water', 7, '2026-06-14', 1);
        INSERT INTO care_log (id, plant_id, care_type, done_by, done_at, notes)
        VALUES (1, 1, 'water', 1, '2026-06-10T10:00:00', 'own'),
               (2, 2, 'water', 2, '2026-06-10T10:00:00', 'foreign');
        INSERT INTO garden_water_log (id, watered_at, watered_by, water_amount)
        VALUES (1, '2026-06-10', 1, 5.5),
               (2, '2026-06-10', 2, 99.9);
        INSERT INTO garden_fertilize_log (id, fertilized_at, fertilized_by)
        VALUES (1, '2026-06-01', 1),
               (2, '2026-06-01', 2);
        INSERT INTO plant_photos (id, plant_id, household_id, r2_key, url, note)
        VALUES (1, 1, 1, 'photos/1/1/a.jpg', 'https://cdn.test/a.jpg', 'own'),
               (2, 2, 2, 'photos/2/2/b.jpg', 'https://cdn.test/b.jpg', 'foreign');
    """)
    await db.commit()
    return db


@pytest.mark.asyncio
async def test_export_requires_auth(client, export_db):
    res = await client.get('/api/export')
    assert res.status_code in (401, 403)


@pytest.mark.asyncio
async def test_export_json_is_scoped_to_household(client, export_db, auth_header):
    res = await client.get('/api/export', headers=auth_header)
    assert res.status_code == 200
    body = res.json()

    assert body['household']['id'] == 1
    assert [p['name'] for p in body['plants']] == ['Monstera']
    assert [m['name'] for m in body['maps']] == ['Garden']
    assert [l['name'] for l in body['locations']] == ['Living room']
    assert [o['name'] for o in body['objects']] == ['Terracotta pot']
    assert [z['name'] for z in body['ground_zones']] == ['Border']
    assert [c['notes'] for c in body['care_log']] == ['own']
    assert [w['water_amount'] for w in body['garden_water_log']] == [5.5]
    assert [f['fertilized_by_name'] for f in body['garden_fertilize_log']] == ['Leon']
    assert [p['note'] for p in body['plant_photos']] == ['own']

    assert 'Foreign fern' not in str(body)
    assert 'Foreign pot' not in str(body)
    assert 'foreign' not in str(body)


@pytest.mark.asyncio
async def test_export_care_log_csv_is_scoped_to_household(client, export_db, auth_header):
    res = await client.get('/api/export/care-log.csv', headers=auth_header)
    assert res.status_code == 200
    assert res.headers['content-type'].startswith('text/csv')
    text = res.text
    assert 'plant_name,plant_species,care_type' in text
    assert 'Monstera' in text
    assert 'own' in text
    assert 'Foreign fern' not in text
    assert 'foreign' not in text
