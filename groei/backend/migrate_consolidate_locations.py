"""
Migration: Consolidate locations to just Tuin and Huis.
Safe to re-run (idempotent).
"""

import sqlite3, os, sys

# Force UTF-8 output on Windows
sys.stdout.reconfigure(encoding='utf-8')

DB_PATH = os.path.join(os.path.dirname(__file__), "floreren.db")
OUTDOOR_KEYWORDS = ["tuin", "balkon", "terras", "buiten", "kas", "moestuin"]

def is_outdoor(name: str) -> bool:
    return any(k in name.lower() for k in OUTDOOR_KEYWORDS)

def run():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    # Clean up any previous partial run
    cur.execute("DELETE FROM locations WHERE name IN ('_Tuin_tmp', '_Huis_tmp')")
    con.commit()

    # Fetch current non-final locations
    cur.execute("SELECT id, name FROM locations WHERE id NOT IN (1,2) ORDER BY id")
    old_locs = cur.fetchall()

    if old_locs:
        print("Old locations to consolidate:")
        for loc in old_locs:
            print(f"  id={loc['id']}  name={loc['name']}")

        # Ensure Tuin (1) and Huis (2) exist
        cur.execute("INSERT OR IGNORE INTO locations (id, name, icon, sort_order) VALUES (1, 'Tuin', '🌿', 0)")
        cur.execute("INSERT OR IGNORE INTO locations (id, name, icon, sort_order) VALUES (2, 'Huis', '🏠', 1)")
        # Update names/icons in case they were seeded differently
        cur.execute("UPDATE locations SET name='Tuin', icon='🌿', sort_order=0 WHERE id=1")
        cur.execute("UPDATE locations SET name='Huis', icon='🏠', sort_order=1 WHERE id=2")
        con.commit()

        # Move plants from old locations to 1 or 2
        for loc in old_locs:
            target_id = 1 if is_outdoor(loc['name']) else 2
            target_name = "Tuin" if target_id == 1 else "Huis"
            cur.execute("UPDATE plants SET location_id=? WHERE location_id=?", (target_id, loc['id']))
            print(f"  Moved {cur.rowcount} plant(s) from '{loc['name']}' -> {target_name}")

        # Delete old locations
        for loc in old_locs:
            cur.execute("DELETE FROM locations WHERE id=?", (loc['id'],))

        con.commit()
    else:
        print("No old locations to consolidate (already done or empty).")

    # Also fix any plants still pointing to tmp ids from a previous run
    cur.execute("UPDATE plants SET location_id=1 WHERE location_id=90")
    cur.execute("UPDATE plants SET location_id=2 WHERE location_id=91")
    con.commit()

    # Verify
    cur.execute("SELECT id, name, icon FROM locations ORDER BY id")
    print("\nFinal locations:")
    for loc in cur.fetchall():
        print(f"  id={loc['id']}  {loc['name']}")

    cur.execute("""
        SELECT l.name as loc_name, COUNT(p.id) as cnt
        FROM plants p
        LEFT JOIN locations l ON p.location_id = l.id
        GROUP BY p.location_id
    """)
    print("\nPlant counts per location:")
    for row in cur.fetchall():
        print(f"  {row['loc_name']}: {row['cnt']} plants")

    con.close()
    print("\nDone.")

if __name__ == "__main__":
    run()