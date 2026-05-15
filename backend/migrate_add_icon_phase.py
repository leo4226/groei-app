"""Add icon_requested and phase columns to the plants table.

Run: cd groei/backend && python migrate_add_icon_phase.py
Idempotent — uses ALTER TABLE via existence check.
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "floreren.db")


def column_exists(db: sqlite3.Connection, table: str, column: str) -> bool:
    cols = db.execute(f"PRAGMA table_info({table})").fetchall()
    return any(c[1] == column for c in cols)


def main():
    db = sqlite3.connect(DB_PATH)
    added = []

    if not column_exists(db, "plants", "icon_requested"):
        db.execute("ALTER TABLE plants ADD COLUMN icon_requested BOOLEAN DEFAULT 0")
        added.append("icon_requested")

    if not column_exists(db, "plants", "phase"):
        db.execute("ALTER TABLE plants ADD COLUMN phase TEXT DEFAULT 'mature'")
        added.append("phase")

    db.commit()
    db.close()

    if added:
        print(f"Added columns: {', '.join(added)}")
    else:
        print("Nothing to do — columns already exist.")


if __name__ == "__main__":
    main()