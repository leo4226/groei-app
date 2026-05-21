"""Migrate plants.care_thresholds (old format) → plants.care_profile (new format).

For each plant:
1. Start with species defaults (if available)
2. Overlay plant-specific care_thresholds
3. Detect active care_types from care_schedules
4. Write combined result into care_profile

Usage:
  python -m scripts.migrate_care_thresholds [--dry-run]
"""

import json
import sqlite3
import sys
from pathlib import Path

DB = Path(__file__).parent.parent / "data" / "floreren.db"


def migrate(dry_run: bool = False):
    if not DB.exists():
        print(f"Database not found: {DB}")
        sys.exit(1)

    conn = sqlite3.connect(str(DB))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Check required columns
    cursor.execute("PRAGMA table_info(plants)")
    cols = [c["name"] for c in cursor.fetchall()]
    if "care_profile" not in cols or "care_thresholds" not in cols:
        print("Required columns (care_profile, care_thresholds) not found — skipping")
        conn.close()
        return

    cursor.execute(
        """SELECT p.id, p.name, p.care_thresholds, p.species_id,
                  ps.species_care_defaults
           FROM plants p
           LEFT JOIN plant_species ps ON ps.id = p.species_id
           WHERE p.care_profile IS NULL AND p.is_active = 1"""
    )
    plants = cursor.fetchall()
    print(f"Found {len(plants)} plants without care_profile")

    migrated = 0
    for plant in plants:
        # Start with species defaults
        species_defaults = plant["species_care_defaults"]
        profile = json.loads(species_defaults) if species_defaults else {}

        # Overlay plant-specific care_thresholds
        thresholds_raw = plant["care_thresholds"]
        thresholds = json.loads(thresholds_raw) if thresholds_raw else {}

        for care_type, cfg in thresholds.items():
            if isinstance(cfg, dict):
                profile.setdefault(care_type, {})
                profile[care_type].update(
                    {k: v for k, v in cfg.items() if v is not None}
                )
                profile[care_type]["active"] = cfg.get("enabled", True)

        # Detect active types from schedules
        cursor.execute(
            "SELECT DISTINCT care_type FROM care_schedules WHERE plant_id = ? AND is_active = 1",
            (plant["id"],),
        )
        scheduled_types = [r["care_type"] for r in cursor.fetchall()]
        for ct in scheduled_types:
            profile.setdefault(ct, {})
            profile[ct]["active"] = True

        if not profile:
            print(f"  [SKIP] {plant['name']} — no care data found")
            continue

        if not dry_run:
            cursor.execute(
                "UPDATE plants SET care_profile = ? WHERE id = ?",
                (json.dumps(profile), plant["id"]),
            )
        migrated += 1
        print(f"  {'[DRY]' if dry_run else '[OK]'} {plant['name']} — {len(profile)} care types")

    if not dry_run:
        conn.commit()
        print(f"Committed {migrated} migrations")
    else:
        print(f"Dry-run: {migrated} would be migrated")

    conn.close()


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    migrate(dry_run=dry)
