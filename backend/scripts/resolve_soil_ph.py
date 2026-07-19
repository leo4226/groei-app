"""Set soil-pH preference on plant_species from the curated Ellenberg snapshot.

Joins data/soil_ph_plants.json to plant_species by *scientific name* (genus +
species, so cultivars like "Hydrangea macrophylla 'Nikko Blue'" still match
"Hydrangea macrophylla"). For each match it sets soil_ph_pref = 'acid' |
'alkaline'. Species not in the list keep soil_ph_pref NULL (pH-tolerant /
unknown) — never overwritten, so absence of a preference never misleads.
Mirrors scripts/resolve_bloeibogen.py / resolve_moth_plants.py.

Idempotent. Reports coverage. Run after deploy (migration 0054 adds the
column) and whenever the catalog grows.

Usage:
  cd backend && python -m scripts.resolve_soil_ph [--dry-run]
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

SNAPSHOT = Path(__file__).parent.parent / "data" / "soil_ph_plants.json"
_VALID = {"acid", "alkaline"}


def sci_key(name: str) -> str:
    """Normalise a scientific name to 'genus species' (lowercase, no accents)."""
    s = unicodedata.normalize("NFKD", name or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    tokens = re.findall(r"[a-z]+", s)
    return " ".join(tokens[:2])


async def resolve(dry_run: bool = False) -> dict:
    snap = json.loads(SNAPSHOT.read_text(encoding="utf-8"))["plants"]
    by_sci: dict[str, str] = {}
    for p in snap:
        ph = (p.get("ph") or "").strip().lower()
        if ph in _VALID:
            by_sci.setdefault(sci_key(p["scientific_name"]), ph)  # first wins

    async with get_db() as db:
        rows = await db.execute_fetchall(
            "SELECT id, latin_name FROM plant_species WHERE latin_name IS NOT NULL"
        )
        acid = alkaline = 0
        for r in rows:
            ph = by_sci.get(sci_key(r["latin_name"]))
            if not ph:
                continue
            if ph == "acid":
                acid += 1
            else:
                alkaline += 1
            if not dry_run:
                await db.execute(
                    "UPDATE plant_species SET soil_ph_pref = ? WHERE id = ?", (ph, r["id"])
                )
        if not dry_run:
            await db.commit()

        total = len(rows)
        matched = acid + alkaline
        return {
            "catalog_species": total,
            "curated_list_size": len(by_sci),
            "acid_flagged": acid,
            "alkaline_flagged": alkaline,
            "match_pct": round(100 * matched / total, 1) if total else 0.0,
        }


async def _main(dry_run: bool) -> None:
    await init_pool()
    try:
        stats = await resolve(dry_run=dry_run)
    finally:
        await close_pool()
    print(("[dry-run] " if dry_run else "") + "Soil-pH enrichment:")
    for k, v in stats.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    asyncio.run(_main(args.dry_run))
