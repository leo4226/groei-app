#!/usr/bin/env python3
"""Backfill missing localized common names for in-use plant species.

Targets species rows that are linked from active plants and are missing either
common_name_nl or common_name_en (including Latin-name placeholders). Uses the
same species_service LLM enrichment path as plant creation/identify, so it is
safe to re-run: rows with both localized names are skipped.

Usage:
    python scripts/backfill_species_common_names.py [--limit N] [--dry-run]
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

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

from llm_config import LLM_API_KEY
from species_service import ensure_species_localized_names


def _text_or_none(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _name_hint(row: dict) -> str | None:
    return (
        _text_or_none(row.get("latin_name"))
        or _text_or_none(row.get("common_name_nl"))
        or _text_or_none(row.get("common_name_en"))
    )


async def main(limit: int | None, dry_run: bool) -> None:
    if not dry_run and not LLM_API_KEY:
        logger.error("NOUS_API_KEY / OpenRouter API key is not set")
        sys.exit(1)

    from database import close_pool, get_db, init_pool

    await init_pool()
    try:
        async with get_db() as db:
            rows = await db.execute_fetchall(
                """
                SELECT DISTINCT
                    s.id,
                    s.latin_name,
                    s.common_name_nl,
                    s.common_name_en
                FROM plants p
                JOIN plant_species s ON p.species_id = s.id
                WHERE p.is_active = 1
                  AND (
                    NULLIF(TRIM(COALESCE(s.common_name_nl, '')), '') IS NULL
                    OR NULLIF(TRIM(COALESCE(s.common_name_en, '')), '') IS NULL
                    OR LOWER(TRIM(COALESCE(s.common_name_nl, ''))) = LOWER(TRIM(COALESCE(s.latin_name, '')))
                    OR LOWER(TRIM(COALESCE(s.common_name_en, ''))) = LOWER(TRIM(COALESCE(s.latin_name, '')))
                  )
                ORDER BY s.id
                """
            )

            target = [dict(r) for r in rows]
            if limit is not None:
                target = target[:limit]

            logger.info(
                "%d in-use species need localized-name backfill (limit=%s, dry_run=%s)",
                len(target), limit, dry_run,
            )

            stats = {"processed": 0, "updated": 0, "skipped": 0, "errors": 0}
            for row in target:
                stats["processed"] += 1
                hint = _name_hint(row)
                if dry_run:
                    logger.info(
                        "would backfill species_id=%s latin=%r nl=%r en=%r",
                        row["id"], row.get("latin_name"), row.get("common_name_nl"), row.get("common_name_en"),
                    )
                    continue
                try:
                    updated = await ensure_species_localized_names(db, int(row["id"]), hint)
                except Exception as exc:  # noqa: BLE001 - CLI should continue through batch failures
                    stats["errors"] += 1
                    logger.warning("skip species_id=%s (%s): %s", row["id"], hint, exc)
                    continue
                if updated:
                    stats["updated"] += 1
                    logger.info("updated species_id=%s (%s)", row["id"], hint)
                else:
                    stats["skipped"] += 1
                    logger.info("no usable localized names returned for species_id=%s (%s)", row["id"], hint)

            logger.info("Done. %s", stats)
    finally:
        await close_pool()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    asyncio.run(main(args.limit, args.dry_run))
