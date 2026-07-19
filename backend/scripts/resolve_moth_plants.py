"""Flag night-flowering / moth-forage plants in plant_species.

Joins data/moth_plants.json (curated night-flowering / moth-nectar list) to
plant_species by *scientific name* (genus + species, so cultivars like
"Nicotiana alata 'Lime Green'" still match "Nicotiana alata"). For each match
it sets is_moth_plant = TRUE. Species not in the list keep is_moth_plant NULL
(unknown) — never flipped to FALSE, so absence of curation never counts against
a plant. Companion signal, mirrors scripts/resolve_bloeibogen.py.

Idempotent. Reports coverage. Run after deploy (migration 0053 adds the column)
and whenever the catalog grows.

Usage:
  cd backend && python -m scripts.resolve_moth_plants [--dry-run]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import unicodedata
from pathlib import Path

if os.path.dirname(__file__).endswith("scripts"):
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
else:
    sys.path.insert(0, ".")

from database import init_pool, close_pool, get_db

SNAPSHOT = Path(__file__).parent.parent / "data" / "moth_plants.json"


def sci_key(name: str) -> str:
    """Normalise a scientific name to 'genus species' (lowercase, no accents)."""
    s = unicodedata.normalize("NFKD", name or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    tokens = re.findall(r"[a-z]+", s)
    return " ".join(tokens[:2])


async def resolve(dry_run: bool = False) -> dict:
    snap = json.loads(SNAPSHOT.read_text(encoding="utf-8"))["plants"]
    keys = {sci_key(p["scientific_name"]) for p in snap}

    async with get_db() as db:
        rows = await db.execute_fetchall(
            "SELECT id, latin_name FROM plant_species WHERE latin_name IS NOT NULL"
        )
        flagged = 0
        for r in rows:
            if sci_key(r["latin_name"]) not in keys:
                continue
            flagged += 1
            if not dry_run:
                await db.execute(
                    "UPDATE plant_species SET is_moth_plant = ? WHERE id = ?", (True, r["id"])
                )
        if not dry_run:
            await db.commit()

        total = len(rows)
        return {
            "catalog_species": total,
            "curated_list_size": len(keys),
            "moth_plant_flagged": flagged,
            "match_pct": round(100 * flagged / total, 1) if total else 0.0,
        }


async def _main(dry_run: bool) -> None:
    await init_pool()
    try:
        stats = await resolve(dry_run=dry_run)
    finally:
        await close_pool()
    print(("[dry-run] " if dry_run else "") + "Moth-plant enrichment:")
    for k, v in stats.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    asyncio.run(_main(args.dry_run))
