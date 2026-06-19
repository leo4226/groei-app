#!/usr/bin/env python3
"""Second-pass image backfill for species that still have no thumbnail.

backfill_species_images.py uses an iNat-only filter (live observer photos).
This catches the ~41% of species iNat doesn't cover — obscure orchids,
junipers, etc. — via a two-step fallback chain:

  1. Wikipedia page summary API — returns the article's canonical thumbnail.
     Curated, usually clean and species-typical. Best UX win.
  2. GBIF Occurrence API without the iNat filter — pulls any source including
     herbarium specimens, museum sheets, etc. Last resort.

Skips species that already have at least one species_images row.

Usage:
    python scripts/backfill_species_images_fallback.py [--limit N] [--dry-run]
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

_WIKI_SUMMARY_URL = "https://en.wikipedia.org/api/rest_v1/page/summary/"
_GBIF_URL = "https://api.gbif.org/v1/occurrence/search"
_REQUEST_DELAY_S = 0.5

_HEADERS = {
    # Wikipedia rest API asks for an identifying User-Agent
    "User-Agent": "Floreren/1.0 (https://floreren.app)",
}


async def try_wikipedia(client: httpx.AsyncClient, latin_name: str) -> tuple[str, str] | None:
    """Wikipedia article thumbnail. Returns (url, 'wikipedia') or None."""
    # URL-safe encoding: Wikipedia accepts spaces as underscores
    title = latin_name.replace(" ", "_")
    try:
        resp = await client.get(_WIKI_SUMMARY_URL + title, headers=_HEADERS, timeout=15)
        if resp.status_code != 200:
            return None
        data = resp.json()
        thumb = (data.get("thumbnail") or {}).get("source")
        if thumb and thumb.startswith("http"):
            return thumb, "wikipedia"
    except Exception as exc:
        logger.warning("Wikipedia fetch failed for %s: %s", latin_name, exc)
    return None


async def try_gbif_any_source(client: httpx.AsyncClient, latin_name: str) -> tuple[str, str] | None:
    """GBIF without dataset filter. Catches herbarium / museum images. Returns (url, 'gbif') or None."""
    try:
        resp = await client.get(
            _GBIF_URL,
            params={"scientificName": latin_name, "mediaType": "StillImage", "limit": 5},
            timeout=15,
        )
        if resp.status_code != 200:
            return None
        for record in resp.json().get("results") or []:
            for m in record.get("media") or []:
                url = m.get("identifier") or ""
                if url.startswith("http") and m.get("type") == "StillImage":
                    return url, "gbif"
    except Exception as exc:
        logger.warning("GBIF fetch failed for %s: %s", latin_name, exc)
    return None


async def main(limit: int | None, dry_run: bool):
    from database import init_pool, close_pool, get_db

    await init_pool()
    try:
        async with get_db() as db:
            rows = await db.execute_fetchall("""
                SELECT id, latin_name
                FROM plant_species ps
                WHERE NOT EXISTS (
                    SELECT 1 FROM species_images si WHERE si.species_id = ps.id
                )
                ORDER BY id
            """)

        target = rows[:limit] if limit else rows
        logger.info("%d species still missing images (limit=%s, dry_run=%s)",
                    len(target), limit, dry_run)

        stats = {"wikipedia": 0, "gbif": 0, "still_missing": 0, "errors": 0}

        async with httpx.AsyncClient() as client:
            for i, row in enumerate(target):
                if (i + 1) % 50 == 0:
                    logger.info("Progress: %d/%d  (wikipedia=%d, gbif=%d, missing=%d)",
                                i + 1, len(target), stats["wikipedia"], stats["gbif"], stats["still_missing"])

                latin = row["latin_name"]

                # Try Wikipedia first
                result = await try_wikipedia(client, latin)
                await asyncio.sleep(_REQUEST_DELAY_S)

                if not result:
                    # Fallback to GBIF
                    result = await try_gbif_any_source(client, latin)
                    await asyncio.sleep(_REQUEST_DELAY_S)

                if not result:
                    stats["still_missing"] += 1
                    continue

                url, source = result
                if not dry_run:
                    try:
                        async with get_db() as db:
                            await db.execute(
                                """INSERT INTO species_images
                                     (species_id, url, source, is_primary)
                                   VALUES (?, ?, ?, TRUE)""",
                                (row["id"], url, source),
                            )
                            await db.execute(
                                "UPDATE plant_species SET images_count = images_count + 1 WHERE id = ?",
                                (row["id"],),
                            )
                            await db.commit()
                    except Exception as exc:
                        logger.warning("DB insert failed for %s: %s", latin, exc)
                        stats["errors"] += 1
                        continue

                stats[source] += 1
                if (stats["wikipedia"] + stats["gbif"]) <= 20 or (stats["wikipedia"] + stats["gbif"]) % 100 == 0:
                    logger.info("  [%s] %s  <-  %s", source, latin, url[:80])

        logger.info("Done. %s", stats)
    finally:
        await close_pool()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    asyncio.run(main(args.limit, args.dry_run))
