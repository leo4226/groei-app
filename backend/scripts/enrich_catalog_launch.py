#!/usr/bin/env python3
"""Launch-focused catalog enrichment for the active BioCLIP species set.

Safe by default: dry-run unless --apply is passed. This is meant for the final
pre-production cleanup after pruning/importing occurrence-scoped NL flora:

- fill missing genus/family/GBIF keys from GBIF species/match;
- fill missing localized names from GBIF vernacular names when a GBIF key exists;
- add one occurrence/photo thumbnail for enabled species that still have no image.

Usage:
    python scripts/enrich_catalog_launch.py --dry-run --limit 20
    python scripts/enrich_catalog_launch.py --apply --limit 250
"""
from __future__ import annotations

import argparse
import asyncio
import re
import sys
from pathlib import Path
from typing import Any, Mapping

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:  # pragma: no cover - local script convenience
    pass

import httpx

from scripts.import_gbif_species import GBIF_API, fetch_vernacular, parse_vernacular

GBIF_MATCH_URL = f"{GBIF_API}/species/match"
GBIF_OCCURRENCE_URL = f"{GBIF_API}/occurrence/search"
REQUEST_DELAY_S = 0.125
MIN_MATCH_CONFIDENCE = 90


def _text_or_none(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalise_url(url: Any) -> str | None:
    text = _text_or_none(url)
    if not text:
        return None
    if text.startswith("//"):
        return f"https:{text}"
    return text if text.startswith("http") else None


def latin_name_for_gbif_match(raw: str | None) -> str | None:
    """Return a safe GBIF match query for a row's Latin name, or None.

    Cultivar epithets are noisy for GBIF (`Capsicum annuum 'Lombok'`), while
    one-word genus placeholders and `spp.` names are too broad for automatic
    taxonomy writes.
    """
    text = _text_or_none(raw)
    if not text:
        return None
    text = re.sub(r"\s+['\"‘’][^'\"‘’]+['\"‘’].*$", "", text).strip()
    text = re.sub(r"\s+\([^)]*\)\s*$", "", text).strip()
    if re.search(r"\b(spp?|cf|aff)\.?(\s|$)", text, flags=re.IGNORECASE):
        return None
    parts = text.split()
    if len(parts) < 2:
        return None
    return text


def _missing(row: Mapping[str, Any], field: str) -> bool:
    return _text_or_none(row.get(field)) is None


def _taxon_key(match: Mapping[str, Any]) -> int | None:
    raw = match.get("usageKey") or match.get("acceptedUsageKey") or match.get("key")
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def taxonomy_updates_from_match(
    row: Mapping[str, Any],
    match: Mapping[str, Any],
    *,
    min_confidence: int = MIN_MATCH_CONFIDENCE,
) -> dict[str, Any]:
    """Build safe taxonomy updates from GBIF species/match.

    Only fills missing fields; never overwrites an existing genus/family/key.
    Weak/fuzzy matches are skipped because a wrong GBIF key pollutes future
    idempotency checks.
    """
    if match.get("matchType") in (None, "NONE"):
        return {}
    confidence = int(match.get("confidence") or 0)
    if confidence < min_confidence:
        return {}

    updates: dict[str, Any] = {}
    family = _text_or_none(match.get("family"))
    genus = _text_or_none(match.get("genus"))
    key = _taxon_key(match)
    if _missing(row, "family") and family:
        updates["family"] = family
    if _missing(row, "genus") and genus:
        updates["genus"] = genus
    if row.get("gbif_taxon_key") is None and key:
        updates["gbif_taxon_key"] = key
    return updates


def _localized_missing(value: Any, latin_name: str | None) -> bool:
    text = _text_or_none(value)
    if text is None:
        return True
    latin = _text_or_none(latin_name)
    return bool(latin and text.casefold() == latin.casefold())


def localized_name_updates(
    row: Mapping[str, Any],
    *,
    nl_name: str | None,
    en_name: str | None,
) -> dict[str, str]:
    latin = _text_or_none(row.get("latin_name"))
    updates: dict[str, str] = {}
    nl = _text_or_none(nl_name)
    en = _text_or_none(en_name)
    if nl and _localized_missing(row.get("common_name_nl"), latin) and not _localized_missing(nl, latin):
        updates["common_name_nl"] = nl
    if en and _localized_missing(row.get("common_name_en"), latin) and not _localized_missing(en, latin):
        updates["common_name_en"] = en
    return updates


def choose_occurrence_image(
    record: Mapping[str, Any],
    *,
    source: str,
    primary: bool,
) -> dict[str, Any] | None:
    for media in record.get("media") or []:
        if media.get("type") != "StillImage":
            continue
        url = _normalise_url(media.get("identifier"))
        if not url:
            continue
        thumb = (
            _normalise_url(media.get("thumbnail"))
            or _normalise_url(media.get("thumbNailUrl"))
            or _normalise_url(media.get("smallThumbnailUrl"))
            or _normalise_url(media.get("mediumThumbnailUrl"))
        )
        return {
            "url": url,
            "thumbnail_url": thumb,
            "source": source,
            "license": media.get("license"),
            "is_primary": primary,
        }
    return None


async def fetch_gbif_match(client: httpx.AsyncClient, latin_name: str) -> dict[str, Any] | None:
    await asyncio.sleep(REQUEST_DELAY_S)
    resp = await client.get(GBIF_MATCH_URL, params={"name": latin_name, "rank": "SPECIES"})
    if resp.status_code != 200:
        return None
    return resp.json()


async def fetch_occurrence_image(
    client: httpx.AsyncClient,
    taxon_key: int,
    *,
    country: str | None,
) -> dict[str, Any] | None:
    params: dict[str, Any] = {
        "taxonKey": taxon_key,
        "mediaType": "StillImage",
        "limit": 10,
    }
    if country:
        params["country"] = country
    await asyncio.sleep(REQUEST_DELAY_S)
    resp = await client.get(GBIF_OCCURRENCE_URL, params=params)
    if resp.status_code != 200:
        return None
    for record in resp.json().get("results") or []:
        img = choose_occurrence_image(record, source="gbif_occurrence", primary=True)
        if img:
            return img
    return None


async def _apply_updates(db, species_id: int, updates: Mapping[str, Any]) -> None:
    if not updates:
        return
    fields = list(updates)
    assignments = ", ".join(f"{field} = ?" for field in fields)
    params = [updates[field] for field in fields]
    params.append(species_id)
    await db.execute(
        f"UPDATE plant_species SET {assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        tuple(params),
    )


async def _insert_image(db, species_id: int, img: Mapping[str, Any]) -> None:
    await db.execute(
        """INSERT INTO species_images (species_id, url, thumbnail_url, source, license, is_primary)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (
            species_id,
            img["url"],
            img.get("thumbnail_url"),
            img.get("source", "gbif_occurrence"),
            img.get("license"),
            img.get("is_primary", True),
        ),
    )
    await db.execute(
        "UPDATE plant_species SET images_count = (SELECT COUNT(*) FROM species_images WHERE species_id = ?) WHERE id = ?",
        (species_id, species_id),
    )


async def enrich_catalog(args: argparse.Namespace) -> dict[str, int]:
    from database import close_pool, get_db, init_pool

    stats = {
        "taxonomy_checked": 0,
        "taxonomy_updated": 0,
        "names_updated": 0,
        "images_checked": 0,
        "images_added": 0,
        "skipped": 0,
        "errors": 0,
    }

    await init_pool()
    try:
        async with get_db() as db:
            taxonomy_rows = await db.execute_fetchall(
                """
                SELECT id, latin_name, common_name_nl, common_name_en, family, genus, gbif_taxon_key
                FROM plant_species
                WHERE COALESCE(id_enabled, TRUE) = TRUE
                  AND latin_name IS NOT NULL
                  AND (
                    NULLIF(TRIM(COALESCE(family, '')), '') IS NULL
                    OR NULLIF(TRIM(COALESCE(genus, '')), '') IS NULL
                    OR gbif_taxon_key IS NULL
                    OR LOWER(TRIM(COALESCE(common_name_nl, ''))) = LOWER(TRIM(COALESCE(latin_name, '')))
                    OR LOWER(TRIM(COALESCE(common_name_en, ''))) = LOWER(TRIM(COALESCE(latin_name, '')))
                  )
                ORDER BY id
                """
            )
            image_rows = await db.execute_fetchall(
                """
                SELECT id, latin_name, gbif_taxon_key
                FROM plant_species ps
                WHERE COALESCE(id_enabled, TRUE) = TRUE
                  AND gbif_taxon_key IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM species_images si WHERE si.species_id = ps.id)
                ORDER BY id DESC
                """
            )

        taxonomy_targets = [dict(r) for r in taxonomy_rows if latin_name_for_gbif_match(r.get("latin_name"))]
        image_targets = [dict(r) for r in image_rows]
        if args.limit is not None:
            taxonomy_targets = taxonomy_targets[: args.limit]
            image_targets = image_targets[: args.limit]

        print("🌿 Launch catalog enrichment")
        print("=" * 36)
        print(f"Mode:             {'APPLY' if args.apply else 'DRY RUN'}")
        print(f"Taxonomy targets: {len(taxonomy_targets)}")
        print(f"Image targets:    {len(image_targets)}")
        print(f"Image country:    {args.country or 'any'}")
        print()

        async with httpx.AsyncClient(timeout=30) as client:
            async with get_db() as db:
                for row in taxonomy_targets:
                    stats["taxonomy_checked"] += 1
                    try:
                        latin = latin_name_for_gbif_match(row.get("latin_name"))
                        if not latin:
                            stats["skipped"] += 1
                            continue
                        match = await fetch_gbif_match(client, latin)
                        updates = taxonomy_updates_from_match(row, match or {})
                        taxon_key = updates.get("gbif_taxon_key") or row.get("gbif_taxon_key")
                        if taxon_key:
                            vernaculars = await fetch_vernacular(client, int(taxon_key))
                            nl_name, en_name = parse_vernacular(vernaculars)
                            updates.update(localized_name_updates(row, nl_name=nl_name, en_name=en_name))
                        if updates:
                            if not args.apply:
                                print(f"  would update taxonomy species_id={row['id']} {latin}: {updates}")
                            else:
                                await _apply_updates(db, int(row["id"]), updates)
                            if any(k in updates for k in ("family", "genus", "gbif_taxon_key")):
                                stats["taxonomy_updated"] += 1
                            if any(k in updates for k in ("common_name_nl", "common_name_en")):
                                stats["names_updated"] += 1
                    except Exception as exc:  # noqa: BLE001 - batch CLI should continue
                        stats["errors"] += 1
                        print(f"  ⚠️ taxonomy skip species_id={row.get('id')}: {exc}")

                if args.apply:
                    await db.commit()

                # Re-read image targets after taxonomy may have supplied GBIF keys.
                if args.apply and taxonomy_targets:
                    refreshed = await db.execute_fetchall(
                        """
                        SELECT id, latin_name, gbif_taxon_key
                        FROM plant_species ps
                        WHERE COALESCE(id_enabled, TRUE) = TRUE
                          AND gbif_taxon_key IS NOT NULL
                          AND NOT EXISTS (SELECT 1 FROM species_images si WHERE si.species_id = ps.id)
                        ORDER BY id DESC
                        """
                    )
                    image_targets = [dict(r) for r in refreshed]
                    if args.limit is not None:
                        image_targets = image_targets[: args.limit]

                for row in image_targets:
                    stats["images_checked"] += 1
                    try:
                        taxon_key = int(row["gbif_taxon_key"])
                        img = await fetch_occurrence_image(client, taxon_key, country=args.country)
                        if not img and args.country:
                            img = await fetch_occurrence_image(client, taxon_key, country=None)
                        if not img:
                            continue
                        if not args.apply:
                            print(f"  would add image species_id={row['id']} {row.get('latin_name')}: {img['url'][:90]}")
                        else:
                            await _insert_image(db, int(row["id"]), img)
                        stats["images_added"] += 1
                    except Exception as exc:  # noqa: BLE001 - batch CLI should continue
                        stats["errors"] += 1
                        print(f"  ⚠️ image skip species_id={row.get('id')}: {exc}")

                if args.apply:
                    await db.commit()

        print("\nDone.", stats)
        return stats
    finally:
        await close_pool()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Launch-focused plant_species enrichment")
    parser.add_argument("--limit", type=int, default=None, help="Max taxonomy rows and max image rows to process")
    parser.add_argument("--country", default="NL", help="Prefer occurrence images from this country; empty string means any")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="Write updates to the database")
    mode.add_argument("--dry-run", action="store_true", help="Preview only (default)")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.limit is not None and args.limit < 1:
        raise SystemExit("--limit must be >= 1")
    args.country = _text_or_none(args.country)
    asyncio.run(enrich_catalog(args))


if __name__ == "__main__":
    main()
