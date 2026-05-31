#!/usr/bin/env python3
"""Backfill real Dutch common names for plant_species rows where common_name_nl
was populated as the Latin name placeholder.

86% of GBIF-imported species rows have common_name_nl == latin_name, which makes
the identify UI show the Latin name (useless for Dutch users). This script asks
Deepseek for the real Dutch name per species; if no common Dutch name exists,
sets the column to NULL so the frontend can fall back cleanly.

Idempotent: skips rows whose NL name has already been backfilled (NL != Latin).

Usage:
    python scripts/backfill_dutch_names.py [--limit N] [--dry-run]
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

from llm_config import LLM_API_KEY, LLM_CHAT_URL, LLM_MODEL
_REQUEST_DELAY_S = 0.3  # courteous pacing; the provider tolerates this fine

_PROMPT = """Wat is de gangbare Nederlandse naam voor de plantsoort "{latin_name}"?

Antwoord met ALLEEN de Nederlandse naam, zonder uitleg, zonder aanhalingstekens, zonder Latijnse naam erbij.
Als er geen gebruikelijke Nederlandse naam bestaat voor deze plant, antwoord dan exact met: -

Voorbeelden:
  Monstera deliciosa -> Gatenplant
  Pyrus communis -> Peer
  Quercus robur -> Zomereik
  Vanda nana -> -
  Brassia signata -> -
"""


class _ApiError(Exception):
    """Distinguishes API/network failures from a confirmed 'no Dutch name' response."""


async def get_dutch_name(client: httpx.AsyncClient, latin_name: str, max_retries: int = 4) -> str | None:
    """Ask Deepseek for the Dutch common name.

    Returns:
        str: the Dutch name on success.
        None: Deepseek confidently said no common Dutch name exists ("-").

    Raises:
        _ApiError: on network failure, timeout, 5xx, or unparseable response.
        Caller should LEAVE THE EXISTING PLACEHOLDER in the DB — a retry on
        the next run can succeed without losing the original info.
    """
    backoff = 2.0  # seconds, doubles each retry
    for attempt in range(1, max_retries + 1):
        try:
            resp = await client.post(
                LLM_CHAT_URL,
                headers={
                    "Authorization": f"Bearer {LLM_API_KEY}",
                    "content-type": "application/json",
                },
                json={
                    "model": LLM_MODEL,
                    "max_tokens": 50,
                    "messages": [{"role": "user", "content": _PROMPT.format(latin_name=latin_name)}],
                },
                timeout=30,
            )
        except Exception as exc:
            if attempt < max_retries:
                logger.info("retry %d/%d after network error for %s: %s",
                            attempt, max_retries, latin_name, exc)
                await asyncio.sleep(backoff)
                backoff *= 2
                continue
            raise _ApiError(f"network: {exc}") from exc

        if resp.status_code == 503 or resp.status_code == 429:
            if attempt < max_retries:
                await asyncio.sleep(backoff)
                backoff *= 2
                continue
            raise _ApiError(f"{resp.status_code} after {max_retries} retries")
        if resp.status_code != 200:
            raise _ApiError(f"{resp.status_code}: {resp.text[:100]}")

        text = resp.json()["choices"][0]["message"]["content"].strip()
        text = text.strip(" \t\n\"'")
        if text == "-":
            return None  # confirmed: no Dutch name
        if not text or text.lower() == latin_name.lower():
            # Empty or just-Latin reply — treat as API noise, not confirmed
            raise _ApiError(f"degenerate response: {text!r}")
        return text

    raise _ApiError("exhausted retries")


async def main(limit: int | None, dry_run: bool):
    if not LLM_API_KEY:
        logger.error("OPENROUTER_API_KEY not set")
        sys.exit(1)

    from database import init_pool, close_pool, get_db

    await init_pool()
    try:
        async with get_db() as db:
            rows = await db.execute_fetchall(
                "SELECT id, latin_name FROM plant_species "
                "WHERE LOWER(common_name_nl) = LOWER(latin_name) "
                "ORDER BY id"
            )

        target = rows[:limit] if limit else rows
        logger.info("%d species to backfill (limit=%s, dry_run=%s)",
                    len(target), limit, dry_run)

        stats = {"updated": 0, "no_dutch_name": 0, "errors": 0}

        async with httpx.AsyncClient() as client:
            for i, row in enumerate(target):
                if (i + 1) % 50 == 0:
                    logger.info("Progress: %d/%d  (updated=%d, no_dutch=%d, errors=%d)",
                                i + 1, len(target), stats["updated"], stats["no_dutch_name"], stats["errors"])

                latin = row["latin_name"]
                try:
                    dutch = await get_dutch_name(client, latin)
                except _ApiError as exc:
                    # Leave the row alone — placeholder stays, retry on next run
                    logger.warning("skip %s (will retry next run): %s", latin, exc)
                    stats["errors"] += 1
                    await asyncio.sleep(_REQUEST_DELAY_S)
                    continue
                await asyncio.sleep(_REQUEST_DELAY_S)

                if dutch is None:
                    # CONFIRMED no Dutch name. Leave the Latin-placeholder in place
                    # (column is NOT NULL on this table; no clean "absent" sentinel).
                    # Frontend will fall through to latin_name display since NL == Latin.
                    # Trade-off: re-runs will re-query Deepseek for these rows (~$0.002/run);
                    # negligible vs. an alembic migration to relax the constraint.
                    stats["no_dutch_name"] += 1
                    continue

                stats["updated"] += 1
                if stats["updated"] <= 20 or stats["updated"] % 100 == 0:
                    logger.info("  %s -> %s", latin, dutch)

                if not dry_run:
                    async with get_db() as db:
                        await db.execute(
                            "UPDATE plant_species SET common_name_nl = ?, "
                            "updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                            (dutch, row["id"]),
                        )
                        await db.commit()

        logger.info("Done. %s", stats)
        if stats["errors"] > 0:
            logger.info("Re-run the script to retry the %d skipped rows.", stats["errors"])
    finally:
        await close_pool()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--limit", type=int, default=None,
                   help="Process at most N species (default: all)")
    p.add_argument("--dry-run", action="store_true",
                   help="Don't write to DB; just print what would happen")
    args = p.parse_args()
    asyncio.run(main(args.limit, args.dry_run))
