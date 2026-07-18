"""Ingest the streektuinen.nl streken + icoonsoorten into a committed snapshot.

streektuinen.nl divides the Netherlands into 25 ecological *streken* and tags,
per streek, the native icon species (icoonsoorten, flora + fauna) that belong
there. The site runs WordPress with a fully open REST API, so we sweep the
structured data rather than scraping HTML:

  - /wp-json/wp/v2/regions-categories  → the 25 streken (slug, name, count)
  - /wp-json/wp/v2/species-category     → flora / fauna taxonomy
  - /wp-json/wp/v2/species              → 215 icoonsoorten, each tagged with its
                                          streken (regions-categories) + category

Output: backend/data/streken_source.json — a snapshot committed to the repo so
the app never depends on streektuinen.nl at runtime. Re-runnable / idempotent;
re-run when streektuinen updates and commit the diff (see the plan's "Keeping
data current"). The snapshot is the input to import into the DB
(alembic seed / a DB loader) and to name-resolution against plant_species.

Data © streektuinen.nl (Urgenda, De Vlinderstichting, Cruydt-Hoeck e.a.);
used for a private garden app, credited in the UI. See
docs/plans/2026-07-18-streek-biodiversity.md.

Usage:
  python -m scripts.import_streken            # fetch + write snapshot
  python -m scripts.import_streken --check    # fail if the snapshot is stale
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import httpx

BASE = "https://streektuinen.nl/wp-json/wp/v2"
OUT = Path(__file__).parent.parent / "data" / "streken_source.json"

# The map-polygon id is the stable join key to our georeferenced boundaries.
# A few streektuinen taxonomy slugs differ from their public-page / map slug;
# normalise the taxonomy slug to the map-polygon id here.
TAXONOMY_TO_MAP_SLUG = {
    "vechtstreek": "vechtdal",
    "gelderse-poort-en-pannerden": "gelderse-poort",
}


def _get(client: httpx.Client, path: str, **params) -> list[dict]:
    """GET a WP REST collection, following pagination via X-WP-TotalPages."""
    params.setdefault("per_page", 100)
    out: list[dict] = []
    page = 1
    while True:
        resp = client.get(f"{BASE}/{path}", params={**params, "page": page})
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        out.extend(batch)
        total_pages = int(resp.headers.get("X-WP-TotalPages", "1"))
        if page >= total_pages:
            break
        page += 1
        time.sleep(0.3)  # be polite to a small NGO site
    return out


def map_slug(taxonomy_slug: str) -> str:
    return TAXONOMY_TO_MAP_SLUG.get(taxonomy_slug, taxonomy_slug)


def build_snapshot(client: httpx.Client) -> dict:
    regions = _get(client, "regions-categories")
    spec_cats = _get(client, "species-category")
    species = _get(client, "species")

    cat_by_id = {c["id"]: c["slug"] for c in spec_cats}          # 14→flora, 15→fauna
    region_slug_by_id = {r["id"]: map_slug(r["slug"]) for r in regions}

    streken = [
        {
            "slug": map_slug(r["slug"]),
            "taxonomy_slug": r["slug"],
            "name": r["name"],
            "species_count": r.get("count", 0),
        }
        for r in sorted(regions, key=lambda r: map_slug(r["slug"]))
    ]

    out_species = []
    for s in species:
        cats = [cat_by_id.get(cid) for cid in (s.get("species-category") or [])]
        category = "fauna" if "fauna" in cats else ("flora" if "flora" in cats else None)
        region_slugs = sorted(
            region_slug_by_id[rid]
            for rid in (s.get("regions-categories") or [])
            if rid in region_slug_by_id
        )
        out_species.append({
            "name_nl": _clean(s["title"]["rendered"]),
            "slug": s["slug"],
            "category": category,
            "streek_slugs": region_slugs,
        })
    out_species.sort(key=lambda s: (s["category"] or "", s["name_nl"].lower()))

    return {
        "source": "streektuinen.nl",
        "source_url": "https://streektuinen.nl/streken/",
        "license_note": (
            "Streek indeling & icoonsoorten © streektuinen.nl "
            "(Urgenda, De Vlinderstichting, Cruydt-Hoeck e.a.). "
            "Used with attribution for a private garden app."
        ),
        "streken": streken,
        "species": out_species,
    }


def _clean(s: str) -> str:
    import html
    return html.unescape(s).strip()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="fail (exit 1) if the committed snapshot differs from live")
    args = ap.parse_args()

    with httpx.Client(timeout=30, headers={"User-Agent": "floreren.app streek import"}) as client:
        snap = build_snapshot(client)

    text = json.dumps(snap, ensure_ascii=False, indent=2) + "\n"

    if args.check:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if current != text:
            print("streken_source.json is STALE — re-run `python -m scripts.import_streken`")
            return 1
        print("streken_source.json is up to date.")
        return 0

    OUT.write_text(text, encoding="utf-8")
    flora = sum(1 for s in snap["species"] if s["category"] == "flora")
    fauna = sum(1 for s in snap["species"] if s["category"] == "fauna")
    print(f"Wrote {OUT} — {len(snap['streken'])} streken, "
          f"{len(snap['species'])} icoonsoorten ({flora} flora / {fauna} fauna).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
