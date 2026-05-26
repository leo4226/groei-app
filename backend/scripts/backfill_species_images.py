#!/usr/bin/env python3
"""Fetch ONE thumbnail URL per plant_species row that doesn't already have an image.

Uses GBIF Occurrence API filtered to iNaturalist-sourced records, since those
are live observer photos (BioCLIP's training distribution) rather than herbarium
specimens or specimen sheets. Stores the URL in species_images — no local copy,
no R2 upload; the iNat CDN keeps hosting it.

Idempotent: skips species that already have at least one image row.

Usage:
    python scripts/backfill_species_images.py [--limit N] [--dry-run]
"""
import argparse
import asyncio
import logging
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

_GBIF_URL = "https://api.gbif.org/v1/occurrence/search"
_INAT_DATASET_KEY = "50c9509d-22c7-4a22-a47d-8c48425ef4a7"  # iNaturalist on GBIF
_REQUEST_DELAY_S = 1.0


async def fetch_image_url(client: httpx.AsyncClient, latin_name: str) -> str | None:
    """Return one iNat-sourced StillImage URL for the species, or None."""
    try:
        resp = await client.get(
            _GBIF_URL,
            params={
                "scientificName": latin_name,
                "mediaType": "StillImage",
                "datasetKey": _INAT_DATASET_KEY,
                "limit": 5,
            },
            timeout=15,
        )
        if resp.status_code != 200:
            return None
        for record in resp.json().get("results") or []:
            for m in record.get("media") or []:
                url = m.get("identifier") or ""
                if url.startswith("http") and m.get("type") == "StillImage":
                    return url
    except Exception as exc:
        logger.warning("GBIF fetch failed for %s: %s", latin_name, exc)
    return None


async def main(limit: int | None, dry_run: bool):
    from database import init_pool, close_pool, get_db

    await init_pool()
    try:
        async with get_db() as db:
            # Species without ANY image row yet
            rows = await db.execute_fetchall("""
                SELECT id, latin_name
                FROM plant_species ps
                WHERE NOT EXISTS (
                    SELECT 1 FROM species_images si WHERE si.species_id = ps.id
                )
                ORDER BY id
            """)

        target = rows[:limit] if limit else rows
        logger.info("%d species without an image (limit=%s, dry_run=%s)",
                    len(target), limit, dry_run)

        stats = {"added": 0, "no_image": 0, "errors": 0}

        async with httpx.AsyncClient() as client:
            for i, row in enumerate(target):
                if (i + 1) % 50 == 0:
                    logger.info("Progress: %d/%d  (added=%d, no_image=%d, errors=%d)",
                                i + 1, len(target), stats["added"], stats["no_image"], stats["errors"])

                latin = row["latin_name"]
                url = await fetch_image_url(client, latin)
                await asyncio.sleep(_REQUEST_DELAY_S)

                if not url:
                    stats["no_image"] += 1
                    continue

                if not dry_run:
                    try:
                        async with get_db() as db:
                            await db.execute(
                                """INSERT INTO species_images
                                     (species_id, url, source, is_primary)
                                   VALUES (?, ?, 'inaturalist', TRUE)""",
                                (row["id"], url),
                            )
                            # Bump images_count to keep it in sync
                            await db.execute(
                                "UPDATE plant_species SET images_count = images_count + 1 WHERE id = ?",
                                (row["id"],),
                            )
                            await db.commit()
                    except Exception as exc:
                        logger.warning("DB insert failed for %s: %s", latin, exc)
                        stats["errors"] += 1
                        continue

                stats["added"] += 1
                if stats["added"] <= 20 or stats["added"] % 100 == 0:
                    logger.info("  %s  <-  %s", latin, url[:80])

        logger.info("Done. %s", stats)
    finally:
        await close_pool()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    asyncio.run(main(args.limit, args.dry_run))
