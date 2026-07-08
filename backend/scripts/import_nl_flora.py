#!/usr/bin/env python3
"""Import NL / NW-Europe native + wild flora into plant_species (Phase 2 of #467).

Occurrence-SCOPED, unlike the genus-driven global import that produced the bloat:
it pulls the species that actually occur in the given countries (ranked by GBIF
occurrence count), dedups against existing rows, caps per genus so it doesn't
re-introduce bloat, reuses the proven import_gbif_species helpers, and leaves the
new rows id_enabled = TRUE (identifiable immediately).

Dry-run by default. See docs/plans/2026-07-07-catalog-cleanup-runbook.md Phase 2.

Usage:
    python scripts/import_nl_flora.py                                  # dry-run: NL, >=50 occ, cap 20
    python scripts/import_nl_flora.py --countries NL,BE,DE --min-occurrences 30 --apply
    python scripts/import_nl_flora.py --limit 800 --cap 15 --apply

After --apply, run the existing backfills + re-embed on the GPU box:
    python scripts/backfill_dutch_names.py
    python scripts/backfill_english_names.py
    python scripts/enrich_species_ecology.py         # fills native_to_nl on new rows
    python scripts/precompute_embeddings.py          # (GPU) then restart the worker
"""
import argparse
import asyncio
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

_GBIF_API = "https://api.gbif.org/v1"
_TRACHEOPHYTA_KEY = 7707728        # vascular plants — excludes algae/fungi
_FACET_PAGE = 1000                 # GBIF facet page size


def select_candidates(
    candidates: list[dict],
    existing_taxon_keys: set[int],
    min_occurrences: int,
    cap: int,
) -> list[dict]:
    """Pure: choose which GBIF occurrence candidates to import.

    candidates: list of {taxon_key:int, name:str, genus:str|None, count:int}.
      - drop taxon_keys already in the catalog (idempotent),
      - drop species below `min_occurrences` (skip vagrants/noise),
      - keep the top `cap` per genus by occurrence count so we don't re-bloat
        (candidates with no genus are kept, not capped).
    Returns kept candidates, highest occurrence count first.
    """
    fresh = [
        c for c in candidates
        if c["taxon_key"] not in existing_taxon_keys and c["count"] >= min_occurrences
    ]
    by_genus: dict[str, list[dict]] = defaultdict(list)
    kept: list[dict] = []
    for c in fresh:
        genus = (c.get("genus") or "").strip()
        if genus:
            by_genus[genus].append(c)
        else:
            kept.append(c)  # no genus → not capped
    for members in by_genus.values():
        members.sort(key=lambda c: c["count"], reverse=True)
        kept.extend(members[:cap])
    kept.sort(key=lambda c: c["count"], reverse=True)
    return kept


async def _facet_counts(client, fetch_json, countries: list[str]) -> dict[int, int]:
    """Sum the GBIF occurrence speciesKey facet across countries → {taxon_key: count}."""
    totals: dict[int, int] = {}
    for country in countries:
        offset = 0
        while True:
            data = await fetch_json(client, f"{_GBIF_API}/occurrence/search", {
                "country": country,
                "taxonKey": _TRACHEOPHYTA_KEY,
                "limit": 0,
                "facet": "speciesKey",
                "speciesKey.facetLimit": _FACET_PAGE,
                "speciesKey.facetOffset": offset,
            })
            facets = data.get("facets") or []
            buckets = facets[0].get("counts", []) if facets else []
            if not buckets:
                break
            for b in buckets:
                key = int(b["name"])
                totals[key] = totals.get(key, 0) + int(b["count"])
            if len(buckets) < _FACET_PAGE:
                break
            offset += _FACET_PAGE
    return totals


async def _species_detail(client, fetch_json, key: int) -> dict | None:
    """Fetch GBIF /species/{key}; return a candidate dict for a rank=SPECIES plant."""
    try:
        d = await fetch_json(client, f"{_GBIF_API}/species/{key}")
    except Exception:
        return None
    if d.get("rank") != "SPECIES":
        return None
    name = d.get("canonicalName") or d.get("species") or d.get("scientificName")
    if not name:
        return None
    d["species"] = name          # normalise for gbif_to_species_dict
    d["key"] = d.get("key") or key
    return {"taxon_key": int(key), "name": name, "genus": d.get("genus"),
            "family": d.get("family"), "raw": d}


