#!/usr/bin/env python3
"""
GBIF Species ETL — Import plant species from GBIF into floreren database.

Usage:
  python scripts/import_gbif_species.py          # import default species set
  python scripts/import_gbif_species.py --genus Monstera,Ficus   # specific genera
"""

import argparse
import asyncio
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
load_dotenv(dotenv_path)

try:
    import httpx
except ImportError:
    print("Run: pip install httpx")
    sys.exit(1)

from species_service import upsert_species_from_gbif, insert_species_image

# ── GBIF API ──
GBIF_API = "https://api.gbif.org/v1"
GBIF_SPECIES_SEARCH = f"{GBIF_API}/species/search"

# Rate limiting: 8 req/s to be safe
_MIN_INTERVAL = 0.125

# GBIF nubKey for Tracheophyta (vascular plants) — excludes archaea, algae, fungi
TRACHEOPHYTA_KEY = 7707728

# ── Houseplant genera ──
HOUSEPLANT_GENERA = [
    "Monstera", "Ficus", "Philodendron", "Spathiphyllum", "Sansevieria",
    "Dracaena", "Epipremnum", "Chlorophytum", "Calathea", "Maranta",
    "Aloe", "Echeveria", "Crassula", "Kalanchoe", "Sedum",
    "Anthurium", "Aglaonema", "Dieffenbachia", "Syngonium", "Scindapsus",
    "Peperomia", "Hoya", "Pilea", "Zamioculcas", "Schefflera",
    "Cactaceae", "Tradescantia", "Aspidistra", "Nephrolepis", "Asplenium",
    "Rhaphidophora", "Ctenanthe", "Stromanthe", "Caladium", "Colocasia",
    "Begonia", "Impatiens", "Pelargonium", "Chamaedorea", "Howea",
]

# ── Popular outdoor genera ──
OUTDOOR_GENERA = [
    "Hydrangea", "Rosa", "Lavandula", "Clematis", "Wisteria",
    "Buxus", "Taxus", "Thuja", "Hedera", "Rhododendron",
    "Hosta", "Heuchera", "Echinacea", "Salvia", "Nepeta",
    "Geranium", "Campanula", "Aster", "Sedum", "Sempervivum",
    "Lupinus", "Delphinium", "Paeonia", "Iris", "Lilium",
    "Tulipa", "Narcissus", "Crocus", "Hyacinthus", "Galanthus",
    "Hemerocallis", "Phlox", "Ajuga", "Alchemilla", "Astilbe",
    "Buddleja", "Cornus", "Berberis", "Viburnum", "Euonymus",
    "Forsythia", "Syringa", "Spiraea", "Weigela", "Deutzia",
    "Ligustrum", "Prunus", "Malus", "Betula", "Quercus",
    "Fagus", "Acer", "Tilia", "Fraxinus", "Sorbus",
    "Juniperus", "Pinus", "Picea", "Abies", "Larix",
]

# ── Herb/vegetable genera ──
HERB_GENERA = [
    "Ocimum", "Mentha", "Rosmarinus", "Thymus", "Origanum",
    "Salvia", "Petroselinum", "Anethum", "Coriandrum", "Allium",
    "Solanum", "Capsicum", "Cucumis", "Cucurbita", "Lactuca",
    "Daucus", "Beta", "Brassica", "Raphanus", "Phaseolus",
    "Pisum", "Fragaria", "Ribes", "Vaccinium", "Rubus",
]


def make_slug(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9\-]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug.strip("-")


def parse_vernacular(vernacular_list: list[dict]) -> tuple[str | None, str | None]:
    nl_name = en_name = None
    for v in vernacular_list:
        lang = v.get("language", "")
        name = v.get("vernacularName", "")
        if lang == "nld" and not nl_name:
            nl_name = name
        elif lang == "eng" and not en_name:
            en_name = name
        if nl_name and en_name:
            break
    return nl_name, en_name


async def fetch_json(client: httpx.AsyncClient, url: str, params: dict | None = None) -> dict:
    await asyncio.sleep(_MIN_INTERVAL)
    resp = await client.get(url, params=params)
    resp.raise_for_status()
    return resp.json()


async def fetch_species_by_genus(
    client: httpx.AsyncClient, genus: str, limit: int = 100
) -> list[dict]:
    """
    Fetch species for a genus via GBIF species/search.
    IMPORTANT: GBIF's species/search is a TEXT search engine — filter params
    (genus=, kingdom=, etc.) are silently IGNORED without a 'q' query string.
    We use q={genus} + post-filter by genus name for correctness.
    """
    results = []
    offset = 0
    while len(results) < limit:
        resp = await fetch_json(client, GBIF_SPECIES_SEARCH, {
            "q": genus,
            "limit": min(100, limit - len(results)),
            "offset": offset,
            "status": "ACCEPTED",
            "higherTaxonKey": TRACHEOPHYTA_KEY,
            "rank": "SPECIES",
        })
        # Post-filter: only keep results that match the requested genus
        valid = [r for r in resp.get("results", [])
                 if (r.get("genus") or "").lower() == genus.lower()]
        results.extend(valid)
        if not resp.get("endOfRecords", True):
            offset += 100
        else:
            break
    return results[:limit]


async def fetch_media(client: httpx.AsyncClient, taxon_key: int) -> list[dict]:
    try:
        resp = await fetch_json(client, f"{GBIF_API}/species/{taxon_key}/media")
        return resp.get("results", [])
    except Exception:
        return []


