import json
import os
import re

from fastapi import APIRouter, Depends

from database import db_dep

router = APIRouter(prefix="/icon-catalog", tags=["icons"])

ICONS_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "icons"))
MANIFEST_PATH = os.path.join(ICONS_DIR, "manifest.json")


def load_manifest() -> list[dict]:
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data["plants"] if isinstance(data, dict) else data


def save_manifest(entries: list[dict]) -> None:
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict):
        data["plants"] = entries
        data["count"] = len(entries)
        data["iconCount"] = len(entries)
    else:
        data = entries
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def _normalize(text: str) -> str:
    """Lowercase, strip non-alphanumeric chars."""
    return re.sub(r"[^a-z0-9]", "", text.lower())


_FORM_SUFFIXES = re.compile(r"_(bare|potted|nopot|fruit|portrait)$")


def find_variant(icon_key: str | None, target_form: str) -> str | None:
    """Return the icon_id for the given form variant of icon_key.
    Falls back to the original icon_key if no matching variant exists."""
    if not icon_key:
        return icon_key
    base = _FORM_SUFFIXES.sub("", icon_key)
    manifest = load_manifest()
    for entry in manifest:
        entry_base = _FORM_SUFFIXES.sub("", entry["id"])
        if entry_base == base and entry.get("form") == target_form:
            return entry["id"]
    return icon_key


# Dutch common name → icon_id  (covers the most-used Dutch plant names)
DUTCH_TO_ICON: dict[str, str] = {
    # Houseplants
    "gatenplant": "monstera",
    "vrouwentong": "snake",
    "slangenplant": "snake",
    "rubberplant": "rubber",
    "rubberboom": "rubber",
    "lepelplant": "peacelily",
    "vredeslelie": "peacelily",
    "lintenplant": "spider",
    "graslelie": "spider",
    "areca": "areca",
    "arecapalm": "areca",
    "dwergpalm": "parlor",
    # Ferns
    "varen": "bostonfern",
    "bosvaren": "bostonfern",
    "bostonvaren": "bostonfern",
    "nestervaren": "birdnest",
    "vogelnest": "birdnest",
    # Succulents
    "aloevera": "aloe",
    "aloe": "aloe",
    "vetplant": "echeveria",
    "parelenketting": "stringpearls",
    "vijgencactus": "prickly",
    "cactus": "cactus",
    # Flowers
    "orchidee": "orchid",
    "vlinderorachidee": "orchid",
    "afrikaaansviooltje": "africanviolet",
    "afrikaansviooltje": "africanviolet",
    "tulp": "tulip",
    "narcis": "daffodil",
    "hyacint": "hyacinth",
    "krokus": "crocus",
    "sneeuwklokje": "snowdrop",
    "sierui": "allium",
    "zonnebloem": "sunflower",
    "reuzenzonnebloem": "sunflower",
    "klaproos": "poppy",
    "margriet": "daisy",
    "vingerhoedskruid": "foxglove",
    "pioenroos": "peony",
    "pioen": "peony",
    "korenbloem": "cornflower",
    "geranium": "geranium",
    "pelargonium": "geranium",
    "begonia": "begonia",
    "afrikaantje": "marigold",
    "viooltje": "pansy",
    "fuchsia": "fuchsia",
    "dahlia": "dahlia",
    "petunia": "petunia",
    "vergeetmijniet": "forgetmenot",
    "bosrank": "clematis",
    # Trees & Shrubs
    "bonsai": "bonsai",
    "bamboe": "bamboo",
    "eik": "oak",
    "zomereik": "oak",
    "berk": "birch",
    "zilverberk": "birch",
    "beuk": "beech",
    "europesbeuk": "beech",
    "wilg": "willow",
    "treurwilg": "willow",
    "esdoorn": "maple",
    "esdoornboom": "maple",
    "hortensia": "hydrangea",
    "roos": "rose",
    "heide": "heather",
    "klimop": "ivy",
    "hulst": "holly",
    "laurier": "laurel",
    "baylaurier": "laurel",
    "laurierboom": "laurel",
    "pluimgras": "silvergrass",
    "chineespluimgras": "silvergrass",
    "siergrassen": "silvergrass",
    "vijgenboom": "figtree",
    "vijg": "figtree",
    "buxus": "boxwood",
    "populier": "oak",  # best available tree icon
    # Herbs
    "lavendel": "lavender",
    "rozemarijn": "rosemary",
    "tijm": "thyme",
    "basilicum": "basil",
    "munt": "mint",
    "kruizemunt": "mint",
    # Edible
    "tomaat": "tomato",
    "bruineboon": "brownbean",
    "boon": "brownbean",
    "avocado": "avocado",
    "avocadoboom": "avocado",
    "aardbei": "strawberry",
    "wortel": "carrot",
    "sla": "lettuce",
    "kropsla": "lettuce",
    "paprika": "pepper",
    "peper": "pepper",
    "pompoen": "pumpkin",
    "courgette": "zucchini",
    "komkommer": "cucumber",
    "radijs": "radish",
    "aardappel": "potato",
    "bosbes": "blueberry",
    "blauwebes": "blueberry",
    "knoflook": "garlic",
    "ui": "onion",
    "mais": "corn",
    "maiskolf": "corn",
    "framboos": "raspberry",
    "frambozenstruik": "raspberry",
    # Common partial names / alternative spellings
    "ijzerhard": "daisy",        # Verbena → closest available
    "stijfijzerhard": "daisy",
    "oleander": "rose",          # no oleander icon → rose is closest shrub flower
    "camellia": "rose",          # no camellia icon → rose
}


