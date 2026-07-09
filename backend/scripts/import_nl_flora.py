#!/usr/bin/env python3
"""Import occurrence-scoped Dutch/NW-European flora from GBIF.

This is the Phase-2 catalog expansion runner from
``docs/plans/2026-07-07-catalog-cleanup-runbook.md``. It sources candidate
species from GBIF occurrence facets instead of genus-wide global searches, then
reuses the existing GBIF import helpers to insert species rows and reference
images.

Safe defaults:
  - dry-run unless ``--apply`` is passed
  - NL only
  - minimum 50 occurrences
  - preview/apply at most 100 new species unless ``--limit`` is changed

Examples:
  python scripts/import_nl_flora.py --dry-run
  python scripts/import_nl_flora.py --countries NL,BE,DE --min-occurrences 50 --limit 500
  python scripts/import_nl_flora.py --countries NL --min-occurrences 100 --cap 20 --limit 250 --apply
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Mapping

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:  # pragma: no cover - local script convenience
    pass

import httpx

from scripts.import_gbif_species import (
    GBIF_API,
    TRACHEOPHYTA_KEY,
    fetch_media,
    fetch_vernacular,
    gbif_to_species_dict,
    image_to_img_dict,
    parse_vernacular,
)
from species_service import insert_species_image, upsert_species_from_gbif

OCCURRENCE_SEARCH_URL = f"{GBIF_API}/occurrence/search"
ALLOWED_IMAGE_LICENSES = {
    "CC0_1_0",
    "CC_BY_4_0",
    "CC_BY_3_0",
    "CC_BY_2_0",
}
DEFAULT_COUNTRIES = "NL"
DEFAULT_MIN_OCCURRENCES = 50
DEFAULT_GENUS_CAP = 20
DEFAULT_LIMIT = 100
REQUEST_DELAY_S = 0.125


@dataclass(slots=True)
class OccurrenceCandidate:
    taxon_key: int
    occurrence_count: int
    country_counts: dict[str, int] = field(default_factory=dict)
    gbif: dict[str, Any] | None = None
    species_data: dict[str, Any] | None = None


@dataclass(slots=True)
class ExistingCatalogState:
    gbif_taxon_keys: set[int]
    slugs: set[str]
    enabled_by_genus: Counter[str]


@dataclass(slots=True)
class SelectionStats:
    selected: int = 0
    existing_key: int = 0
    existing_slug: int = 0
    genus_cap: int = 0
    invalid_species: int = 0


def parse_countries(raw: str) -> list[str]:
    countries = [part.strip().upper() for part in raw.split(",") if part.strip()]
    seen: set[str] = set()
    result: list[str] = []
    for country in countries:
        if len(country) != 2 or not country.isalpha():
            raise ValueError(f"Invalid ISO-3166 country code: {country!r}")
        if country not in seen:
            seen.add(country)
            result.append(country)
    if not result:
        raise ValueError("At least one country is required")
    return result


def _parse_facet_key(raw: Any) -> int | None:
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def aggregate_occurrence_facets(
    facets_by_country: Mapping[str, Iterable[Mapping[str, Any]]],
    *,
    min_occurrences: int,
) -> list[OccurrenceCandidate]:
    """Combine GBIF speciesKey facet counts across countries.

    GBIF occurrence facets return taxon keys as strings and one count per country.
    This pure helper converts them to integers, sums repeated keys, filters below
    the chosen total occurrence threshold, and sorts most-observed first.
    """
    totals: Counter[int] = Counter()
    by_country: dict[int, dict[str, int]] = defaultdict(dict)
    for country, counts in facets_by_country.items():
        for item in counts:
            key = _parse_facet_key(item.get("name"))
            if key is None:
                continue
            count = int(item.get("count") or 0)
            if count <= 0:
                continue
            totals[key] += count
            by_country[key][country] = by_country[key].get(country, 0) + count

    candidates = [
        OccurrenceCandidate(taxon_key=key, occurrence_count=count, country_counts=by_country[key])
        for key, count in totals.items()
        if count >= min_occurrences
    ]
    candidates.sort(key=lambda c: (-c.occurrence_count, c.taxon_key))
    return candidates


def _candidate_slug(gbif: Mapping[str, Any]) -> str:
    return gbif_to_species_dict(dict(gbif)).get("slug") or ""


def _is_species_detail(gbif: Mapping[str, Any]) -> bool:
    if gbif.get("rank") != "SPECIES":
        return False
    if gbif.get("taxonomicStatus") not in (None, "ACCEPTED"):
        return False
    if not (gbif.get("species") or gbif.get("canonicalName") or gbif.get("scientificName")):
        return False
    if not gbif.get("genus"):
        return False
    return True


def select_import_candidates(
    candidates: Iterable[OccurrenceCandidate],
    *,
    existing: ExistingCatalogState,
    cap: int,
    limit: int | None,
) -> tuple[list[OccurrenceCandidate], SelectionStats]:
    """Apply idempotency and per-genus cap to hydrated occurrence candidates."""
    stats = SelectionStats()
    selected: list[OccurrenceCandidate] = []
    projected_by_genus = Counter(existing.enabled_by_genus)

    for candidate in candidates:
        if limit is not None and len(selected) >= limit:
            break
        if candidate.taxon_key in existing.gbif_taxon_keys:
            stats.existing_key += 1
            continue
        gbif = candidate.gbif or {}
        if not _is_species_detail(gbif):
            stats.invalid_species += 1
            continue
        slug = _candidate_slug(gbif)
        if slug in existing.slugs:
            stats.existing_slug += 1
            continue
        genus = str(gbif.get("genus") or "").strip()
        if cap > 0 and projected_by_genus[genus] >= cap:
            stats.genus_cap += 1
            continue

        candidate.species_data = gbif_to_species_dict(gbif)
        selected.append(candidate)
        stats.selected += 1
        if genus:
            projected_by_genus[genus] += 1

    return selected, stats


def select_candidates(
    candidates: Iterable[Mapping[str, Any]],
    existing_taxon_keys: set[int],
    min_occurrences: int,
    cap: int,
) -> list[dict[str, Any]]:
    """Legacy pure helper kept for the runbook/Phase-2 selection tests.

    The production importer hydrates candidates into OccurrenceCandidate and then
    calls select_import_candidates(). This lightweight helper operates on dicts
    and preserves the same core policy Claude's runbook encoded: drop existing
    GBIF keys, drop low-occurrence candidates, cap each known genus, keep
    ungrouped candidates uncapped, and return highest occurrence counts first.
    """
    grouped_counts: Counter[str] = Counter()
    kept: list[dict[str, Any]] = []
    for candidate in sorted(
        candidates,
        key=lambda item: int(item.get("count") or item.get("occurrence_count") or 0),
        reverse=True,
    ):
        try:
            taxon_key = int(candidate.get("taxon_key"))
        except (TypeError, ValueError):
            continue
        count = int(candidate.get("count") or candidate.get("occurrence_count") or 0)
        if taxon_key in existing_taxon_keys or count < min_occurrences:
            continue
        genus = (candidate.get("genus") or "").strip()
        if genus:
            if cap > 0 and grouped_counts[genus] >= cap:
                continue
            grouped_counts[genus] += 1
        kept.append(dict(candidate))
    return kept


async def fetch_occurrence_facets_for_country(
    client: httpx.AsyncClient,
    country: str,
    *,
    min_occurrences: int,
    page_size: int,
    max_pages: int,
) -> list[dict[str, Any]]:
    """Fetch paginated GBIF occurrence speciesKey facets for one country."""
    counts: list[dict[str, Any]] = []
    # In a multi-country run, a species can meet the total threshold even if each
    # country is below min_occurrences. Keep paging down to roughly threshold/N;
    # the caller passes the same min for every country, so this is a conservative
    # single-country stop and max_pages is the hard safety cap.
    stop_below = max(1, min_occurrences)
    for page in range(max_pages):
        await asyncio.sleep(REQUEST_DELAY_S)
        resp = await client.get(
            OCCURRENCE_SEARCH_URL,
            params={
                "country": country,
                "taxon_key": TRACHEOPHYTA_KEY,
                "facet": "speciesKey",
                "facetLimit": page_size,
                "facetOffset": page * page_size,
                "limit": 0,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        facets = data.get("facets") or []
        page_counts = (facets[0].get("counts") if facets else []) or []
        if not page_counts:
            break
        counts.extend(page_counts)
        last_count = int(page_counts[-1].get("count") or 0)
        if len(page_counts) < page_size or last_count < stop_below:
            break
    return counts


async def fetch_occurrence_candidates(
    client: httpx.AsyncClient,
    countries: list[str],
    *,
    min_occurrences: int,
    page_size: int,
    max_pages: int,
) -> list[OccurrenceCandidate]:
    facets: dict[str, list[dict[str, Any]]] = {}
    # For multiple countries, page a little deeper in each country so summed
    # counts can still pass the requested total threshold.
    per_country_stop = max(1, min_occurrences // max(1, len(countries)))
    for country in countries:
        print(f"  🔎 Fetching GBIF occurrence facet for {country}...")
        facets[country] = await fetch_occurrence_facets_for_country(
            client,
            country,
            min_occurrences=per_country_stop,
            page_size=page_size,
            max_pages=max_pages,
        )
        print(f"     {len(facets[country])} speciesKey facet rows")
    return aggregate_occurrence_facets(facets, min_occurrences=min_occurrences)


async def fetch_species_detail(client: httpx.AsyncClient, taxon_key: int) -> dict[str, Any] | None:
    try:
        await asyncio.sleep(REQUEST_DELAY_S)
        resp = await client.get(f"{GBIF_API}/species/{taxon_key}")
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        print(f"  ⚠️  GBIF species/{taxon_key} failed: {exc}")
        return None


async def load_existing_catalog_state(db) -> ExistingCatalogState:
    rows = await db.execute_fetchall(
        "SELECT slug, gbif_taxon_key, genus, id_enabled FROM plant_species"
    )
    keys: set[int] = set()
    slugs: set[str] = set()
    enabled_by_genus: Counter[str] = Counter()
    for row in rows:
        if row.get("gbif_taxon_key") is not None:
            try:
                keys.add(int(row["gbif_taxon_key"]))
            except (TypeError, ValueError):
                pass
        if row.get("slug"):
            slugs.add(str(row["slug"]))
        genus = (row.get("genus") or "").strip()
        if genus and row.get("id_enabled") is not False:
            enabled_by_genus[genus] += 1
    return ExistingCatalogState(gbif_taxon_keys=keys, slugs=slugs, enabled_by_genus=enabled_by_genus)


async def hydrate_and_select_candidates(
    client: httpx.AsyncClient,
    occurrence_candidates: list[OccurrenceCandidate],
    *,
    existing: ExistingCatalogState,
    cap: int,
    limit: int | None,
) -> tuple[list[OccurrenceCandidate], SelectionStats]:
    selected: list[OccurrenceCandidate] = []
    stats = SelectionStats()
    projected = Counter(existing.enabled_by_genus)

    for idx, candidate in enumerate(occurrence_candidates, start=1):
        if limit is not None and len(selected) >= limit:
            break
        if candidate.taxon_key in existing.gbif_taxon_keys:
            stats.existing_key += 1
            continue
        gbif = await fetch_species_detail(client, candidate.taxon_key)
        if gbif is None:
            stats.invalid_species += 1
            continue
        candidate.gbif = gbif
        if not _is_species_detail(gbif):
            stats.invalid_species += 1
            continue
        slug = _candidate_slug(gbif)
        if slug in existing.slugs:
            stats.existing_slug += 1
            continue
        genus = str(gbif.get("genus") or "").strip()
        if cap > 0 and projected[genus] >= cap:
            stats.genus_cap += 1
            continue
        vernaculars = await fetch_vernacular(client, candidate.taxon_key)
        nl_name, en_name = parse_vernacular(vernaculars)
        candidate.species_data = gbif_to_species_dict(gbif, nl_name, en_name)
        selected.append(candidate)
        stats.selected += 1
        if genus:
            projected[genus] += 1
        if len(selected) <= 20 or len(selected) % 50 == 0:
            print(
                f"  + {len(selected):>4} {candidate.species_data['latin_name']} "
                f"({candidate.occurrence_count} occurrences; {','.join(candidate.country_counts)})"
            )
        elif idx % 250 == 0:
            print(f"  ... scanned {idx} occurrence candidates, selected {len(selected)}")

    return selected, stats


async def insert_candidate(
    client: httpx.AsyncClient,
    db,
    candidate: OccurrenceCandidate,
    *,
    max_images: int,
) -> tuple[int | None, int]:
    if candidate.species_data is None:
        raise ValueError("candidate.species_data must be hydrated before insert")
    species_id = await upsert_species_from_gbif(db, candidate.species_data)
    if not species_id:
        return None, 0
    await db.execute("UPDATE plant_species SET id_enabled = TRUE WHERE id = ?", (species_id,))

    media_list = await fetch_media(client, candidate.taxon_key)
    allowed = [m for m in media_list if m.get("license") in ALLOWED_IMAGE_LICENSES]
    image_count = 0
    for media in allowed[:max_images]:
        img = image_to_img_dict(media)
        if not img:
            continue
        if image_count == 0:
            img["is_primary"] = True
        await insert_species_image(db, species_id, img)
        image_count += 1
    if image_count:
        await db.execute(
            "UPDATE plant_species SET images_count = ? WHERE id = ?",
            (image_count, species_id),
        )
    return species_id, image_count


def _format_sample(candidate: OccurrenceCandidate) -> str:
    data = candidate.species_data or {}
    countries = ",".join(f"{c}:{n}" for c, n in sorted(candidate.country_counts.items()))
    nl = data.get("common_name_nl") or "—"
    en = data.get("common_name_en") or "—"
    return f"{data.get('latin_name') or candidate.taxon_key} | NL={nl} | EN={en} | occ={candidate.occurrence_count} ({countries})"


async def import_nl_flora(args: argparse.Namespace) -> dict[str, Any]:
    from database import close_pool, get_db, init_pool

    countries = parse_countries(args.countries)
    await init_pool()
    try:
        async with get_db() as db:
            existing = await load_existing_catalog_state(db)

        print("🌍 NL/NW-Europe GBIF flora importer")
        print("=" * 44)
        print(f"Countries:        {','.join(countries)}")
        print(f"Min occurrences:  {args.min_occurrences}")
        print(f"Per-genus cap:    {args.cap} enabled species")
        print(f"Limit:            {args.limit if args.limit is not None else 'none'} new species")
        print(f"Mode:             {'APPLY' if args.apply else 'DRY RUN'}")
        print(f"Existing catalog: {len(existing.slugs)} slugs, {len(existing.gbif_taxon_keys)} GBIF keys")
        print()

        async with httpx.AsyncClient(timeout=30) as client:
            occurrence_candidates = await fetch_occurrence_candidates(
                client,
                countries,
                min_occurrences=args.min_occurrences,
                page_size=args.facet_page_size,
                max_pages=args.facet_max_pages,
            )
            print(f"\nOccurrence candidates ≥ threshold: {len(occurrence_candidates)}")
            selected, selection_stats = await hydrate_and_select_candidates(
                client,
                occurrence_candidates,
                existing=existing,
                cap=args.cap,
                limit=args.limit,
            )

            print("\nSelection summary")
            print("-" * 44)
            print(f"Selected new species: {len(selected)}")
            print(f"Skipped existing GBIF key: {selection_stats.existing_key}")
            print(f"Skipped existing slug:     {selection_stats.existing_slug}")
            print(f"Skipped genus cap:         {selection_stats.genus_cap}")
            print(f"Skipped invalid species:   {selection_stats.invalid_species}")

            if selected:
                print("\nSample selected species")
                print("-" * 44)
                for candidate in selected[: min(30, len(selected))]:
                    print("  " + _format_sample(candidate))
                if len(selected) > 30:
                    print(f"  ... {len(selected) - 30} more")

            inserted = 0
            images_inserted = 0
            if args.apply:
                print("\nApplying imports")
                print("-" * 44)
                async with get_db() as db:
                    for candidate in selected:
                        species_id, image_count = await insert_candidate(
                            client,
                            db,
                            candidate,
                            max_images=args.max_images,
                        )
                        if species_id:
                            inserted += 1
                            images_inserted += image_count
                            if inserted <= 20 or inserted % 50 == 0:
                                print(
                                    f"  inserted {inserted:>4}: "
                                    f"{candidate.species_data['latin_name']} "
                                    f"({image_count} images)"
                                )
                    await db.commit()
                print(f"\nApplied {inserted} species and {images_inserted} images.")
                print("Next: run backfill_dutch_names.py, backfill_english_names.py, enrich_species_ecology.py, then precompute embeddings.")
            else:
                print("\nDry run — no database rows were inserted. Re-run with --apply to write.")

        return {
            "selected": len(selected),
            "inserted": inserted,
            "images_inserted": images_inserted,
            "skipped_existing_key": selection_stats.existing_key,
            "skipped_existing_slug": selection_stats.existing_slug,
            "skipped_genus_cap": selection_stats.genus_cap,
            "skipped_invalid_species": selection_stats.invalid_species,
        }
    finally:
        await close_pool()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Import occurrence-scoped NL/NW-European flora from GBIF")
    parser.add_argument("--countries", default=DEFAULT_COUNTRIES, help="Comma-separated ISO country codes (default: NL)")
    parser.add_argument("--min-occurrences", type=int, default=DEFAULT_MIN_OCCURRENCES)
    parser.add_argument("--cap", type=int, default=DEFAULT_GENUS_CAP, help="Max enabled species per genus; 0 disables the cap")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help="Max new species to preview/apply; 0 means no limit")
    parser.add_argument("--max-images", type=int, default=5)
    parser.add_argument("--facet-page-size", type=int, default=1000, help=argparse.SUPPRESS)
    parser.add_argument("--facet-max-pages", type=int, default=10, help=argparse.SUPPRESS)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="Write rows to the database (default is dry-run)")
    mode.add_argument("--dry-run", action="store_true", help="Explicit dry-run; writes nothing")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.min_occurrences < 1:
        raise SystemExit("--min-occurrences must be >= 1")
    if args.cap < 0:
        raise SystemExit("--cap must be >= 0")
    if args.limit is not None and args.limit < 0:
        raise SystemExit("--limit must be >= 0")
    if args.limit == 0:
        args.limit = None
    asyncio.run(import_nl_flora(args))


if __name__ == "__main__":
    main()