async def main(countries, min_occurrences, cap, limit, max_fetch, apply):
    try:
        from dotenv import load_dotenv
        load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    except ImportError:
        pass
    import httpx
    from database import init_pool, close_pool, get_db
    # Reuse the proven helpers (lazy import keeps this module httpx-free at import time).
    from scripts.import_gbif_species import (
        fetch_json, fetch_vernacular, parse_vernacular, fetch_media,
        image_to_img_dict, gbif_to_species_dict,
    )
    from species_service import upsert_species_from_gbif, insert_species_image

    await init_pool()
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            print(f"Faceting GBIF occurrences for {countries} (Tracheophyta) ...")
            totals = await _facet_counts(client, fetch_json, countries)
            above = sorted(
                ((k, n) for k, n in totals.items() if n >= min_occurrences),
                key=lambda kv: kv[1], reverse=True,
            )[:max_fetch]
            print(f"{len(totals)} species observed; {len(above)} above --min-occurrences={min_occurrences}"
                  f" (fetching details, capped at --max-fetch={max_fetch}) ...")

            candidates: list[dict] = []
            for key, count in above:
                det = await _species_detail(client, fetch_json, key)
                if det:
                    det["count"] = count
                    candidates.append(det)

            async with get_db() as db:
                rows = await db.execute_fetchall(
                    "SELECT gbif_taxon_key FROM plant_species WHERE gbif_taxon_key IS NOT NULL")
                existing = {int(r["gbif_taxon_key"]) for r in rows}

                selected = select_candidates(candidates, existing, min_occurrences, cap)
                if limit:
                    selected = selected[:limit]

                by_genus: dict[str, int] = defaultdict(int)
                for c in selected:
                    by_genus[(c.get("genus") or "?")] += 1

                print()
                print(f"Import plan  —  {'APPLYING' if apply else 'DRY RUN'}")
                print("=" * 44)
                print(f"Already in catalog: {len(existing)}   New to add: {len(selected)}")
                print("Top genera to add:")
                for genus, n in sorted(by_genus.items(), key=lambda x: -x[1])[:20]:
                    print(f"    {genus:<20} +{n}")
                print("Sample (highest occurrence first):")
                for c in selected[:15]:
                    print(f"    {c['name']:<34} occ={c['count']}")

                if not apply:
                    print("\nDry run — nothing written. Re-run with --apply to import.")
                    return

                added = 0
                for c in selected:
                    try:
                        vern = await fetch_vernacular(client, c["taxon_key"])
                        nl_name, en_name = parse_vernacular(vern)
                        species_data = gbif_to_species_dict(c["raw"], nl_name, en_name)
                        sid = await upsert_species_from_gbif(db, species_data)
                        if not sid:
                            continue
                        added += 1
                        media = await fetch_media(client, c["taxon_key"])
                        imgs = 0
                        for i, m in enumerate(media[:5]):
                            img = image_to_img_dict(m)
                            if img:
                                img["is_primary"] = (imgs == 0)
                                await insert_species_image(db, sid, img)
                                imgs += 1
                        if imgs:
                            await db.execute(
                                "UPDATE plant_species SET images_count = ? WHERE id = ?", (imgs, sid))
                        if added % 25 == 0:
                            await db.commit()
                            print(f"  ... {added} added")
                    except Exception as exc:
                        print(f"  ! skipped {c.get('name')}: {exc}")
                await db.commit()
                print(f"\nAdded {added} species. Next: backfill names + ecology, then re-embed on the GPU box.")
    finally:
        await close_pool()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--countries", default="NL", help="comma-separated ISO codes, e.g. NL,BE,DE")
    p.add_argument("--min-occurrences", type=int, default=50)
    p.add_argument("--cap", type=int, default=20, help="max species per genus (avoid re-bloat)")
    p.add_argument("--limit", type=int, default=0, help="max total species to add (0 = no limit)")
    p.add_argument("--max-fetch", type=int, default=2500, help="cap on GBIF detail lookups")
    p.add_argument("--apply", action="store_true", help="write changes (default: dry-run)")
    args = p.parse_args()
    countries = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    asyncio.run(main(countries, args.min_occurrences, args.cap, args.limit, args.max_fetch, args.apply))