async def fetch_vernacular(client: httpx.AsyncClient, taxon_key: int) -> list[dict]:
    try:
        resp = await fetch_json(client, f"{GBIF_API}/species/{taxon_key}/vernacularNames")
        return resp.get("results", [])
    except Exception:
        return []


def gbif_to_species_dict(gbif: dict, common_nl: str | None = None, common_en: str | None = None) -> dict:
    scientific_name = gbif.get("species") or gbif.get("scientificName", "")
    genus = gbif.get("genus", "")
    family = gbif.get("family")
    name_for_slug = scientific_name or gbif.get("canonicalName", "") or common_nl or genus
    return {
        "slug": make_slug(name_for_slug),
        "common_name_nl": common_nl or name_for_slug,
        "common_name_en": common_en,
        "latin_name": scientific_name,
        "family": family,
        "genus": genus,
        "growth_form": None,
        "gbif_taxon_key": gbif.get("key") or gbif.get("taxonKey"),
        "images_count": 0,
        "climate_zone": "temperate",
    }


def image_to_img_dict(media: dict) -> dict | None:
    if media.get("type") != "StillImage":
        return None
    url = media.get("identifier", "")
    if not url:
        return None
    if isinstance(url, str) and url.startswith("//"):
        url = f"https:{url}"
    thumbnail = (media.get("thumbnail") or media.get("thumbNailUrl")
                 or media.get("smallThumbnailUrl") or media.get("mediumThumbnailUrl"))
    if isinstance(thumbnail, str) and thumbnail.startswith("//"):
        thumbnail = f"https:{thumbnail}"
    return {
        "url": url,
        "thumbnail_url": thumbnail,
        "source": "gbif",
        "license": media.get("license", ""),
        "is_primary": False,
    }


async def process_species_batch(
    client: httpx.AsyncClient,
    species_list: list[dict],
    db,
    imported: set,
    stats: dict,
    max_images: int = 5,
) -> None:
    for gbif in species_list:
        key = gbif.get("key") or gbif.get("taxonKey")
        if not key or key in imported:
            continue
        imported.add(key)

        scientific_name = gbif.get("species") or gbif.get("scientificName", "")
        if not scientific_name:
            continue

        vernaculars = await fetch_vernacular(client, key)
        nl_name, en_name = parse_vernacular(vernaculars)
        species_data = gbif_to_species_dict(gbif, nl_name, en_name)
        species_id = await upsert_species_from_gbif(db, species_data)

        if species_id:
            stats["species_inserted"] += 1

            media_list = await fetch_media(client, key)
            cc0 = [m for m in media_list if m.get("license") in (
                "CC0_1_0", "CC_BY_4_0", "CC_BY_3_0", "CC_BY_2_0",
                "CC_BY_SA_4_0", "CC_BY_SA_3_0", "CC_BY_SA_2_0",
            )]

            img_count = 0
            for i, m in enumerate((cc0 or media_list[:max_images])[:max_images]):
                img = image_to_img_dict(m)
                if img:
                    if i == 0 and img_count == 0:
                        img["is_primary"] = True
                    await insert_species_image(db, species_id, img)
                    img_count += 1
                    stats["images_inserted"] += 1

            if img_count:
                try:
                    await db.execute(
                        "UPDATE plant_species SET images_count = ? WHERE id = ?",
                        (img_count, species_id),
                    )
                except Exception:
                    pass

            if stats["species_inserted"] % 50 == 0:
                print(f"  ... {stats['species_inserted']} species, {stats['images_inserted']} images")


async def import_gbif(
    genera: list[str] | None = None,
    limit: int = 100,
    db=None,
) -> dict:
    """Main GBIF import — genus-based search (country search unreliable in GBIF API)."""
    stats = {"species_inserted": 0, "images_inserted": 0}
    imported = set()

    if not genera:
        return stats

    async with httpx.AsyncClient(timeout=30) as client:
        for genus in genera:
            print(f"  🌱 Importing genus: {genus}")
            species = await fetch_species_by_genus(client, genus, limit)
            print(f"     Found {len(species)} species")
            if species:
                await process_species_batch(client, species, db, imported, stats)
            print(f"     ✅ Done — {stats['species_inserted']} total, {stats['images_inserted']} images")

    return stats


async def main():
    parser = argparse.ArgumentParser(description="Import plant species from GBIF")
    parser.add_argument("--genera", type=str,
                        help="Comma-separated genus names (default: all houseplants + outdoors + herbs)")
    parser.add_argument("--limit", type=int, default=100,
                        help="Max species per genus (default: 100)")
    args = parser.parse_args()

    if args.genera:
        genera = [g.strip() for g in args.genera.split(",")]
    else:
        genera = HOUSEPLANT_GENERA + OUTDOOR_GENERA[:30] + HERB_GENERA

    from database import init_pool, get_db

    print("🎯 GBIF Species ETL")
    print("═══" * 20)
    print(f"Genera: {len(genera)} total (limit {args.limit} each)")
    print()

    await init_pool()
    async with get_db() as db:
        stats = await import_gbif(genera, args.limit, db)

    print()
    print("═══" * 20)
    print(f"✅ Done! {stats['species_inserted']} species, {stats['images_inserted']} images")


if __name__ == "__main__":
    asyncio.run(main())
