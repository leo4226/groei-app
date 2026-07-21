"""Set growth habit + mature height on plant_species from the curated snapshot.

Joins data/plant_habits.json to plant_species by *scientific name* (genus +
species, so cultivars still match). For each match sets habit + mature_height_cm.
Species not in the list keep both NULL (unknown) — the recommender treats
unknown size as "fits anywhere" (never hidden, never penalised). Mirrors
scripts/resolve_moth_plants.py / resolve_soil_ph.py / resolve_growth_form.py.

Idempotent. Reports coverage. Run after deploy (migration 0057 adds the
columns) and whenever the catalog grows.

Usage:
  cd backend && python -m scripts.resolve_plant_habits [--dry-run]
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

SNAPSHOT = Path(__file__).parent.parent / "data" / "plant_habits.json"
_VALID_HABITS = {
    "tree", "large_shrub", "shrub", "climber",
    "perennial", "grass", "groundcover", "bulb", "annual",
}


def sci_key(name: str) -> str:
    """Normalise a scientific name to 'genus species' (lowercase, no accents)."""
    s = unicodedata.normalize("NFKD", name or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    tokens = re.findall(r"[a-z]+", s)
    return " ".join(tokens[:2])


async def resolve(dry_run: bool = False) -> dict:
    snap = json.loads(SNAPSHOT.read_text(encoding="utf-8"))["plants"]
    by_sci: dict[str, dict] = {}
    for p in snap:
        habit = (p.get("habit") or "").strip().lower()
        if habit in _VALID_HABITS:
            by_sci.setdefault(sci_key(p["scientific_name"]), {"habit": habit, "height": p.get("height_cm")})

    async with get_db() as db:
        rows = await db.execute_fetchall(
            "SELECT id, latin_name FROM plant_species WHERE latin_name IS NOT NULL"
        )
        matched = 0
        for r in rows:
            m = by_sci.get(sci_key(r["latin_name"]))
            if not m:
                continue
            matched += 1
            if not dry_run:
                height = int(m["height"]) if isinstance(m["height"], (int, float)) else None
                await db.execute(
                    "UPDATE plant_species SET habit = ?, mature_height_cm = ? WHERE id = ?",
                    (m["habit"], height, r["id"]),
                )
        if not dry_run:
            await db.commit()

        total = len(rows)
        return {
            "catalog_species": total,
            "curated_list_size": len(by_sci),
            "habit_flagged": matched,
            "match_pct": round(100 * matched / total, 1) if total else 0.0,
        }


async def _main(dry_run: bool) -> None:
    await init_pool()
    try:
        stats = await resolve(dry_run=dry_run)
    finally:
        await close_pool()
    print(("[dry-run] " if dry_run else "") + "Plant-habit enrichment:")
    for k, v in stats.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    asyncio.run(_main(args.dry_run))
