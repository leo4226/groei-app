#!/usr/bin/env python3
"""Add curated Dutch consumer plants to the plant_species catalog.

Reads the list from scripts/dutch_consumer_plants.py, looks each species up in
GBIF for canonical name + family + genus + taxon key, INSERTs into plant_species
with the same shape as the existing 88% of rows (GBIF-batch pattern).

Idempotent: skips species whose slug already exists. Re-run safely after
editing the curated list to add only the new entries.

After this finishes, the existing backfill scripts pick up the new rows:
  python scripts/backfill_dutch_names.py    # fills Dutch common names
  python scripts/backfill_english_names.py  # fills English common names

And to make the new species identifiable by BioCLIP:
  (on the GPU box) python scripts/precompute_embeddings.py

Usage:
    python scripts/add_dutch_plants.py [--limit N] [--dry-run]
"""
import argparse
import asyncio
import logging
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import httpx

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

_GBIF_MATCH_URL = "https://api.gbif.org/v1/species/match"
_REQUEST_DELAY_S = 0.5  # courteous pacing; no auth needed


def _make_slug(canonical_name: str) -> str:
    """slug like 'monstera-deliciosa' — lowercased, ASCII-only, hyphen-separated."""
    s = canonical_name.lower()
    s = re.sub(r"['\"\.×x ]+", "-", s).strip("-")
    s = re.sub(r"[^a-z0-9\-]+", "", s)
    s = re.sub(r"-+", "-", s)
    return s.strip("-")


async def gbif_match(client: httpx.AsyncClient, latin_name: str) -> dict | None:
    """Return GBIF taxonomic info for a species name, or None if no match."""
    try:
        resp = await client.get(
            _GBIF_MATCH_URL,
            params={"name": latin_name, "verbose": "false", "strict": "false"},
            timeout=15,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
    except Exception as exc:
        logger.warning("GBIF lookup failed for %s: %s", latin_name, exc)
        return None

    # matchType: EXACT | FUZZY | HIGHERRANK | NONE
    if data.get("matchType") in (None, "NONE"):
        return None
    # Only accept SPECIES-level matches (HIGHERRANK means GBIF only knows the genus)
    if data.get("rank") != "SPECIES":
        return None
    return {
        "canonical_name": data.get("canonicalName") or latin_name,
        "scientific_name": data.get("scientificName") or latin_name,
        "family": data.get("family"),
        "genus": data.get("genus"),
        "gbif_taxon_key": data.get("usageKey"),
    }


async def main(limit: int | None, dry_run: bool):
    from database import init_pool, close_pool, get_db
    from scripts.dutch_consumer_plants import all_plants

    plants = all_plants()
    if limit:
        plants = plants[:limit]

    await init_pool()
    try:
        logger.info("Curated list: %d plants. dry_run=%s", len(plants), dry_run)

        # Pre-filter: skip plants whose slug already exists
        async with get_db() as db:
            existing_slugs = await db.execute_fetchall("SELECT slug FROM plant_species")
        slug_set = {r["slug"] for r in existing_slugs}

        new_plants = []
        already_in_db = 0
        for category, latin in plants:
            slug = _make_slug(latin)
            if slug in slug_set:
                already_in_db += 1
                continue
            new_plants.append((category, latin, slug))

        logger.info("Already in DB by slug: %d. New to add: %d.", already_in_db, len(new_plants))

        stats = {"inserted": 0, "no_gbif_match": 0, "errors": 0}

        async with httpx.AsyncClient() as client:
            for i, (category, latin, slug) in enumerate(new_plants):
                if (i + 1) % 25 == 0:
                    logger.info("Progress: %d/%d  (inserted=%d, no_match=%d, errors=%d)",
                                i + 1, len(new_plants), stats["inserted"], stats["no_gbif_match"], stats["errors"])

                info = await gbif_match(client, latin)
                await asyncio.sleep(_REQUEST_DELAY_S)

                if info is None:
                    stats["no_gbif_match"] += 1
                    logger.info("  no GBIF species match: %s", latin)
                    continue

                # Use GBIF's canonical name (handles slight name corrections like
                # "Phaseolus vulgaris L." -> "Phaseolus vulgaris", and authority cleanup).
                canonical = info["canonical_name"]
                final_slug = _make_slug(canonical)
                if final_slug in slug_set:
                    # GBIF redirected our name to one already in DB — skip
                    already_in_db += 1
                    continue

                if not dry_run:
                    async with get_db() as db:
                        await db.execute(
                            """INSERT INTO plant_species
                                 (slug, common_name_nl, common_name_en, latin_name,
                                  family, genus, gbif_taxon_key, images_count, climate_zone)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                               ON CONFLICT (slug) DO NOTHING""",
                            (
                                final_slug,
                                canonical,             # common_name_nl placeholder (Latin) — backfill script fixes this
                                None,                  # common_name_en — backfill script fixes this
                                canonical,
                                info["family"],
                                info["genus"],
                                info["gbif_taxon_key"],
                                0,
                                "temperate",
                            ),
                        )
                        await db.commit()
                    slug_set.add(final_slug)

                stats["inserted"] += 1
                if stats["inserted"] <= 30 or stats["inserted"] % 50 == 0:
                    logger.info("  [%s] %s  (family=%s, gbif=%s)",
                                category, canonical, info["family"], info["gbif_taxon_key"])

        logger.info("Done. %s  (already_in_db_by_slug=%d)", stats, already_in_db)
        logger.info("Next steps:")
        logger.info("  python scripts/backfill_dutch_names.py     # populate NL names")
        logger.info("  python scripts/backfill_english_names.py   # populate EN names")
        logger.info("  (on GPU box) python scripts/precompute_embeddings.py   # make BioCLIP recognise new species")
    finally:
        await close_pool()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    asyncio.run(main(args.limit, args.dry_run))
