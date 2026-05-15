"""Seed data for local development.

   Leon & Lisbeth's garden — test users, locations, map, zones,
   ground zones, plants, and objects. All INSERT OR IGNORE, so
   safe to re-run against any database."""


async def apply(db):
    # ── Users ──
    await db.execute("INSERT OR IGNORE INTO users (id, name, avatar) VALUES (1, 'Leon', '🧑‍💻')")
    await db.execute("INSERT OR IGNORE INTO users (id, name, avatar) VALUES (2, 'Lisbeth', '🌸')")

    # ── Locations ──
    await db.execute("INSERT OR IGNORE INTO locations (id, name, icon, sort_order) VALUES (1, 'Tuin', '🌿', 0)")
    await db.execute("INSERT OR IGNORE INTO locations (id, name, icon, sort_order) VALUES (2, 'Huis', '🏠', 1)")

    # ── Garden map ──
    await db.execute("""
        INSERT OR IGNORE INTO maps (id, name, slug, svg_file, viewbox, scale_info, sort_order)
        VALUES (1, 'Garden', 'garden', 'garden_background.svg', '0 0 680 680',
                '{"px_per_meter": 46, "origin_x": 162, "origin_y": 54}', 0)
    """)

    # ── Ground zones ──
    for gz in [
        ('middle_bed', 1, 'Plantbed', 'earth',
         '[[162,306],[438,306],[438,557],[351,557],[305,511],[162,511]]',
         'Licht zure, goed doorlatende grond'),
        ('left_soil_strip', 1, 'Raised strip', 'raised_bed',
         '[[162,306],[178,306],[178,511],[162,511]]', None),
    ]:
        await db.execute(
            "INSERT OR IGNORE INTO ground_zones (id, map_id, name, zone_type, polygon, soil_note) VALUES (?,?,?,?,?,?)",
            gz)

    # ── Zones ──
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
            "INSERT OR IGNORE INTO zones (id, map_id, name, zone_type, sun_exposure, boundary, color, sort_order) VALUES (?,?,?,?,?,?,?,?)",
            z)

    # ── Test plants ──
    existing = await db.execute_fetchall("SELECT id FROM plants LIMIT 1")
    if not existing:
        for name, species, map_id, mx, my in [
            ("Lombok peppers", "Capsicum annuum", 1, 300.0, 110.0),
            ("Basil", "Ocimum basilicum", 1, 250.0, 250.0),
            ("Monstera", "Monstera deliciosa", 1, 350.0, 480.0),
            ("Tomatoes", "Solanum lycopersicum", 1, 380.0, 300.0),
        ]:
            cursor = await db.execute(
                "INSERT INTO plants (name, species, map_id, map_x, map_y, is_active) VALUES (?, ?, ?, ?, ?, 1)",
                (name, species, map_id, mx, my))
            pid = cursor.lastrowid
            await db.execute(
                "INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due, is_active) VALUES (?, 'water', 3, date('now', '-1 day'), 1)",
                (pid,))

    # ── Test objects ──
    existing_objects = await db.execute_fetchall("SELECT id FROM objects LIMIT 1")
    if not existing_objects:
        for name, otype, shape, diam, w, d, mat, color, map_id, mx, my, rot in [
            ("Terracotta pot", "pot", "circle", 40, None, None, "terracotta", "#B7654B", 1, 280.0, 200.0, 0),
            ("Raised bed", "raised_bed", "rectangle", None, 200, 80, "wood", "#8B5A30", 1, 350.0, 300.0, 0),
            ("Square planter", "pot", "square", None, 30, None, "plastic", "#888888", 1, 220.0, 150.0, 0),
        ]:
            await db.execute(
                "INSERT INTO objects (name, object_type, shape, diameter_cm, width_cm, depth_cm, material, color, map_id, map_x, map_y, rotation, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
                (name, otype, shape, diam, w, d, mat, color, map_id, mx, my, rot))

    await db.commit()
