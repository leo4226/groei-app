"""Set growth-form flags on plant_species from the curated snapshot.

Joins data/growth_form_plants.json to plant_species by *scientific name* (genus
+ species, so cultivars still match). For each match sets is_woody = TRUE
(form 'woody', carbon proxy) or is_ground_cover = TRUE (form 'groundcover').
Species not in the list keep both flags NULL (unknown) — never flipped to
FALSE, so absence of curation never counts against a plant. Mirrors
scripts/resolve_moth_plants.py / resolve_soil_ph.py.

Idempotent. Reports coverage. Run after deploy (migration 0055 adds the
columns) and whenever the catalog grows.

Usage:
  cd backend && python -m scripts.resolve_growth_form [--dry-run]
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

SNAPSHOT = Path(__file__).parent.parent / "data" / "growth_form_plants.json"


def sci_key(name: str) -> str:
    """Normalise a scientific name to 'genus species' (lowercase, no accents)."""
    s = unicodedata.normalize("NFKD", name or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    tokens = re.findall(r"[a-z]+", s)
    return " ".join(tokens[:2])


async def resolve(dry_run: bool = False) -> dict:
    snap = json.loads(SNAPSHOT.read_text(encoding="utf-8"))["plants"]
    woody: set[str] = set()
    ground: set[str] = set()
    for p in snap:
        form = (p.get("form") or "").strip().lower()
        if form == "woody":
            woody.add(sci_key(p["scientific_name"]))
        elif form == "groundcover":
            ground.add(sci_key(p["scientific_name"]))

    async with get_db() as db:
        rows = await db.execute_fetchall(
            "SELECT id, latin_name FROM plant_species WHERE latin_name IS NOT NULL"
        )
        woody_set = ground_set = 0
        for r in rows:
            key = sci_key(r["latin_name"])
            is_woody = key in woody
            is_ground = key in ground
            if not (is_woody or is_ground):
                continue
            if is_woody:
                woody_set += 1
            if is_ground:
                ground_set += 1
            if not dry_run:
                await db.execute(
                    "UPDATE plant_species SET is_woody = ?, is_ground_cover = ? WHERE id = ?",
                    (True if is_woody else None, True if is_ground else None, r["id"]),
                )
        if not dry_run:
            await db.commit()

        total = len(rows)
        matched = woody_set + ground_set
        return {
            "catalog_species": total,
            "curated_list_size": len(woody) + len(ground),
            "woody_flagged": woody_set,
            "ground_cover_flagged": ground_set,
            "match_pct": round(100 * matched / total, 1) if total else 0.0,
        }


async def _main(dry_run: bool) -> None:
    await init_pool()
    try:
        stats = await resolve(dry_run=dry_run)
    finally:
        await close_pool()
    print(("[dry-run] " if dry_run else "") + "Growth-form enrichment:")
    for k, v in stats.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    asyncio.run(_main(args.dry_run))
