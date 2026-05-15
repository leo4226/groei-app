#!/usr/bin/env python3
"""
One-time migration: generate Claude species profiles for all existing plants
and link them via species_id.

Usage:
    cd groei/backend
    python migrate_species_backfill.py
"""
import asyncio
import sys

try:
    from dotenv import load_dotenv
    load_dotenv(override=True)
except ImportError:
    pass

from database import get_db
from species_service import get_or_create_species, get_token_usage


async def backfill():
    async with get_db() as db:
        plants = await db.execute_fetchall(
            "SELECT id, name FROM plants WHERE species_id IS NULL AND is_active = 1"
        )

    if not plants:
        print("All plants already have species_id. Nothing to do.")
        return

    print(f"Backfilling {len(plants)} plants...\n")

    for plant in plants:
        plant_id = plant["id"]
        plant_name = plant["name"]
        try:
            async with get_db() as db:
                species_id = await get_or_create_species(db, plant_name)
                await db.execute(
                    "UPDATE plants SET species_id = ? WHERE id = ?",
                    (species_id, plant_id),
                )
                await db.commit()
            print(f"  [OK] {plant_name} -> species_id={species_id}")
        except Exception as exc:
            print(f"  [FAIL] {plant_name}: {exc}", file=sys.stderr)

        await asyncio.sleep(0.5)

    usage = get_token_usage()
    total = usage["input"] + usage["output"]
    print(f"\nBackfill complete.")
    print(f"Tokens used — input: {usage['input']:,}  output: {usage['output']:,}  total: {total:,}")


if __name__ == "__main__":
    asyncio.run(backfill())
