#!/usr/bin/env python3
"""Prune exotic-congener bloat from BioCLIP identification — reversibly.

The catalog is genus-padded with global congeners (e.g. ~100 species each of
Paphiopedilum / Vanda / Acer). This caps each over-large genus to `--cap`
species, marking the excess `id_enabled = FALSE` so precompute_embeddings.py
stops embedding them — they drop out of identification but stay in the DB (no
deletes, no FK/cascade risk, fully reversible with `--reset`).

Never excludes a "protected" species:
  - one you actually grow (referenced by plants.species_id)
  - one with care data (the curated care catalog)
  - one native to NL (native_to_nl = TRUE) — kept for coverage
  - one with a user-confirmed embedding
Genus-less rows (genus NULL/'') are never capped — they're a data gap, not bloat;
they're reported for manual genus backfill instead.

Usage:
    python scripts/prune_catalog.py                 # dry-run: show what would change
    python scripts/prune_catalog.py --apply         # set id_enabled = FALSE on the excess
    python scripts/prune_catalog.py --reset --apply # re-enable everything (undo)
    python scripts/prune_catalog.py --cap 15        # tune the per-genus cap (default 20)

After --apply, on the GPU box: python scripts/precompute_embeddings.py  (then restart the worker).
"""
import argparse
import asyncio
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def select_excluded(rows: list[dict], protected_ids: set[int], cap: int) -> set[int]:
    """Pure: pick species ids to exclude. In each genus with > cap species, keep
    all protected ones + fill up to `cap` with the remaining (image-having first),
    exclude the rest. Genus-less rows are never capped."""
    by_genus: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        genus = (r.get("genus") or "").strip()
        if not genus:
            continue
        by_genus[genus].append(r)

    excluded: set[int] = set()
    for members in by_genus.values():
        if len(members) <= cap:
            continue
        protected = [r for r in members if r["id"] in protected_ids]
        non_protected = [r for r in members if r["id"] not in protected_ids]
        keep_slots = max(0, cap - len(protected))
        # Keep the more-useful non-protected first (has a reference image), so the
        # ones we drop are the thinnest records.
        non_protected.sort(key=lambda r: bool(r.get("images_count")), reverse=True)
        for r in non_protected[keep_slots:]:
            excluded.add(r["id"])
    return excluded


async def _load(db):
    rows = [dict(r) for r in await db.execute_fetchall(
        "SELECT id, genus, images_count FROM plant_species")]
    protected: set[int] = set()
    for sql in (
        "SELECT id FROM plant_species WHERE care_thresholds IS NOT NULL "
        "  AND care_thresholds NOT IN ('', '{}', 'null')",
        "SELECT id FROM plant_species WHERE native_to_nl = TRUE",
        "SELECT DISTINCT species_id AS id FROM plants WHERE species_id IS NOT NULL",
        "SELECT DISTINCT species_id AS id FROM user_confirmed_embeddings",
    ):
        for r in await db.execute_fetchall(sql):
            protected.add(int(r["id"]))
    genusless = sum(1 for r in rows if not (r.get("genus") or "").strip())
    return rows, protected, genusless


async def main(cap: int, apply: bool, reset: bool):
    try:
        from dotenv import load_dotenv
        load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    except ImportError:
        pass
    from database import init_pool, close_pool, get_db

    await init_pool()
    try:
        async with get_db() as db:
            if reset:
                if apply:
                    await db.execute("UPDATE plant_species SET id_enabled = TRUE")
                    await db.commit()
                    print("Re-enabled all species (id_enabled = TRUE).")
                else:
                    print("--reset is a no-op without --apply (dry-run).")
                return

            rows, protected, genusless = await _load(db)
            excluded = select_excluded(rows, protected, cap)

            by_genus: dict[str, int] = defaultdict(int)
            for r in rows:
                if r["id"] in excluded:
                    by_genus[(r.get("genus") or "?")] += 1

            print()
            print(f"Prune plan (cap={cap})  —  {'APPLYING' if apply else 'DRY RUN'}")
            print("=" * 44)
            print(f"Catalog: {len(rows)} species, {len(protected)} protected, "
                  f"{genusless} genus-less (never capped)")
            print(f"Would exclude {len(excluded)} species from identification "
                  f"({len(rows) - len(excluded)} remain identifiable):")
            for genus, n in sorted(by_genus.items(), key=lambda x: -x[1]):
                print(f"    {genus:<20} -{n}")

            if apply:
                for sid in excluded:
                    await db.execute(
                        "UPDATE plant_species SET id_enabled = FALSE WHERE id = ?", (sid,))
                await db.commit()
                print(f"\nApplied. Re-run precompute_embeddings.py on the GPU box, then restart the worker.")
            else:
                print("\nDry run — nothing changed. Re-run with --apply to write id_enabled.")
    finally:
        await close_pool()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--cap", type=int, default=20, help="max species kept per genus")
    p.add_argument("--apply", action="store_true", help="write changes (default: dry-run)")
    p.add_argument("--reset", action="store_true", help="re-enable all species (undo)")
    args = p.parse_args()
    asyncio.run(main(args.cap, args.apply, args.reset))
