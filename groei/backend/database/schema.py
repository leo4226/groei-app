"""Current schema — CREATE TABLE IF NOT EXISTS statements.

   Never add ALTER TABLE here. Those go in migrations.py."""


async def apply(db):
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

        CREATE TABLE IF NOT EXISTS ground_zones (
            id          TEXT PRIMARY KEY,
            map_id      INTEGER NOT NULL REFERENCES maps(id),
            name        TEXT NOT NULL,
            zone_type   TEXT NOT NULL,
            polygon     TEXT NOT NULL,
            soil_note   TEXT,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        );

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

        CREATE TABLE IF NOT EXISTS garden_water_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            watered_at  DATE NOT NULL,
            watered_by  INTEGER REFERENCES users(id),
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        );

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
