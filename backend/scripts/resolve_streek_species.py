"""Link streek_species (streektuinen icoonsoorten) to our plant_species catalog.

streektuinen gives Dutch common names only. To connect a streek's flora to the
scored catalog we resolve streek_species.name_nl → plant_species.id:

  1. Normalised match on plant_species.common_name_nl (lowercase, strip
     diacritics/punctuation, tolerate a trailing plural 's'/'en').
  2. GBIF fallback for the rest: Dutch name → GBIF vernacular → Latin name →
     match plant_species.latin_name.

Unresolved rows keep species_id NULL — the streek list still shows the Dutch
name; only scoring/recommendation wiring needs the link (added incrementally).

Only *flora* is resolved: fauna (bees, butterflies) are attracted by the flora,
not planted, so they're out of scope for the plantable catalog (plan Part 4).

Idempotent — only touches rows where species_id IS NULL. Run after deploy
(migration seeds the rows) whenever the plant catalog grows.

Usage:
  cd backend && python -m scripts.resolve_streek_species [--dry-run] [--no-gbif]
"""
from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
import unicodedata

if os.path.dirname(__file__).endswith("scripts"):
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
else:
    sys.path.insert(0, ".")

import httpx

from database import init_pool, close_pool, get_db

GBIF_SPECIES = "https://api.gbif.org/v1/species"


def norm(s: str) -> str:
    """Fold to a comparable key: lowercase, drop accents & non-letters."""
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z]", "", s.lower())


def norm_variants(s: str) -> set[str]:
    """Normalised key plus a couple of gentle plural/singular variants."""
    base = norm(s)
    out = {base}
    for suffix in ("en", "s"):
        if base.endswith(suffix) and len(base) > len(suffix) + 2:
            out.add(base[: -len(suffix)])
    return out


async def _load_plant_index(db) -> dict[str, int]:
    """norm(common_name_nl) → plant_species.id (first wins on collision)."""
    rows = await db.execute_fetchall(
        "SELECT id, common_name_nl FROM plant_species WHERE common_name_nl IS NOT NULL"
    )
    index: dict[str, int] = {}
    for r in rows:
        key = norm(r["common_name_nl"])
        index.setdefault(key, r["id"])
    return index


async def _load_latin_index(db) -> dict[str, int]:
    rows = await db.execute_fetchall(
        "SELECT id, latin_name FROM plant_species WHERE latin_name IS NOT NULL"
    )
    index: dict[str, int] = {}
    for r in rows:
        index.setdefault(norm(r["latin_name"]), r["id"])
    return index


async def _gbif_latin(client: httpx.AsyncClient, dutch_name: str) -> str | None:
    """Best-effort Dutch vernacular → accepted Latin name via GBIF."""
    try:
        resp = await client.get(
            f"{GBIF_SPECIES}/search",
            params={"q": dutch_name, "rank": "SPECIES", "highertaxonKey": 6, "limit": 5},
        )
        resp.raise_for_status()
        for res in resp.json().get("results", []):
            sci = res.get("canonicalName") or res.get("scientificName")
            if sci:
                return sci
    except Exception:
        return None
    return None


async def resolve(dry_run: bool = False, use_gbif: bool = True) -> dict:
    async with get_db() as db:
        by_nl = await _load_plant_index(db)
        by_latin = await _load_latin_index(db)

        todo = await db.execute_fetchall(
            "SELECT DISTINCT name_nl FROM streek_species "
            "WHERE species_id IS NULL AND category = 'flora'"
        )
        names = [r["name_nl"] for r in todo]

        resolved: dict[str, int] = {}
        for name in names:
            for key in norm_variants(name):
                if key in by_nl:
                    resolved[name] = by_nl[key]
                    break

        unresolved = [n for n in names if n not in resolved]
        gbif_hits = 0
        if use_gbif and unresolved:
            async with httpx.AsyncClient(
                timeout=15, headers={"User-Agent": "floreren.app streek resolve"}
            ) as client:
                for name in unresolved:
                    latin = await _gbif_latin(client, name)
                    if latin and norm(latin) in by_latin:
                        resolved[name] = by_latin[norm(latin)]
                        gbif_hits += 1
                    await asyncio.sleep(0.1)

        if not dry_run and resolved:
            for name, sid in resolved.items():
                await db.execute(
                    "UPDATE streek_species SET species_id = ? "
                    "WHERE name_nl = ? AND species_id IS NULL AND category = 'flora'",
                    (sid, name),
                )
            await db.commit()

        total = len(names)
        return {
            "flora_unresolved_before": total,
            "resolved_now": len(resolved),
            "via_gbif": gbif_hits,
            "still_unresolved": total - len(resolved),
            "coverage_pct": round(100 * len(resolved) / total, 1) if total else 100.0,
        }


async def _main(dry_run: bool, use_gbif: bool) -> None:
    await init_pool()
    try:
        stats = await resolve(dry_run=dry_run, use_gbif=use_gbif)
    finally:
        await close_pool()
    print(("[dry-run] " if dry_run else "") + "streek_species flora resolution:")
    for k, v in stats.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-gbif", action="store_true", help="skip the GBIF fallback")
    args = ap.parse_args()
    asyncio.run(_main(args.dry_run, use_gbif=not args.no_gbif))
