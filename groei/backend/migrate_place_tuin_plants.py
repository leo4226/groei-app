"""
Migration: Assign random garden map positions to all Tuin plants
that currently have no map placement (map_id IS NULL).
"""

import sqlite3, os, random, sys
sys.stdout.reconfigure(encoding='utf-8')

DB_PATH = os.path.join(os.path.dirname(__file__), 'floreren.db')
TUIN_LOCATION_ID = 1

def run():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    # Get the garden map
    cur.execute("SELECT id, name, viewbox FROM maps WHERE name LIKE '%arden%' OR name LIKE '%uin%' ORDER BY id LIMIT 1")
    garden = cur.fetchone()
    if not garden:
        cur.execute("SELECT id, name, viewbox FROM maps ORDER BY id LIMIT 1")
        garden = cur.fetchone()
    if not garden:
        print("No maps found!")
        return

    map_id = garden['id']
    vb = [float(v) for v in garden['viewbox'].split()]
    vx, vy, vw, vh = vb
    pad = min(vw, vh) * 0.10   # 10% padding from edges

    print(f"Garden map: id={map_id}  viewbox={garden['viewbox']}  pad={pad:.0f}")

    # Find all active Tuin plants without a map position
    cur.execute("""
        SELECT id, name FROM plants
        WHERE location_id = ? AND is_active = 1
          AND (map_id IS NULL OR map_x IS NULL OR map_y IS NULL)
        ORDER BY id
    """, (TUIN_LOCATION_ID,))
    plants = cur.fetchall()

    if not plants:
        print("All Tuin plants already have map placements.")
        con.close()
        return

    print(f"\nPlacing {len(plants)} plants randomly on the garden map:")
    for p in plants:
        x = round(random.uniform(vx + pad, vx + vw - pad), 1)
        y = round(random.uniform(vy + pad, vy + vh - pad), 1)
        cur.execute(
            "UPDATE plants SET map_id=?, map_x=?, map_y=? WHERE id=?",
            (map_id, x, y, p['id'])
        )
        print(f"  {p['name']:<30} -> ({x}, {y})")

    con.commit()
    print(f"\nDone! {len(plants)} plants placed on map id={map_id}.")
    con.close()

if __name__ == '__main__':
    run()