"""Backfill species_care_defaults from plant_species.care_thresholds + plant_care_cache.

Reads existing species data and produces a full profile_json in the new care-profile shape.
Run after schema migration but before the plant-level migration.

Usage:
  python -m scripts.backfill_species_defaults [--dry-run]
"""

import json
import sqlite3
import sys
from pathlib import Path

DB = Path(__file__).parent.parent / "data" / "floreren.db"


def get_defaults_for_species(cursor, species_id: int) -> dict | None:
    """Read care_thresholds and plant_care_cache for a species, merge into profile_json."""

    # 1. species-level care_thresholds
    cursor.execute(
        "SELECT care_thresholds FROM plant_species WHERE id = ?",
        (species_id,),
    )
    row = cursor.fetchone()
    if not row:
        return None

    raw = row[0]
    defaults = json.loads(raw) if raw and raw != "null" else {}

    # 2. plant_care_cache — pick most common schedule per care_type
    cursor.execute(
        """SELECT care_type, interval_days, season
           FROM plant_care_cache
           WHERE species_id = ?
           ORDER BY care_type""",
        (species_id,),
    )
    rows = cursor.fetchall()

    # Build care_profile shape
    profile: dict[str, dict] = {}
    for r in rows:
        care_type, interval_days, season = r
        profile[care_type] = {
            "active": True,
            "interval_days": interval_days,
            "season": season or "all",
        }

    # Overlay with species care_thresholds (old format)
    if "water" in defaults:
        profile.setdefault("water", {})["interval_days"] = defaults["water"].get(
            "interval_days", 7
        )
        profile["water"]["active"] = defaults["water"].get("enabled", True)
    if "fertilize" in defaults:
        profile.setdefault("fertilize", {})["active"] = defaults["fertilize"].get(
            "enabled", True
        )

    return profile if profile else None


def backfill(dry_run: bool = False):
    if not DB.exists():
        print(f"Database not found: {DB}")
        sys.exit(1)

    conn = sqlite3.connect(str(DB))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Check if column exists
    cursor.execute("PRAGMA table_info(plant_species)")
    cols = [c["name"] for c in cursor.fetchall()]
    if "species_care_defaults" not in cols:
        print("Column 'species_care_defaults' not found in plant_species — skipping")
        conn.close()
        return

    cursor.execute("SELECT id, scientific_name FROM plant_species WHERE species_care_defaults IS NULL")
    to_fill = cursor.fetchall()
    print(f"Found {len(to_fill)} species without defaults")

    filled = 0
    for row in to_fill:
        profile = get_defaults_for_species(cursor, row["id"])
        if profile:
            if not dry_run:
                cursor.execute(
                    "UPDATE plant_species SET species_care_defaults = ? WHERE id = ?",
                    (json.dumps(profile), row["id"]),
                )
            filled += 1
            print(f"  {'[DRY]' if dry_run else '[OK]'} {row['scientific_name']} — {len(profile)} care types")

    if not dry_run:
        conn.commit()
        print(f"Committed {filled} updates")
    else:
        print(f"Dry-run: {filled} would be updated")

    conn.close()


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    backfill(dry_run=dry)
