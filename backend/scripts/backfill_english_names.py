#!/usr/bin/env python3
"""Backfill English common names for plant_species rows where common_name_en is empty.

Strategy: ask Deepseek for an English name, preferring the specific species name when
one exists, but FALLING BACK to a recognizable genus/family-level term when no
species-level common name is in use. For most consumers, "Orchid" is more useful
than "Phalaenopsis fimbriata" — so when the specific species has no common name,
we accept "Orchid" / "Maple" / "Juniper" / "Hyacinth" / etc.

Only returns "-" when NO recognizable English term exists at any taxonomic level.

Idempotent: skips rows that already have a non-empty common_name_en.

Usage:
    python scripts/backfill_english_names.py [--limit N] [--dry-run]
"""
import argparse
import asyncio
import logging
import os
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

DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY") or ""
DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"
_REQUEST_DELAY_S = 0.3

_PROMPT = """What is a recognizable ENGLISH common name for the plant species "{latin_name}"?

Rules:
1. Prefer the SPECIFIC English name if one exists ("Swiss cheese plant" for Monstera deliciosa).
2. If no specific name exists, fall back to a recognizable GENUS-level name ("Orchid" for Phalaenopsis fimbriata, "Maple" for Acer mandshuricum, "Juniper" for Juniperus brevifolia).
3. ONLY answer "-" if NO English term is recognizable at any level (extremely rare for plants).

Respond with ONLY the name, no explanation, no Latin, no quotes.

Examples:
  Monstera deliciosa -> Swiss cheese plant
  Hyacinthus orientalis -> Hyacinth
  Phalaenopsis fimbriata -> Orchid
  Acer mandshuricum -> Maple
  Juniperus brevifolia -> Juniper
  Vanda nana -> Orchid
  Cattleya manglesii -> Orchid
"""


class _ApiError(Exception):
    """Distinguishes API/network failures from a confirmed 'no English name' response."""


async def get_english_name(client: httpx.AsyncClient, latin_name: str, max_retries: int = 4) -> str | None:
    """Returns the English name (specific or genus-level), None if confirmed absent, raises on API error."""
    backoff = 2.0
    for attempt in range(1, max_retries + 1):
        try:
            resp = await client.post(
                DEEPSEEK_URL,
                headers={
                    "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                    "content-type": "application/json",
                },
                json={
                    "model": "deepseek-chat",
                    "max_tokens": 50,
                    "messages": [{"role": "user", "content": _PROMPT.format(latin_name=latin_name)}],
                },
                timeout=30,
            )
        except Exception as exc:
            if attempt < max_retries:
                await asyncio.sleep(backoff)
                backoff *= 2
                continue
            raise _ApiError(f"network: {exc}") from exc

        if resp.status_code in (503, 429):
            if attempt < max_retries:
                await asyncio.sleep(backoff)
                backoff *= 2
                continue
            raise _ApiError(f"{resp.status_code} after {max_retries} retries")
        if resp.status_code != 200:
            raise _ApiError(f"{resp.status_code}: {resp.text[:100]}")

        text = resp.json()["choices"][0]["message"]["content"].strip()
        text = text.strip(" \t\n\"'.")
        if text == "-":
            return None
        if not text or text.lower() == latin_name.lower():
            raise _ApiError(f"degenerate response: {text!r}")
        # Reject responses that just echo the Latin genus
        # (e.g. "Phalaenopsis" for "Phalaenopsis fimbriata" — the prompt asks for English)
        genus = latin_name.split(" ", 1)[0]
        if text.lower() == genus.lower():
            raise _ApiError(f"genus echo: {text!r}")
        return text

    raise _ApiError("exhausted retries")


async def main(limit: int | None, dry_run: bool):
    if not DEEPSEEK_API_KEY:
        logger.error("DEEPSEEK_API_KEY not set")
        sys.exit(1)

    from database import init_pool, close_pool, get_db

    await init_pool()
    try:
        async with get_db() as db:
            rows = await db.execute_fetchall(
                "SELECT id, latin_name FROM plant_species "
                "WHERE common_name_en IS NULL OR common_name_en = '' "
                "ORDER BY id"
            )

        target = rows[:limit] if limit else rows
        logger.info("%d species to backfill with English names (limit=%s, dry_run=%s)",
                    len(target), limit, dry_run)

        stats = {"updated": 0, "no_english_name": 0, "errors": 0}

        async with httpx.AsyncClient() as client:
            for i, row in enumerate(target):
                if (i + 1) % 50 == 0:
                    logger.info("Progress: %d/%d  (updated=%d, no_en=%d, errors=%d)",
                                i + 1, len(target), stats["updated"], stats["no_english_name"], stats["errors"])

                latin = row["latin_name"]
                try:
                    english = await get_english_name(client, latin)
                except _ApiError as exc:
                    logger.warning("skip %s (will retry next run): %s", latin, exc)
                    stats["errors"] += 1
                    await asyncio.sleep(_REQUEST_DELAY_S)
                    continue
                await asyncio.sleep(_REQUEST_DELAY_S)

                if english is None:
                    # Confirmed no English name — leave NULL/empty. Frontend then falls
                    # through to Latin display, same behavior as before this script ran.
                    stats["no_english_name"] += 1
                    continue

                stats["updated"] += 1
                if stats["updated"] <= 20 or stats["updated"] % 100 == 0:
                    logger.info("  %s -> %s", latin, english)

                if not dry_run:
                    async with get_db() as db:
                        await db.execute(
                            "UPDATE plant_species SET common_name_en = ?, "
                            "updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                            (english, row["id"]),
                        )
                        await db.commit()

        logger.info("Done. %s", stats)
        if stats["errors"] > 0:
            logger.info("Re-run the script to retry the %d skipped rows.", stats["errors"])
    finally:
        await close_pool()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    asyncio.run(main(args.limit, args.dry_run))
