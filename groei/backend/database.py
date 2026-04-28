import aiosqlite
import os
from contextlib import asynccontextmanager

DB_PATH = os.path.join(os.path.dirname(__file__), "groei.db")


@asynccontextmanager
async def get_db():
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()


async def init_db():
    async with get_db() as db:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL UNIQUE,
                avatar      TEXT,
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS locations (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL,
                icon        TEXT,
                sort_order  INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS plants (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                name            TEXT NOT NULL,
                species         TEXT,
                location_id     INTEGER REFERENCES locations(id),
                photo_path      TEXT,
                acquired_date   DATE,
                pot_size_cm     INTEGER,
                last_repotted   DATE,
                notes           TEXT,
                is_active       BOOLEAN DEFAULT 1,
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS care_schedules (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                plant_id        INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
                care_type       TEXT NOT NULL,
                interval_days   INTEGER NOT NULL,
                season_adjust   TEXT,
                next_due        DATE NOT NULL,
                last_done       DATETIME,
                last_done_by    INTEGER REFERENCES users(id),
                notes           TEXT,
                is_active       BOOLEAN DEFAULT 1,
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS care_log (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                plant_id        INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
                care_type       TEXT NOT NULL,
                done_by         INTEGER NOT NULL REFERENCES users(id),
                done_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
                notes           TEXT,
                skipped         BOOLEAN DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS maps (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL,
                slug        TEXT NOT NULL UNIQUE,
                svg_file    TEXT NOT NULL,
                viewbox     TEXT NOT NULL,
                scale_info  TEXT,
                sort_order  INTEGER DEFAULT 0,
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS zones (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                map_id      INTEGER NOT NULL REFERENCES maps(id),
                name        TEXT NOT NULL,
                zone_type   TEXT NOT NULL,
                sun_exposure TEXT,
                boundary    TEXT NOT NULL,
                color       TEXT,
                sort_order  INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS objects (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                name            TEXT NOT NULL,
                object_type     TEXT NOT NULL,
                shape           TEXT NOT NULL,
                diameter_cm     INTEGER,
                width_cm        INTEGER,
                depth_cm        INTEGER,
                material        TEXT,
                color           TEXT,
                map_id          INTEGER REFERENCES maps(id),
                map_x           REAL,
                map_y           REAL,
                rotation        REAL DEFAULT 0,
                notes           TEXT,
                is_active       BOOLEAN DEFAULT 1,
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Seed users
        await db.execute(
            "INSERT OR IGNORE INTO users (id, name, avatar) VALUES (1, 'Leon', '🧑‍💻')"
        )
        await db.execute(
            "INSERT OR IGNORE INTO users (id, name, avatar) VALUES (2, 'Lisbeth', '🌸')"
        )

        # Seed locations
        for loc_id, name, icon, order in [
            (1, "Tuin", "🌿", 0),
            (2, "Huis", "🏠", 1),
        ]:
            await db.execute(
                "INSERT OR IGNORE INTO locations (id, name, icon, sort_order) VALUES (?, ?, ?, ?)",
                (loc_id, name, icon, order),
            )

        # ground_zones table
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS ground_zones (
                id          TEXT PRIMARY KEY,
                map_id      INTEGER NOT NULL REFERENCES maps(id),
                name        TEXT NOT NULL,
                zone_type   TEXT NOT NULL,
                polygon     TEXT NOT NULL,
                soil_note   TEXT,
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Add map columns to plants (idempotent)
        cols = {row[1] for row in await db.execute_fetchall("PRAGMA table_info(plants)")}
        if "map_id" not in cols:
            await db.execute("ALTER TABLE plants ADD COLUMN map_id INTEGER REFERENCES maps(id)")
        if "map_x" not in cols:
            await db.execute("ALTER TABLE plants ADD COLUMN map_x REAL")
        if "map_y" not in cols:
            await db.execute("ALTER TABLE plants ADD COLUMN map_y REAL")
        if "container_id" not in cols:
            await db.execute("ALTER TABLE plants ADD COLUMN container_id INTEGER REFERENCES objects(id)")
        if "display_radius_cm" not in cols:
            await db.execute("ALTER TABLE plants ADD COLUMN display_radius_cm INTEGER")
        if "ground_zone_id" not in cols:
            await db.execute("ALTER TABLE plants ADD COLUMN ground_zone_id TEXT REFERENCES ground_zones(id)")
        if "sun_requirement" not in cols:
            await db.execute("ALTER TABLE plants ADD COLUMN sun_requirement TEXT")
        if "plant_type" not in cols:
            await db.execute("ALTER TABLE plants ADD COLUMN plant_type TEXT")
        if "icon_key" not in cols:
            await db.execute("ALTER TABLE plants ADD COLUMN icon_key TEXT")

        # Seed garden map
        await db.execute("""
            INSERT OR IGNORE INTO maps (id, name, slug, svg_file, viewbox, scale_info, sort_order)
            VALUES (1, 'Garden', 'garden', 'garden_background.svg', '0 0 680 680',
                    '{"px_per_meter": 46, "origin_x": 162, "origin_y": 54}', 0)
        """)

        # Seed ground drop zones (extracted from SVG bed shapes)
        for gz in [
            (
                'middle_bed', 1, 'Plantbed', 'earth',
                '[[162,306],[438,306],[438,557],[351,557],[305,511],[162,511]]',
                'Licht zure, goed doorlatende grond',
            ),
            (
                'left_soil_strip', 1, 'Raised strip', 'raised_bed',
                '[[162,306],[178,306],[178,511],[162,511]]',
                None,
            ),
        ]:
            await db.execute(
                "INSERT OR IGNORE INTO ground_zones (id, map_id, name, zone_type, polygon, soil_note) VALUES (?,?,?,?,?,?)", gz)

        # Seed zones
        for z in [
            (1, 1, 'Front deck', 'deck', 'partial_shade',
             '[[162,54],[438,54],[438,123],[422,123],[321,169],[162,169]]', '#C8A96A', 0),
            (2, 1, 'Middle zone', 'soil', 'full_sun',
             '[[162,169],[321,169],[422,123],[438,123],[438,374],[162,374]]', '#9B7A3A', 1),
            (3, 1, 'Back deck', 'deck', 'partial_shade',
             '[[162,374],[438,374],[438,625],[162,625]]', '#C8A96A', 2),
            (4, 1, 'Shed area', 'structure', 'full_shade',
             '[[346,524],[438,524],[438,625],[346,625]]', '#666666', 3),
        ]:
            await db.execute(
                "INSERT OR IGNORE INTO zones (id, map_id, name, zone_type, sun_exposure, boundary, color, sort_order) VALUES (?,?,?,?,?,?,?,?)", z)

        # Seed test plants on the garden map
        existing = await db.execute_fetchall("SELECT id FROM plants LIMIT 1")
        if not existing:
            test_plants = [
                ("Lombok peppers", "Capsicum annuum", 1, 300.0, 110.0),
                ("Basil", "Ocimum basilicum", 1, 250.0, 250.0),
                ("Monstera", "Monstera deliciosa", 1, 350.0, 480.0),
                ("Tomatoes", "Solanum lycopersicum", 1, 380.0, 300.0),
            ]
            for name, species, map_id, mx, my in test_plants:
                cursor = await db.execute(
                    """INSERT INTO plants (name, species, map_id, map_x, map_y, is_active)
                       VALUES (?, ?, ?, ?, ?, 1)""",
                    (name, species, map_id, mx, my),
                )
                pid = cursor.lastrowid
                # Add a watering schedule
                await db.execute(
                    """INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due, is_active)
                       VALUES (?, 'water', 3, date('now', '-1 day'), 1)""",
                    (pid,),
                )

        # plant_species table — phenology / lifecycle data per species
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS plant_species (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                slug             TEXT UNIQUE NOT NULL,
                common_name_nl   TEXT NOT NULL,
                common_name_en   TEXT,
                latin_name       TEXT,
                phenology_json   TEXT,
                climate_zone     TEXT DEFAULT 'temperate',
                created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Add species_id FK to plants (idempotent)
        if "species_id" not in cols:
            await db.execute(
                "ALTER TABLE plants ADD COLUMN species_id INTEGER REFERENCES plant_species(id)"
            )
        if "care_thresholds" not in cols:
            await db.execute("ALTER TABLE plants ADD COLUMN care_thresholds TEXT")

        # Garden water log — tracks manual full-garden watering
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS garden_water_log (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                watered_at  DATE NOT NULL,
                watered_by  INTEGER REFERENCES users(id),
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # plant_care_cache table — drop old Perenual schema if present, create Trefle schema
        existing_cols = {row[1] for row in await db.execute_fetchall(
            "PRAGMA table_info(plant_care_cache)"
        )}
        if existing_cols and "trefle_slug" not in existing_cols:
            await db.execute("DROP TABLE IF EXISTS plant_care_cache")
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS plant_care_cache (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                scientific_name TEXT UNIQUE NOT NULL,
                trefle_slug     TEXT,
                common_name     TEXT,
                family          TEXT,
                duration        TEXT,
                leaf_retention  BOOLEAN,
                light_raw       INTEGER,
                light_label     TEXT,
                humidity_raw    INTEGER,
                precip_min_mm   INTEGER,
                precip_max_mm   INTEGER,
                bloom_months    TEXT,
                flower_colors   TEXT,
                avg_height_cm   INTEGER,
                max_height_cm   INTEGER,
                toxicity        TEXT,
                edible          BOOLEAN,
                image_url       TEXT,
                fetched_at      DATETIME NOT NULL
            );
        """)

        # Seed test objects on the garden map
        existing_objects = await db.execute_fetchall("SELECT id FROM objects LIMIT 1")
        if not existing_objects:
            test_objects = [
                ("Terracotta pot", "pot", "circle", 40, None, None, "terracotta", "#B7654B", 1, 280.0, 200.0, 0),
                ("Raised bed", "raised_bed", "rectangle", None, 200, 80, "wood", "#8B5A30", 1, 350.0, 300.0, 0),
                ("Square planter", "pot", "square", None, 30, None, "plastic", "#888888", 1, 220.0, 150.0, 0),
            ]
            for name, otype, shape, diam, w, d, mat, color, map_id, mx, my, rot in test_objects:
                await db.execute(
                    """INSERT INTO objects (name, object_type, shape, diameter_cm, width_cm, depth_cm,
                       material, color, map_id, map_x, map_y, rotation, is_active)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)""",
                    (name, otype, shape, diam, w, d, mat, color, map_id, mx, my, rot),
                )

        await db.commit()
