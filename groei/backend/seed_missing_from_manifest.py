"""Seed plant_species with all plants from icons/manifest.json that are currently missing.

Also adds user-requested plants: Tabaksplant, Dracaena Compacta.
Updates Vrouwentong to modern scientific name.

Run: cd groei/backend && python seed_missing_from_manifest.py
Idempotent — ON CONFLICT (slug) DO NOTHING, safe to re-run.
"""

import json
import sqlite3
import os
import re

MANIFEST_PATH = os.path.join(os.path.dirname(__file__), "..", "icons", "manifest.json")
DB_PATH = os.path.join(os.path.dirname(__file__), "floreren.db")


def load_manifest():
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        return json.load(f)["plants"]


def slugify(text):
    """Generate a URL-friendly slug from text."""
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"\s+", "-", text)
    return text


def norm(s):
    return re.sub(r"[^a-z]", "", (s or "").lower())


# Dutch names for manifest plants (icon_id → (name_nl, slug))
DUTCH_NAMES = {
    "africanviolet": ("Afrikaans viooltje", "afrikaans-viooltje"),
    "aloe": ("Aloë vera", "aloe-barbadensis"),
    "areca": ("Arecapalm", "arecapalm"),
    "beech": ("Beuk", "beuk"),
    "begonia": ("Begonia", "begonia-semperflorens"),
    "birch": ("Zilverberk", "zilverberk"),
    "birdnest": ("Nestvaren", "nestvaren"),
    "blueberry": ("Blauwe bes", "blauwe-bes"),
    "bonsai": ("Bonsai", "bonsai-ficus"),
    "boxwood": ("Buxus", "buxus"),
    "bromeliad": ("Bromelia", "bromelia"),
    "cactus": ("Ton-cactus", "ton-cactus"),
    "calathea": ("Calathea", "calathea"),
    "corn": ("Mais", "mais"),
    "cornflower": ("Korenbloem", "korenbloem"),
    "daisy": ("Madeliefje", "madeliefje"),
    "echeveria": ("Echeveria", "echeveria"),
    "fiddle": ("Vioolbladplant", "vioolbladplant"),
    "forgetmenot": ("Vergeet-mij-nietje", "vergeet-mij-nietje"),
    "foxglove": ("Vingerhoedskruid", "vingerhoedskruid"),
    "garlic": ("Knoflook", "knoflook"),
    "geranium": ("Geranium", "geranium-pelargonium"),
    "heather": ("Struikheide", "struikheide"),
    "holly": ("Hulst", "hulst"),
    "jade": ("Jadeplant", "jadeplant"),
    "liriope": ("Leliegras", "leliegras-liriope"),
    "maple": ("Esdoorn", "esdoorn"),
    "marigold": ("Afrikaantje", "afrikaantje"),
    "onion": ("Ui", "ui"),
    "pansy": ("Viooltje", "viooltje"),
    "parlor": ("Dwergpalm", "dwergpalm"),
    "peony": ("Pioenroos", "pioenroos-paeonia"),
    "petunia": ("Petunia", "petunia"),
    "philo": ("Hartbladphilodendron", "hartbladphilodendron"),
    "poppy": ("Klaproos", "klaproos"),
    "prickly": ("Schijfcactus", "schijfcactus"),
    "radish": ("Radijs", "radijs"),
    "rosemary": ("Rozemarijn", "salvia-rosmarinus"),
    "snake": ("Vrouwentong", "vrouwentong"),
    "snowdrop": ("Sneeuwklokje", "sneeuwklokje"),
    "stringpearls": ("Erwtenplant", "erwtenplant"),
    "wallflower": ("Muurbloem", "muurbloem-erysimum"),
    "willow": ("Treurwilg", "treurwilg"),
}

# Plants that DON'T have icons but the user wants
EXTRA_PLANTS = [
    {
        "slug": "tabaksplant",
        "common_name_nl": "Tabaksplant",
        "common_name_en": "Ornamental Tobacco",
        "latin_name": "Nicotiana alata",
        "climate_zone": "temperate",
    },
    {
        "slug": "dracaena-compacta",
        "common_name_nl": "Dracaena Compacta",
        "common_name_en": "Compact Dracaena",
        "latin_name": "Dracaena fragrans 'Compacta'",
        "climate_zone": "tropical",
    },
]


