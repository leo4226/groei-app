"""Idempotent ALTER TABLE migrations.

   Each migration checks whether the column exists before adding it,
   so this is safe to run repeatedly against any existing database."""


async def apply(db):
    # ── maps: canvas_data (for map editor) ──
    map_cols = {row[1] for row in await db.execute_fetchall("PRAGMA table_info(maps)")}
    if "canvas_data" not in map_cols:
        await db.execute("ALTER TABLE maps ADD COLUMN canvas_data TEXT")
    if "map_type" not in map_cols:
        await db.execute("ALTER TABLE maps ADD COLUMN map_type TEXT DEFAULT 'outdoor'")
    if "lat" not in map_cols:
        await db.execute("ALTER TABLE maps ADD COLUMN lat REAL")
    if "lon" not in map_cols:
        await db.execute("ALTER TABLE maps ADD COLUMN lon REAL")
    if "bearing" not in map_cols:
        await db.execute("ALTER TABLE maps ADD COLUMN bearing REAL DEFAULT 0")

    # ── objects: category / label / preset ──
    obj_cols = {row[1] for row in await db.execute_fetchall("PRAGMA table_info(objects)")}
    if "category" not in obj_cols:
        await db.execute("ALTER TABLE objects ADD COLUMN category TEXT NOT NULL DEFAULT 'container'")
    if "label" not in obj_cols:
        await db.execute("ALTER TABLE objects ADD COLUMN label TEXT")
    if "preset" not in obj_cols:
        await db.execute("ALTER TABLE objects ADD COLUMN preset TEXT")

    # ── plants: map / container / ground_zone / display / sun / type / icon / species / thresholds ──
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
    if "species_id" not in cols:
        await db.execute("ALTER TABLE plants ADD COLUMN species_id INTEGER REFERENCES plant_species(id)")
    if "care_thresholds" not in cols:
        await db.execute("ALTER TABLE plants ADD COLUMN care_thresholds TEXT")

    # ── plant_species: care_thresholds ──
    sp_cols = {row[1] for row in await db.execute_fetchall("PRAGMA table_info(plant_species)")}
    if "care_thresholds" not in sp_cols:
        await db.execute("ALTER TABLE plant_species ADD COLUMN care_thresholds TEXT")

    # ── plant_care_cache: drop old Perenual schema if trefle_slug missing ──
    existing_cols = {row[1] for row in await db.execute_fetchall("PRAGMA table_info(plant_care_cache)")}
    if existing_cols and "trefle_slug" not in existing_cols:
        await db.execute("DROP TABLE IF EXISTS plant_care_cache")
        await db.commit()
        # schema.py will re-create with the correct schema on next init_db
