#!/usr/bin/env python3
"""Repair field-journal entries that are stuck without a fun fact.

Two different faults leave an entry permanently empty, and they need
different repairs:

1. **Orphaned discoveries** — `plant_discoveries.species_id IS NULL` while the row
   does carry a `latin_name`. These were saved while `identify/commit` was
   failing silently (fixed in #882). The journal's self-healing fetch is keyed
   on `species_id`, so it skips these rows forever. Repair = relink them to the
   `plant_species` row with the same latin name.

2. **Species with no cached fact** — the entry is linked, but
   `plant_species.fun_fact_nl/_en` are empty because generation kept failing
   (the reasoning-token bug: the model answered, but the answer arrived in
   `reasoning` and the endpoint only read `content`). Repair = generate now,
   through the same code path the endpoint uses, so whatever the endpoint
   would cache is what gets written here.

Both passes are idempotent, and `--dry-run` reports without writing.

Usage:
    python scripts/repair_discovery_fun_facts.py [--dry-run] [--limit N]
    python scripts/repair_discovery_fun_facts.py --relink-only
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

_REQUEST_DELAY_S = 0.4


async def relink_orphaned_discoveries(db, dry_run: bool) -> dict:
    """Point species-less discoveries at the species matching their latin name."""
    rows = await db.execute_fetchall(
        "SELECT d.id, d.latin_name, s.id AS species_id "
        "FROM plant_discoveries d "
        "JOIN plant_species s ON lower(s.latin_name) = lower(d.latin_name) "
        "WHERE d.species_id IS NULL "
        "  AND d.latin_name IS NOT NULL AND d.latin_name != '' "
        "ORDER BY d.id"
    )
    stats = {"relinked": 0}
    for row in rows:
        logger.info(
            "discovery %s -> species %s (%s)%s",
            row["id"], row["species_id"], row["latin_name"], " [dry-run]" if dry_run else "",
        )
        if not dry_run:
            await db.execute(
                "UPDATE plant_discoveries SET species_id = ? WHERE id = ?",
                (int(row["species_id"]), int(row["id"])),
            )
        stats["relinked"] += 1

    unmatched = await db.execute_fetchall(
        "SELECT COUNT(*) AS n FROM plant_discoveries d "
        "WHERE d.species_id IS NULL "
        "  AND d.latin_name IS NOT NULL AND d.latin_name != '' "
        "  AND NOT EXISTS (SELECT 1 FROM plant_species s "
        "                  WHERE lower(s.latin_name) = lower(d.latin_name))"
    )
    stats["unmatched"] = unmatched[0]["n"] if unmatched else 0
    return stats


async def fill_missing_fun_facts(db, dry_run: bool, limit: int | None) -> dict:
    """Generate + cache facts for journal species that still have none."""
    from routers.species import _generate_fun_fact

    # Either language missing counts as incomplete: the endpoint only serves a
    # cache hit when BOTH are present, so a half-filled row still costs a
    # generation on every open.
    rows = await db.execute_fetchall(
        "SELECT DISTINCT s.id, s.latin_name, s.common_name_nl, s.fun_fact_nl, s.fun_fact_en "
        "FROM plant_species s "
        "JOIN plant_discoveries d ON d.species_id = s.id "
        "WHERE NULLIF(TRIM(COALESCE(s.fun_fact_nl, '')), '') IS NULL "
        "   OR NULLIF(TRIM(COALESCE(s.fun_fact_en, '')), '') IS NULL "
        "ORDER BY s.id"
    )
    target = rows[:limit] if limit else rows
    logger.info("%d journal species without a cached fun fact", len(target))

    stats = {"filled": 0, "failed": 0}
    for i, row in enumerate(target):
        if dry_run:
            logger.info("would generate for %s (%s) [dry-run]", row["latin_name"], row["id"])
            continue

        fresh_nl, fresh_en = await _generate_fun_fact(row["latin_name"], row["common_name_nl"])
        # Mirror the endpoint: an existing fact in one language wins over the
        # freshly generated one, so a half-filled row gains its missing language
        # rather than having both rewritten.
        nl = str(row["fun_fact_nl"] or "").strip() or fresh_nl
        en = str(row["fun_fact_en"] or "").strip() or fresh_en
        if nl and en:
            await db.execute(
                "UPDATE plant_species SET fun_fact_nl = ?, fun_fact_en = ? WHERE id = ?",
                (nl, en, int(row["id"])),
            )
            stats["filled"] += 1
            logger.info("[%d/%d] %s -> %s", i + 1, len(target), row["latin_name"], nl[:70])
        else:
            # Only genuinely bilingual pairs are persisted, same as the endpoint.
            stats["failed"] += 1
            logger.warning("[%d/%d] %s -> no usable fact", i + 1, len(target), row["latin_name"])
        await asyncio.sleep(_REQUEST_DELAY_S)

    return stats


async def main(dry_run: bool, limit: int | None, relink_only: bool):
    from database import init_pool, close_pool, get_db

    await init_pool()
    try:
        async with get_db() as db:
            link_stats = await relink_orphaned_discoveries(db, dry_run)
            logger.info(
                "relink: %d discoveries relinked, %d have a latin name with no species row",
                link_stats["relinked"], link_stats["unmatched"],
            )

            if relink_only:
                return

            fact_stats = await fill_missing_fun_facts(db, dry_run, limit)
            logger.info(
                "fun facts: %d filled, %d still failing",
                fact_stats["filled"], fact_stats["failed"],
            )
    finally:
        await close_pool()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="report without writing")
    ap.add_argument("--limit", type=int, default=None, help="cap how many species to generate for")
    ap.add_argument("--relink-only", action="store_true", help="skip fun-fact generation")
    args = ap.parse_args()
    asyncio.run(main(args.dry_run, args.limit, args.relink_only))
