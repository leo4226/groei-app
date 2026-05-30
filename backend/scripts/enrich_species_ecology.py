#!/usr/bin/env python3
"""Backfill ecology data for all plant_species rows not yet enriched.

Walks `plant_species WHERE ecology_enriched_at IS NULL` and calls
`ensure_ecology()` per row — the same code path the live endpoint uses,
so there is no drift risk between batch and on-demand enrichment.

Rate-limited at ~4 species/second to be courteous to GBIF and DeepSeek.
~1500 species ≈ 6 minutes; LLM cost ≈ $0.10.

Usage:
    cd backend
    python scripts/enrich_species_ecology.py                  # process all
    python scripts/enrich_species_ecology.py --limit 50       # first 50
    python scripts/enrich_species_ecology.py --dry-run        # log, no writes
    python scripts/enrich_species_ecology.py --only-failed    # retry data_source='failed' rows
    python scripts/enrich_species_ecology.py --only-missing-sun  # fill only NULL sun_preference
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

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


_INTER_REQUEST_DELAY_S = 0.25  # ~4 species/s — well within GBIF + DeepSeek limits


async def backfill_sun_only(limit: int | None, dry_run: bool) -> None:
    """Surgically fill `sun_preference` for rows that are missing it.

    Species enriched before the `sun_preference` column existed have a non-null
    `ecology_enriched_at` and a NULL `sun_preference`, so the normal enrichment
    pass (which only touches `ecology_enriched_at IS NULL`) skips them. This mode
    targets exactly those rows and asks the LLM *only* for sun_preference, writing
    just that one column — every other ecology field is left untouched (no GBIF
    re-derivation, no risk of overwriting curated data). Idempotent: re-running
    only revisits rows that are still NULL.
    """
    from database import init_pool, close_pool, get_db
    from services.ecology_enrichment import _from_llm

    await init_pool()
    try:
        async with get_db() as db:
            rows = await db.execute_fetchall(
                "SELECT id, latin_name FROM plant_species "
                "WHERE sun_preference IS NULL AND latin_name IS NOT NULL "
                "ORDER BY id"
            )

        target = rows[:limit] if limit else rows
        logger.info("%d species missing sun_preference (limit=%s, dry_run=%s)",
                    len(target), limit, dry_run)

        stats = {"filled": 0, "no_answer": 0, "errors": 0}

        for i, row in enumerate(target):
            if (i + 1) % 25 == 0 or i == 0:
                logger.info("Progress: %d/%d  (filled=%d, no_answer=%d, errors=%d)",
                            i + 1, len(target),
                            stats["filled"], stats["no_answer"], stats["errors"])

            if dry_run:
                logger.info("  [dry-run] would query sun_preference for %s (id=%d)",
                            row["latin_name"], row["id"])
                await asyncio.sleep(_INTER_REQUEST_DELAY_S)
                continue

            try:
                data = await _from_llm(row["latin_name"])
            except Exception as exc:
                logger.warning("  ✗ %s (id=%d): %s", row["latin_name"], row["id"], exc)
                stats["errors"] += 1
                await asyncio.sleep(_INTER_REQUEST_DELAY_S)
                continue

            sun = data.get("sun_preference")
            if sun is None:
                stats["no_answer"] += 1
            else:
                async with get_db() as db:
                    await db.execute(
                        "UPDATE plant_species SET sun_preference = ? WHERE id = ?",
                        (sun, row["id"]),
                    )
                    await db.commit()
                stats["filled"] += 1
                if stats["filled"] <= 10 or stats["filled"] % 100 == 0:
                    logger.info("  ✓ %s → %s", row["latin_name"], sun)

            await asyncio.sleep(_INTER_REQUEST_DELAY_S)

        logger.info("Done. %s", stats)
        if stats["no_answer"] > 0 or stats["errors"] > 0:
            logger.info("%d rows still NULL (LLM unsure or errored) — safe to re-run.",
                        stats["no_answer"] + stats["errors"])
    finally:
        await close_pool()


async def main(limit: int | None, only_failed: bool, dry_run: bool) -> None:
    from database import init_pool, close_pool, get_db
    from services.ecology_enrichment import ensure_ecology

    await init_pool()
    try:
        async with get_db() as db:
            if only_failed:
                rows = await db.execute_fetchall(
                    "SELECT id, latin_name FROM plant_species "
                    "WHERE ecology_data_source = ? "
                    "ORDER BY id",
                    ("failed",),
                )
            else:
                rows = await db.execute_fetchall(
                    "SELECT id, latin_name FROM plant_species "
                    "WHERE ecology_enriched_at IS NULL "
                    "ORDER BY id"
                )

        target = rows[:limit] if limit else rows
        logger.info("%d species to enrich (limit=%s, only_failed=%s, dry_run=%s)",
                    len(target), limit, only_failed, dry_run)

        stats = {"enriched": 0, "failed": 0, "errors": 0}

        for i, row in enumerate(target):
            if (i + 1) % 25 == 0 or i == 0:
                logger.info("Progress: %d/%d  (enriched=%d, failed=%d, errors=%d)",
                            i + 1, len(target),
                            stats["enriched"], stats["failed"], stats["errors"])

            if dry_run:
                logger.info("  [dry-run] would enrich %s (id=%d)", row["latin_name"], row["id"])
                await asyncio.sleep(_INTER_REQUEST_DELAY_S)
                continue

            try:
                # ensure_ecology only re-enriches when ecology_enriched_at IS NULL.
                # For --only-failed we need to clear it first so the call actually fires.
                if only_failed:
                    async with get_db() as db:
                        await db.execute(
                            "UPDATE plant_species SET ecology_enriched_at = NULL WHERE id = ?",
                            (row["id"],),
                        )
                        await db.commit()

                async with get_db() as db:
                    profile = await ensure_ecology(db, row["id"])
            except Exception as exc:
                logger.warning("  ✗ %s (id=%d): %s", row["latin_name"], row["id"], exc)
                stats["errors"] += 1
                await asyncio.sleep(_INTER_REQUEST_DELAY_S)
                continue

            if profile is None:
                logger.warning("  ? %s (id=%d) vanished", row["latin_name"], row["id"])
                stats["errors"] += 1
            elif profile["data_source"] == "failed":
                stats["failed"] += 1
            else:
                stats["enriched"] += 1
                if stats["enriched"] <= 10 or stats["enriched"] % 100 == 0:
                    logger.info("  ✓ %s: source=%s score=%s native=%s",
                                row["latin_name"], profile["data_source"],
                                profile["score"], profile["native_to_nl"])

            await asyncio.sleep(_INTER_REQUEST_DELAY_S)

        logger.info("Done. %s", stats)
        if stats["errors"] > 0 or stats["failed"] > 0:
            logger.info("Re-run with --only-failed to retry the %d failed rows.",
                        stats["failed"] + stats["errors"])
    finally:
        await close_pool()


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--limit", type=int, default=None, help="Process at most N rows")
    p.add_argument("--only-failed", action="store_true",
                   help="Retry rows where ecology_data_source = 'failed'")
    p.add_argument("--dry-run", action="store_true",
                   help="Log what would be enriched, write nothing")
    p.add_argument("--only-missing-sun", action="store_true",
                   help="Fill only NULL sun_preference (writes just that column)")
    args = p.parse_args()
    if args.only_missing_sun:
        asyncio.run(backfill_sun_only(limit=args.limit, dry_run=args.dry_run))
    else:
        asyncio.run(main(limit=args.limit, only_failed=args.only_failed, dry_run=args.dry_run))
