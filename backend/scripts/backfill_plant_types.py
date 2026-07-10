"""Repair missing and form-corrupted plant_type values from icon categories.

plant_type stores a botanical category, while the potted/bare presentation is
stored in the icon manifest. This script fills missing categories and repairs the
old form values pot, ground and seedling from each icon's cat field. The ambiguous
tree value is kept when its icon also belongs to the tree category; it is repaired
only when the icon category contradicts it.

Usage:
  # Local (reads DATABASE_URL from .env):
  python scripts/backfill_plant_types.py [--dry-run]

  # On Fly.io (via SSH):
  flyctl ssh console -a floreren-api
  cd /app
  python scripts/backfill_plant_types.py [--dry-run]
"""

import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Optional

import asyncpg
from dotenv import load_dotenv

# Icon manifest lives in the frontend checkout at deploy time
MANIFEST_PATH = Path(__file__).parent.parent.parent / "frontend" / "public" / "icons" / "manifest.json"
# Fallback: on Fly the icons are at /app/icons/manifest.json
MANIFEST_FALLBACK = Path("/app/icons/manifest.json")
CORRUPTED_FORM_TYPES = frozenset(("pot", "ground", "seedling"))


def load_icon_cats() -> dict[str, str]:
    """Return {icon_id: cat} from the icon manifest."""
    path = MANIFEST_PATH if MANIFEST_PATH.exists() else MANIFEST_FALLBACK
    if not path.exists():
        print(f"Manifest not found at {MANIFEST_PATH} or {MANIFEST_FALLBACK}")
        sys.exit(1)

    manifest = json.loads(path.read_text())
    plants = manifest.get("plants", [])
    mapping = {p["id"]: p["cat"] for p in plants if "cat" in p and p["cat"]}
    print(f"Loaded {len(mapping)} icon→cat mappings from {path}")
    return mapping


def should_backfill_plant_type(plant_type: Optional[str], category: Optional[str]) -> bool:
    """Whether a manifest category can safely replace this stored plant type."""
    if not category:
        return False
    if plant_type is None or plant_type in CORRUPTED_FORM_TYPES:
        return True
    # tree was both a historical form tile and a valid botanical category.
    # Preserve a real tree; repair it only when the icon makes the mismatch clear.
    return plant_type == "tree" and category != "tree"


async def backfill(dry_run: bool = False) -> None:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("DATABASE_URL not set. Create a .env or export it.")
        sys.exit(1)

    icon_cats = load_icon_cats()
    if not icon_cats:
        print("No icon categories in manifest — nothing to backfill")
        return

    conn = await asyncpg.connect(dsn)

    try:
        # Only fetch missing categories and the old form values. Tree is included
        # because it is repairable when the manifest category contradicts it.
        rows = await conn.fetch(
            """
            SELECT id, name, icon_key, plant_type
            FROM plants
            WHERE icon_key IS NOT NULL
              AND (
                plant_type IS NULL
                OR plant_type IN ('pot', 'ground', 'seedling', 'tree')
              )
            """
        )

        if not rows:
            print("No plants need backfilling — all good!")
            return

        print(f"\nFound {len(rows)} plants with missing or suspect plant_type:\n")

        updated = 0
        no_match = 0
        kept_tree = 0
        icon_keys_seen: set[str] = set()

        for row in rows:
            icon_key = row["icon_key"]
            plant_type = row["plant_type"]
            icon_keys_seen.add(icon_key)
            category = icon_cats.get(icon_key)

            if should_backfill_plant_type(plant_type, category):
                if dry_run:
                    print(
                        f"  [DRY] #{row['id']} \"{row['name']}\"  "
                        f"icon={icon_key}  {plant_type!r} → {category}"
                    )
                else:
                    await conn.execute(
                        "UPDATE plants SET plant_type = $1 WHERE id = $2",
                        category, row["id"],
                    )
                    print(
                        f"  [OK] #{row['id']} \"{row['name']}\"  "
                        f"icon={icon_key}  {plant_type!r} → {category}"
                    )
                updated += 1
            elif category:
                # The only candidate that can already be correct is a tree row.
                print(
                    f"  [KEEP] #{row['id']} \"{row['name']}\"  "
                    f"icon={icon_key}  tree matches manifest category"
                )
                kept_tree += 1
            else:
                print(
                    f"  [SKIP] #{row['id']} \"{row['name']}\"  "
                    f"icon={icon_key}  — not in manifest"
                )
                no_match += 1

        if no_match > 0:
            missing = icon_keys_seen - set(icon_cats)
            print(f"\n  Unmatched icon_keys: {missing}")

        action = "would update" if dry_run else "updated"
        print(
            f"\n{'DRY RUN: ' if dry_run else 'Done: '}{action} {updated} plants "
            f"({kept_tree} confirmed trees, {no_match} skipped)"
        )

    finally:
        await conn.close()


if __name__ == "__main__":
    load_dotenv()
    dry = "--dry-run" in sys.argv
    asyncio.run(backfill(dry_run=dry))
