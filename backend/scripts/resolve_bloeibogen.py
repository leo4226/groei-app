"""Enrich plant_species from the Bloeibogen (Naturalis) snapshot.

Joins data/bloeibogen_plants.json to plant_species by *scientific name* (genus +
species, so cultivars like "Lavandula angustifolia 'Hidcote'" still match
"Lavandula angustifolia"). For each match:

  - sets is_drachtplant (Naturalis bee-forage flag) — always, it's authoritative;
  - fills flowering_months from Naturalis *only when ours is empty/NULL* — we
    don't clobber curated/enriched flowering data, just fill gaps.

Idempotent. Reports coverage. Run after deploy (migration 0052 adds the column)
and whenever the catalog grows. See issue #709.

Usage:
  cd backend && python -m scripts.resolve_bloeibogen [--dry-run]
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

SNAPSHOT = Path(__file__).parent.parent / "data" / "bloeibogen_plants.json"


def sci_key(name: str) -> str:
    """Normalise a scientific name to 'genus species' (lowercase, no accents)."""
    s = unicodedata.normalize("NFKD", name or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    tokens = re.findall(r"[a-z]+", s)
    return " ".join(tokens[:2])


def _coerce_months(value) -> list[int]:
    if isinstance(value, list):
        return [int(m) for m in value if isinstance(m, (int, float)) and 1 <= m <= 12]
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [int(m) for m in parsed if isinstance(m, (int, float)) and 1 <= m <= 12]
        except (json.JSONDecodeError, ValueError):
            pass
    return []


async def resolve(dry_run: bool = False) -> dict:
    snap = json.loads(SNAPSHOT.read_text(encoding="utf-8"))["plants"]
    by_sci: dict[str, dict] = {}
    for p in snap:
        by_sci.setdefault(sci_key(p["scientific_name"]), p)  # first wins

    async with get_db() as db:
        rows = await db.execute_fetchall(
            "SELECT id, latin_name, flowering_months FROM plant_species WHERE latin_name IS NOT NULL"
        )
        dracht_set = 0
        flowering_filled = 0
        for r in rows:
            match = by_sci.get(sci_key(r["latin_name"]))
            if not match:
                continue
            is_dracht = bool(match["is_drachtplant"])
            updates, params = ["is_drachtplant = ?"], [is_dracht]
            if not _coerce_months(r["flowering_months"]) and match["flowering_months"]:
                updates.append("flowering_months = ?")
                params.append(json.dumps(match["flowering_months"]))
                flowering_filled += 1
            if is_dracht:
                dracht_set += 1
            if not dry_run:
                params.append(r["id"])
                await db.execute(
                    f"UPDATE plant_species SET {', '.join(updates)} WHERE id = ?", params
                )
        if not dry_run:
            await db.commit()

        total = len(rows)
        matched = sum(1 for r in rows if sci_key(r["latin_name"]) in by_sci)
        return {
            "catalog_species": total,
            "matched_in_bloeibogen": matched,
            "drachtplant_flagged": dracht_set,
            "flowering_gaps_filled": flowering_filled,
            "match_pct": round(100 * matched / total, 1) if total else 0.0,
        }


async def _main(dry_run: bool) -> None:
    await init_pool()
    try:
        stats = await resolve(dry_run=dry_run)
    finally:
        await close_pool()
    print(("[dry-run] " if dry_run else "") + "Bloeibogen enrichment:")
    for k, v in stats.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    asyncio.run(_main(args.dry_run))
