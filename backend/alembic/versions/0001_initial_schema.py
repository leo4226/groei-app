"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-20
"""
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE households (
            id          SERIAL PRIMARY KEY,
            name        TEXT NOT NULL,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    op.execute("""
        CREATE TABLE users (
            id              SERIAL PRIMARY KEY,
            name            TEXT NOT NULL UNIQUE,
            avatar          TEXT,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            household_id    INTEGER REFERENCES households(id),
            language        TEXT DEFAULT 'nl'
        )
    """)

    op.execute("""
        CREATE TABLE locations (
            id              SERIAL PRIMARY KEY,
            name            TEXT NOT NULL,
            icon            TEXT,
            sort_order      INTEGER DEFAULT 0,
            household_id    INTEGER REFERENCES households(id)
        )
    """)

    op.execute("""
        CREATE TABLE maps (
            id              SERIAL PRIMARY KEY,
            name            TEXT NOT NULL,
            slug            TEXT NOT NULL UNIQUE,
            svg_file        TEXT NOT NULL,
            viewbox         TEXT NOT NULL,
            scale_info      TEXT,
            sort_order      INTEGER DEFAULT 0,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            canvas_data     TEXT,
            map_type        TEXT DEFAULT 'outdoor',
            lat             DOUBLE PRECISION,
            lon             DOUBLE PRECISION,
            bearing         DOUBLE PRECISION DEFAULT 0,
            thumbnail_file  TEXT,
            household_id    INTEGER REFERENCES households(id)
        )
    """)

    op.execute("""
        CREATE TABLE plant_species (
            id               SERIAL PRIMARY KEY,
            slug             TEXT UNIQUE NOT NULL,
            common_name_nl   TEXT NOT NULL,
            common_name_en   TEXT,
            latin_name       TEXT,
            phenology_json   TEXT,
            climate_zone     TEXT DEFAULT 'temperate',
            created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            care_thresholds  TEXT,
            water_interval_days INTEGER
        )
    """)

    op.execute("""
        CREATE TABLE zones (
            id           SERIAL PRIMARY KEY,
            map_id       INTEGER NOT NULL REFERENCES maps(id),
            name         TEXT NOT NULL,
            zone_type    TEXT NOT NULL,
            sun_exposure TEXT,
            boundary     TEXT NOT NULL,
            color        TEXT,
            sort_order   INTEGER DEFAULT 0
        )
    """)

    op.execute("""
        CREATE TABLE objects (
            id              SERIAL PRIMARY KEY,
            name            TEXT NOT NULL,
            object_type     TEXT NOT NULL,
            shape           TEXT NOT NULL,
            diameter_cm     INTEGER,
            width_cm        INTEGER,
            depth_cm        INTEGER,
            material        TEXT,
            color           TEXT,
            map_id          INTEGER REFERENCES maps(id),
            map_x           DOUBLE PRECISION,
            map_y           DOUBLE PRECISION,
            rotation        DOUBLE PRECISION DEFAULT 0,
            notes           TEXT,
            is_active       BOOLEAN DEFAULT TRUE,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            category        TEXT NOT NULL DEFAULT 'container',
            label           TEXT,
            preset          TEXT
        )
    """)

    op.execute("""
        CREATE TABLE ground_zones (
            id          TEXT PRIMARY KEY,
            map_id      INTEGER NOT NULL REFERENCES maps(id),
            name        TEXT NOT NULL,
            zone_type   TEXT NOT NULL,
            polygon     TEXT NOT NULL,
            soil_note   TEXT,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    op.execute("""
        CREATE TABLE plants (
            id                  SERIAL PRIMARY KEY,
            name                TEXT NOT NULL,
            species             TEXT,
            location_id         INTEGER REFERENCES locations(id),
            photo_path          TEXT,
            acquired_date       DATE,
            pot_size_cm         INTEGER,
            last_repotted       DATE,
            notes               TEXT,
            phase               TEXT DEFAULT 'established',
            sown_date           TEXT,
            is_active           BOOLEAN DEFAULT TRUE,
            created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            map_id              INTEGER REFERENCES maps(id),
            map_x               DOUBLE PRECISION,
            map_y               DOUBLE PRECISION,
            container_id        INTEGER REFERENCES objects(id),
            display_radius_cm   INTEGER,
            ground_zone_id      TEXT REFERENCES ground_zones(id),
            sun_requirement     TEXT,
            plant_type          TEXT,
            icon_key            TEXT,
            species_id          INTEGER REFERENCES plant_species(id),
            care_thresholds     TEXT,
            care_profile        TEXT,
            household_id        INTEGER REFERENCES households(id)
        )
    """)

    op.execute("""
        CREATE TABLE care_schedules (
            id              SERIAL PRIMARY KEY,
            plant_id        INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
            care_type       TEXT NOT NULL,
            interval_days   INTEGER NOT NULL,
            season_adjust   TEXT,
            next_due        DATE NOT NULL,
            last_done       TIMESTAMP,
            last_done_by    INTEGER REFERENCES users(id),
            notes           TEXT,
            is_active       BOOLEAN DEFAULT TRUE,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_ephemeral    INTEGER DEFAULT 0
        )
    """)

    op.execute("""
        CREATE TABLE care_log (
            id          SERIAL PRIMARY KEY,
            plant_id    INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
            care_type   TEXT NOT NULL,
            done_by     INTEGER NOT NULL REFERENCES users(id),
            done_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            notes       TEXT,
            skipped     BOOLEAN DEFAULT FALSE
        )
    """)

    op.execute("""
        CREATE TABLE garden_water_log (
            id          SERIAL PRIMARY KEY,
            watered_at  DATE NOT NULL,
            watered_by  INTEGER REFERENCES users(id),
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    op.execute("""
        CREATE TABLE garden_fertilize_log (
            id              SERIAL PRIMARY KEY,
            fertilized_at   DATE NOT NULL,
            fertilized_by   INTEGER REFERENCES users(id),
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    op.execute("""
        CREATE TABLE plant_care_cache (
            id              SERIAL PRIMARY KEY,
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
            fetched_at      TIMESTAMP NOT NULL
        )
    """)

    op.execute("""
        CREATE TABLE weed_species (
            id               SERIAL PRIMARY KEY,
            slug             TEXT UNIQUE NOT NULL,
            common_name_nl   TEXT NOT NULL,
            latin_name       TEXT NOT NULL,
            family           TEXT,
            common_names     TEXT,
            appearance_json  TEXT,
            habitat_json     TEXT,
            removal_json     TEXT,
            edible           BOOLEAN DEFAULT FALSE,
            edible_note      TEXT,
            interesting      TEXT,
            native_to_nl     BOOLEAN DEFAULT TRUE,
            created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    op.execute("""
        CREATE TABLE weed_sightings (
            id          SERIAL PRIMARY KEY,
            weed_id     INTEGER NOT NULL REFERENCES weed_species(id),
            map_id      INTEGER NOT NULL REFERENCES maps(id),
            map_x       DOUBLE PRECISION NOT NULL,
            map_y       DOUBLE PRECISION NOT NULL,
            notes       TEXT,
            sighted_at  DATE NOT NULL DEFAULT CURRENT_DATE,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    op.execute("""
        CREATE TABLE accounts (
            id              SERIAL PRIMARY KEY,
            household_id    INTEGER NOT NULL REFERENCES households(id),
            email           TEXT NOT NULL UNIQUE,
            name            TEXT NOT NULL,
            password_hash   TEXT NOT NULL,
            avatar          TEXT,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)


def downgrade() -> None:
    raise NotImplementedError("Drop the database and re-run upgrade instead.")