def main():
    manifest = load_manifest()

    # Deduplicate: skip variant entries
    unique_icons = {}
    for entry in manifest:
        if entry.get("variant_of"):
            continue
        unique_icons[entry["id"]] = entry

    db = sqlite3.connect(DB_PATH)

    # Get existing latin names and slugs
    existing = db.execute("SELECT slug, latin_name FROM plant_species").fetchall()
    existing_slugs = {r[0] for r in existing}
    existing_latin_norm = {norm(r[1]): r[0] for r in existing if r[1]}

    # Find which icon plants are missing
    to_insert = []
    already = []

    for icon_id, entry in sorted(unique_icons.items()):
        sci = entry.get("sci", "")
        sci_norm = norm(sci)

        # Skip if latin name already exists
        if sci_norm and sci_norm in existing_latin_norm:
            already.append((icon_id, entry["name"], "latin match"))
            continue

        # Skip brownbean_nopot (no scientific name)
        if icon_id == "brownbean_nopot":
            continue

        # Get Dutch name and slug
        dutch_info = DUTCH_NAMES.get(icon_id)
        if dutch_info:
            name_nl, slug = dutch_info
        else:
            name_nl = entry["name"]
            slug = slugify(entry["name"])

        # Ensure unique slug
        if slug in existing_slugs:
            slug = f"{slug}-{icon_id}"

        to_insert.append({
            "slug": slug,
            "common_name_nl": name_nl,
            "common_name_en": entry["name"],
            "latin_name": sci,
            "climate_zone": "tropical" if entry.get("cat") in ("houseplant", "succulent") else "temperate",
            "icon_id": icon_id,
        })

    # Insert missing icon plants
    added = 0
    for plant in to_insert:
        try:
            db.execute(
                """INSERT INTO plant_species
                   (slug, common_name_nl, common_name_en, latin_name, climate_zone)
                   VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT (slug) DO NOTHING""",
                (plant["slug"], plant["common_name_nl"], plant["common_name_en"],
                 plant["latin_name"], plant["climate_zone"]),
            )
            if db.changes():
                added += 1
        except Exception as e:
            print(f"  ERROR inserting {plant['slug']}: {e}")

    # Insert extra plants (no icons)
    extra_added = 0
    for plant in EXTRA_PLANTS:
        try:
            db.execute(
                """INSERT INTO plant_species
                   (slug, common_name_nl, common_name_en, latin_name, climate_zone)
                   VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT (slug) DO NOTHING""",
                (plant["slug"], plant["common_name_nl"], plant["common_name_en"],
                 plant["latin_name"], plant["climate_zone"]),
            )
            if db.changes():
                extra_added += 1
        except Exception as e:
            print(f"  ERROR inserting {plant['slug']}: {e}")

    db.commit()

    # Update Vrouwentong scientific name (modern taxonomy)
    updated_snake = db.execute(
        """UPDATE plant_species SET latin_name = 'Dracaena trifasciata'
           WHERE slug = 'vrouwentongen' AND latin_name = 'Sansevieria trifasciata'"""
    ).rowcount

    # Also check if there's a duplicate vrouwentong entry now
    snake_entries = db.execute(
        "SELECT id, slug, latin_name FROM plant_species WHERE slug IN ('vrouwentong', 'vrouwentongen')"
    ).fetchall()

    db.commit()

    # Summary
    total = db.execute("SELECT COUNT(*) FROM plant_species").fetchone()[0]
    print(f"Manifest unique plants: {len(unique_icons)}")
    print(f"Already in DB: {len(already)}")
    print(f"Added from manifest: {added}")
    print(f"Added extra (user-requested): {extra_added}")
    print(f"Updated Vrouwentong latin name: {updated_snake > 0}")
    print(f"Total plant_species now: {total}")
    print()

    if snake_entries:
        print("Snake plant / Vrouwentong entries:")
        for s in snake_entries:
            print(f"  id={s[0]} slug={s[1]} latin={s[2]}")

    # Verify user-requested plants
    print()
    print("User-requested plants check:")
    for name_nl in ["Vrouwentong", "Tabaksplant", "Dracaena Compacta",
                    "Lepelplant", "Hartbladphilodendron", "Drakenklimop"]:
        rows = db.execute(
            "SELECT id, slug, common_name_nl, latin_name FROM plant_species WHERE common_name_nl LIKE ?",
            (f"%{name_nl}%",)
        ).fetchall()
        if rows:
            for r in rows:
                print(f"  FOUND: id={r[0]} slug={r[1]} name={r[2]} latin={r[3]}")
        else:
            print(f"  MISSING: {name_nl}")

    db.close()


if __name__ == "__main__":
    main()