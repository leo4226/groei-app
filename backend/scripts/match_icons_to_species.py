"""Match manifest icons to plant_species by scientific name.

Inserts species for icons that don't have a matching plant_species record.
Idempotent — skips already-matched icons, uses ON CONFLICT for safety.

Run: cd backend && .venv/bin/python scripts/match_icons_to_species.py
"""
import asyncio
import json
import os
import re
import sys

# Allow running from backend/ or backend/scripts/
if os.path.dirname(__file__).endswith("scripts"):
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
else:
    sys.path.insert(0, ".")

from database import init_pool, close_pool, get_db

MANIFEST_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "frontend", "public", "icons", "manifest.json"
)

_FORM_SUFFIXES = re.compile(r"_(bare|potted|nopot|fruit|portrait)$")
_NON_PLANT_ICONS = {
    "seed", "onkruid", "wildebloemen", "leon",
    "state_thirsty", "state_chilling", "state_hydrated",
    "state_comfortable", "state_heatstress", "state_freezing",
    "state_dry",
    "growth_mature", "growth_sprout", "growth_young",
    "growth_seed", "growth_seedling", "growth_established",
}


def norm(s: str) -> str:
    return re.sub(r"[^a-z]", "", (s or "").lower())


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"\s+", "-", text)
    return text


async def main():
    # Load .env manually
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, val = line.partition("=")
                    val = val.strip().strip('"').strip("'")
                    if key not in os.environ:
                        os.environ[key] = val

    with open(MANIFEST_PATH) as f:
        manifest = json.load(f)["plants"]

    # Deduplicate: skip variants
    unique_icons = {}
    for entry in manifest:
        if entry.get("variant_of"):
            continue
        unique_icons[entry["id"]] = entry

    # Base icons only (no form suffixes, no non-plant icons)
    base_icons = [
        e for e in unique_icons.values()
        if not _FORM_SUFFIXES.search(e["id"]) and e["id"] not in _NON_PLANT_ICONS
    ]

    await init_pool()
    try:
        async with get_db() as db:
            existing = await db.execute_fetchall(
                "SELECT slug, latin_name FROM plant_species WHERE latin_name IS NOT NULL"
            )
            existing_norm = {norm(r["latin_name"]): r["slug"] for r in existing if r.get("latin_name")}
            existing_slugs = {r["slug"] for r in existing}

            to_insert = []
            already_matched = []

            for entry in sorted(base_icons, key=lambda e: e.get("sci", "")):
                sci = entry.get("sci", "").strip()
                sci_norm = norm(sci)

                if not sci_norm:
                    continue  # skip state/growth icons (already filtered, but defensive)

                if sci_norm in existing_norm:
                    already_matched.append((entry["id"], entry.get("name", ""), sci))
                    continue

                # Generate slug from icon name
                slug = slugify(entry.get("name", entry["id"]))
                if slug in existing_slugs:
                    slug = f"{slug}-{entry['id']}"

                cat = entry.get("cat", "unknown")
                climate = "tropical" if cat in ("houseplant", "succulent") else "temperate"

                to_insert.append({
                    "slug": slug,
                    "common_name_nl": entry.get("name", entry["id"]),
                    "common_name_en": entry.get("name", entry["id"]),
                    "latin_name": sci,
                    "climate_zone": climate,
                    "icon_id": entry["id"],
                })

            inserted = 0
            conflict_count = 0
            error_count = 0

            for plant in to_insert:
                try:
                    result = await db.execute(
                        """INSERT INTO plant_species
                           (slug, common_name_nl, common_name_en, latin_name, climate_zone)
                           VALUES ($1, $2, $3, $4, $5)
                           ON CONFLICT (slug) DO NOTHING""",
                        (plant["slug"], plant["common_name_nl"], plant["common_name_en"],
                         plant["latin_name"], plant["climate_zone"]),
                    )
                    # DbAdapter adds RETURNING id; lastrowid is set if inserted, None if conflict
                    if result.lastrowid is not None:
                        inserted += 1
                    else:
                        conflict_count += 1
                except Exception as exc:
                    print(f"  ERROR {plant['slug']}: {exc}")
                    error_count += 1

            await db.commit()

            # Summary
            total_result = await db.execute_fetchall("SELECT COUNT(*) as cnt FROM plant_species")
            total_count = total_result[0]["cnt"] if total_result else "?"

            print(f"Manifest base icons: {len(base_icons)}")
            print(f"Already matched (skipped): {len(already_matched)}")
            print(f"To insert: {len(to_insert)}")
            print(f"  Inserted: {inserted}")
            print(f"  Conflicts (duplicate slug): {conflict_count}")
            print(f"  Errors: {error_count}")
            print(f"Total plant_species: {total_count}")

            if inserted > 0:
                print(f"\nNewly inserted species:")
                for p in to_insert:
                    print(f"  {p['icon_id']}: {p['common_name_nl']} → {p['latin_name']}")
    finally:
        await close_pool()


if __name__ == "__main__":
    asyncio.run(main())
