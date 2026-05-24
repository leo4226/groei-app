#!/usr/bin/env python3
"""Download a GBIF-sourced eval set for BioCLIP into backend/data/eval/.

Usage:
    python scripts/fetch_eval_set.py --n-species 100 --photos-per-species 3
"""
import argparse
import asyncio
import logging
import sys
import uuid
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

_EVAL_DIR = Path(__file__).resolve().parent.parent / "data" / "eval"
_GBIF_URL = "https://api.gbif.org/v1/occurrence/search"
_REQUEST_DELAY_S = 1.0


def extract_image_urls(gbif_response: dict, limit: int) -> list[str]:
    """Pull up to `limit` image URLs from a GBIF Occurrence-Search response.

    GBIF shape:
        {"results": [{"key": ..., "media": [{"type": "StillImage", "identifier": "https://..."}]}, ...]}

    Picks one image per record (the first StillImage with an http identifier),
    then stops at `limit`. Records without StillImage media are skipped.
    """
    urls: list[str] = []
    for record in gbif_response.get("results") or []:
        media = record.get("media") or []
        for m in media:
            url = m.get("identifier") or ""
            if url.startswith("http") and m.get("type") == "StillImage":
                urls.append(url)
                break  # one image per record
        if len(urls) >= limit:
            break
    return urls[:limit]


async def fetch_species_images(client: httpx.AsyncClient, latin_name: str, limit: int) -> list[str]:
    """Fetch up to `limit` StillImage URLs from GBIF for a species; returns [] on any failure."""
    try:
        resp = await client.get(
            _GBIF_URL,
            params={"scientificName": latin_name, "mediaType": "StillImage", "limit": max(20, limit * 4)},
            timeout=15,
        )
        if resp.status_code != 200:
            logger.warning("GBIF %s for %s", resp.status_code, latin_name)
            return []
        return extract_image_urls(resp.json(), limit)
    except Exception as exc:
        logger.warning("GBIF fetch failed for %s: %s", latin_name, exc)
        return []


async def download_image(client: httpx.AsyncClient, url: str, dest: Path) -> bool:
    """Download a single image to `dest`; returns True on success, False on any failure.

    A response < 1 KB is treated as a placeholder or error page and rejected.
    """
    try:
        resp = await client.get(url, timeout=20, follow_redirects=True)
        if resp.status_code != 200 or len(resp.content) < 1024:  # <1 KB → likely placeholder/error page
            return False
        dest.write_bytes(resp.content)
        return True
    except Exception as exc:
        logger.warning("Image download failed for %s: %s", url, exc)
        return False


async def main(n_species: int, photos_per_species: int):
    from database import init_pool, close_pool, get_db

    await init_pool()
    try:
        async with get_db() as db:
            rows = await db.execute_fetchall(
                "SELECT id, latin_name FROM plant_species "
                "WHERE latin_name IS NOT NULL AND latin_name != '' "
                "ORDER BY random() LIMIT $1",
                (n_species,),
            )
        species = [(r["id"], r["latin_name"]) for r in rows]
        logger.info("Sampling %d species", len(species))

        _EVAL_DIR.mkdir(parents=True, exist_ok=True)

        stats = {"fetched": 0, "skipped": 0, "no_images": 0, "photos": 0}

        async with httpx.AsyncClient() as client:
            for sid, name in species:
                species_dir = _EVAL_DIR / str(sid)
                existing = list(species_dir.glob("gbif_*.jpg")) if species_dir.exists() else []
                if len(existing) >= photos_per_species:
                    stats["skipped"] += 1
                    continue

                urls = await fetch_species_images(client, name, photos_per_species)
                await asyncio.sleep(_REQUEST_DELAY_S)
                if not urls:
                    stats["no_images"] += 1
                    continue

                species_dir.mkdir(exist_ok=True)
                saved_for_this_species = 0
                for url in urls:
                    dest = species_dir / f"gbif_{uuid.uuid4().hex}.jpg"
                    if await download_image(client, url, dest):
                        saved_for_this_species += 1
                if saved_for_this_species > 0:
                    stats["fetched"] += 1
                    stats["photos"] += saved_for_this_species
                else:
                    stats["no_images"] += 1

        logger.info("Done. %s", stats)
    finally:
        await close_pool()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--n-species", type=int, default=100)
    p.add_argument("--photos-per-species", type=int, default=3)
    args = p.parse_args()
    asyncio.run(main(args.n_species, args.photos_per_species))