@router.get("")
async def get_catalog():
    """Return all icons from the manifest, sorted by name."""
    entries = load_manifest()
    return sorted(entries, key=lambda e: e.get("name", e["id"]).lower())


@router.post("/sync")
async def sync_icons(db = Depends(db_dep)):
    """
    1. Scan the icons folder for new SVGs and add them to manifest.json.
    2. Auto-match plants that have no icon_key by comparing plant name/species
       against icon ids and names.
    Returns a summary of what changed.
    """
    # --- Step 1: discover new SVGs ---
    manifest = load_manifest()
    manifest_ids = {entry["id"] for entry in manifest}

    svg_ids = sorted(
        f[:-4]  # strip .svg
        for f in os.listdir(ICONS_DIR)
        if f.lower().endswith(".svg")
    )

    new_entries: list[dict] = []
    for icon_id in svg_ids:
        if icon_id not in manifest_ids:
            pretty_name = icon_id.replace("_", " ").title()
            entry = {
                "id": icon_id,
                "name": pretty_name,
                "sci": "",
                "cat": "unknown",
                "family": "",
                "file": f"{icon_id}.svg",
            }
            manifest.append(entry)
            new_entries.append(entry)

    if new_entries:
        save_manifest(manifest)

    # --- Step 2: build lookup table (normalized text → icon_id) ---
    lookup: dict[str, str] = {}
    for entry in manifest:
        for text in [entry["id"], entry.get("name", ""), entry.get("sci", ""), entry.get("name_nl", "")]:
            if text:
                lookup[_normalize(text)] = entry["id"]
    # Also add Dutch common names
    for dutch_norm, icon_id in DUTCH_TO_ICON.items():
        lookup[_normalize(dutch_norm)] = icon_id

    # --- Step 3: match unassigned plants ---
    matched: list[dict] = []
    plants = await db.execute_fetchall(
        "SELECT id, name, species FROM plants WHERE is_active = 1 AND (icon_key IS NULL OR icon_key = '')"
    )

    for row in plants:
        plant = dict(row)
        found_key: str | None = None

        for text in [plant["name"], plant.get("species") or ""]:
            if not text:
                continue
            norm = _normalize(text)

            # 1. Exact match
            if norm in lookup:
                found_key = lookup[norm]
                break

            # 2. Prefix match (plant name starts with icon key or vice versa)
            for icon_norm, icon_id in lookup.items():
                if icon_norm and (
                    norm.startswith(icon_norm) or icon_norm.startswith(norm)
                ):
                    found_key = icon_id
                    break

            if found_key:
                break

        if found_key:
            await db.execute(
                "UPDATE plants SET icon_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (found_key, plant["id"]),
            )
            matched.append({
                "plant_id": plant["id"],
                "plant_name": plant["name"],
                "icon_key": found_key,
            })

    unmatched = [
        {"plant_id": dict(row)["id"], "plant_name": dict(row)["name"]}
        for row in plants
        if not any(m["plant_id"] == dict(row)["id"] for m in matched)
    ]

    if matched:
        await db.commit()

    return {
        "total_icons": len(manifest),
        "new_icons": len(new_entries),
        "new_icon_ids": [e["id"] for e in new_entries],
        "matched_plants": len(matched),
        "matches": matched,
        "unmatched_plants": len(unmatched),
        "unmatched": unmatched,
    }
