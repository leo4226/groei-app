"""
Migrate all spatial coordinates from portrait SVG frame to landscape SVG frame.

Transform: (old_x, old_y) → (680 - old_y, old_x)
For polygon points stored as JSON arrays of [x, y] pairs.

Run ONCE after deploying the SVG + code changes (Fix 1a–1c).
Take a database backup before running.

Usage:
  cd groei/backend
  python migrate_landscape_coords.py
"""

import sqlite3
import json
import os
import shutil
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "groei.db")
H = 680  # SVG canvas height


def rotate_point(x: float, y: float) -> tuple[float, float]:
    """Apply 90° CW bake: (x,y) → (H-y, x)."""
    return (H - y, x)


def rotate_polygon(polygon_json: str) -> str:
    """Rotate a JSON array of [x,y] pairs."""
    points = json.loads(polygon_json)
    rotated = [[H - y, x] for x, y in points]
    return json.dumps(rotated)


def main():
    # Safety backup
    backup_path = DB_PATH + f".bak_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    shutil.copy2(DB_PATH, backup_path)
    print(f"Backup written to {backup_path}")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # 1. Plant positions
    cur.execute("SELECT id, map_x, map_y FROM plants WHERE map_x IS NOT NULL AND map_y IS NOT NULL")
    plants = cur.fetchall()
    for p in plants:
        new_x, new_y = rotate_point(p["map_x"], p["map_y"])
        cur.execute("UPDATE plants SET map_x = ?, map_y = ? WHERE id = ?", (new_x, new_y, p["id"]))
    print(f"Migrated {len(plants)} plant position(s).")

    # 2. Zone boundaries
    cur.execute("SELECT id, boundary FROM zones WHERE boundary IS NOT NULL")
    zones = cur.fetchall()
    for z in zones:
        new_boundary = rotate_polygon(z["boundary"])
        cur.execute("UPDATE zones SET boundary = ? WHERE id = ?", (new_boundary, z["id"]))
    print(f"Migrated {len(zones)} zone boundary/ies.")

    # 3. Ground zone polygons
    cur.execute("SELECT id, polygon FROM ground_zones WHERE polygon IS NOT NULL")
    gzones = cur.fetchall()
    for gz in gzones:
        new_polygon = rotate_polygon(gz["polygon"])
        cur.execute("UPDATE ground_zones SET polygon = ? WHERE id = ?", (new_polygon, gz["id"]))
    print(f"Migrated {len(gzones)} ground zone polygon(s).")

    # 4. Maps scale_info origin (origin_x, origin_y) and viewbox stays 0 0 680 680
    cur.execute("SELECT id, scale_info FROM maps WHERE scale_info IS NOT NULL")
    maps = cur.fetchall()
    for m in maps:
        info = json.loads(m["scale_info"])
        ox, oy = info.get("origin_x", 0), info.get("origin_y", 0)
        new_ox, new_oy = rotate_point(ox, oy)
        info["origin_x"] = new_ox
        info["origin_y"] = new_oy
        cur.execute("UPDATE maps SET scale_info = ? WHERE id = ?", (json.dumps(info), m["id"]))
    print(f"Migrated {len(maps)} map scale_info record(s).")

    conn.commit()
    conn.close()
    print("Migration complete.")


if __name__ == "__main__":
    main()
