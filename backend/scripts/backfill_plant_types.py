"""Backfill NULL plant_type from icon manifest cat field.

For every plant with plant_type IS NULL and icon_key IS NOT NULL,
derives plant_type from the icon manifest's cat field.

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

import asyncpg
from dotenv import load_dotenv

# Icon manifest lives in the frontend checkout at deploy time
MANIFEST_PATH = Path(__file__).parent.parent.parent / "frontend" / "public" / "icons" / "manifest.json"
# Fallback: on Fly the icons are at /app/icons/manifest.json
MANIFEST_FALLBACK = Path("/app/icons/manifest.json")


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
        # Find plants that need backfilling
        rows = await conn.fetch(
            "SELECT id, name, icon_key FROM plants WHERE plant_type IS NULL AND icon_key IS NOT NULL"
        )

        if not rows:
            print("No plants need backfilling — all good!")
            return

        print(f"\nFound {len(rows)} plants with NULL plant_type:\n")

        matched = 0
        no_match = 0
        icon_keys_seen: set[str] = set()

        for row in rows:
            icon_key = row["icon_key"]
            icon_keys_seen.add(icon_key)
            cat = icon_cats.get(icon_key)

            if cat:
                if dry_run:
                    print(f"  [DRY] #{row['id']} \"{row['name']}\"  icon={icon_key} → {cat}")
                else:
                    await conn.execute(
                        "UPDATE plants SET plant_type = $1 WHERE id = $2",
                        cat, row["id"],
                    )
                    print(f"  [OK] #{row['id']} \"{row['name']}\"  icon={icon_key} → {cat}")
                matched += 1
            else:
                print(f"  [SKIP] #{row['id']} \"{row['name']}\"  icon={icon_key}  — not in manifest")
                no_match += 1

        # Report any icon_keys not in manifest
        if no_match > 0:
            missing = icon_keys_seen - set(icon_cats)
            print(f"\n  Unmatched icon_keys: {missing}")

        if dry_run:
            print(f"\nDRY RUN: would update {matched} plants ({no_match} skipped)")
        else:
            print(f"\nDone: updated {matched} plants ({no_match} skipped)")

    finally:
        await conn.close()


if __name__ == "__main__":
    load_dotenv()
    dry = "--dry-run" in sys.argv
    asyncio.run(backfill(dry_run=dry))
