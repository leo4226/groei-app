import json
import os
import re

from fastapi import APIRouter, Depends, HTTPException

from database import db_dep
from auth import get_current_account
from services.icon_catalog import load_catalog

router = APIRouter(prefix="/icon-catalog", tags=["icons"])

# Allow override via env var; fallback works both locally (dev) and in Docker (prod).
# backend/routers/ is two levels under the repo root, hence two ".." to reach it.
ICONS_DIR = os.environ.get(
    "ICONS_DIR",
    os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "public", "icons")),
)
MANIFEST_PATH = os.path.join(ICONS_DIR, "manifest.json")


def load_manifest() -> list[dict]:
    if not os.path.exists(MANIFEST_PATH):
        return []
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data["plants"] if isinstance(data, dict) else data


def _normalize(text: str) -> str:
    """Lowercase, strip non-alphanumeric chars."""
    return re.sub(r"[^a-z0-9]", "", text.lower())


_FORM_SUFFIXES = re.compile(r"_(bare|potted|nopot|fruit|portrait)$")


def _needs_real_icon(icon_key, valid_ids) -> bool:
    """True if a plant lacks a usable icon: no key at all, a category placeholder,
    or a key that no longer resolves to any catalog entry — i.e. a dangling/stale
    key (e.g. a slugified name left over from the old ephemeral-disk generation)."""
    if not icon_key or str(icon_key).startswith("placeholder"):
        return True
    return icon_key not in valid_ids


async def find_variant(db, icon_key: str | None, target_form: str) -> str | None:
    """Return the icon_id for the given form variant of icon_key, across the
    unified catalog (curated + generated). Falls back to icon_key."""
    if not icon_key:
        return icon_key
    base = _FORM_SUFFIXES.sub("", icon_key)
    catalog = await load_catalog(db)
    for entry in catalog:
        entry_base = _FORM_SUFFIXES.sub("", entry["id"])
        if entry_base == base and entry.get("form") == target_form:
            return entry["id"]
    return icon_key


async def resolve_placement_icon(db, icon_key: str | None, *, container_id: int | None) -> str | None:
    """Pick the right icon variant for a Plant's placement context.

    Form rule (CONTEXT.md): a Plant inside a Container uses `potted`, otherwise
    `bare`. Phase and Zone-type-based auto-selection are future work — when added,
    they belong here as additional kwargs.
    """
    target_form = "potted" if container_id is not None else "bare"
    return await find_variant(db, icon_key, target_form)


async def match_icon_key(db, name: str, species: str | None) -> str | None:
    """Best-effort icon_key for a plant by name/species. None if no match."""
    catalog = await load_catalog(db)
    lookup: dict[str, str] = {}
    for entry in catalog:
        # Only match the base icon — form variants (_bare/_potted, variant_of)
        # share a plant's name/sci and would otherwise shadow the base. A plant's
        # icon_key is always the base; placement derives the bare/potted form.
        if entry.get("variant_of") or _FORM_SUFFIXES.search(entry["id"]):
            continue
        for text in [entry["id"], entry.get("name", ""), entry.get("sci", ""), entry.get("name_nl", "")]:
            if text:
                lookup[_normalize(text)] = entry["id"]
    for dutch_norm, icon_id in DUTCH_TO_ICON.items():
        lookup[_normalize(dutch_norm)] = icon_id
    for text in [name, species or ""]:
        if not text:
            continue
        norm = _normalize(text)
        if norm in lookup:
            return lookup[norm]
        for icon_norm, icon_id in lookup.items():
            if icon_norm and (norm.startswith(icon_norm) or icon_norm.startswith(norm)):
                return icon_id
    return None


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
    "chinesewaaierpalm": "areca",  # Chinese fan palm → closest palm icon
    "chinesewaaierplant": "areca",
    "waaierpalm": "areca",
    "waaierplant": "areca",
    "vijgenboom": "figtree",
    "vijg": "figtree",
    "buxus": "boxwood",
    "populier": "poplar",       # now has dedicated icon
    # Herbs
    "lavendel": "lavender",
    "rozemarijn": "rosemary",
    "tijm": "thyme",
    "basilicum": "basil",
    "munt": "mint",
    "kruizemunt": "mint",
    "citroenmelisse": "mint",      # lemon balm — same Lamiaceae family as mint
    "melisse": "mint",
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
    "camellia": "camellia",       # now has dedicated icon
    "struisvaren": "malefern",   # malefern = "Mannetjesvaren", closest match for Ostrich Fern
    "schijnaardbei": "strawberry", # Indian mock strawberry → strawberry icon
}


@router.get("")
async def get_catalog(db=Depends(db_dep)):
    """Return all icons (curated + generated), each with a url, sorted by name."""
    entries = await load_catalog(db)
    return sorted(entries, key=lambda e: e.get("name", e["id"]).lower())


@router.post("/sync")
async def sync_icons(db = Depends(db_dep)):
    """Re-match plants that lack a usable icon against the unified catalog.

    Targets plants that are flagged, placeholdered, icon-less, OR carry a dangling
    icon_key that no longer resolves to a real icon (stale keys from the old
    ephemeral-disk era) — and reassigns them to a real curated/generated icon when
    one exists. Does NOT touch the filesystem. Idempotent."""
    valid_ids = {e["id"] for e in await load_catalog(db)}
    plants = await db.execute_fetchall(
        "SELECT id, name, species, icon_key, icon_requested FROM plants WHERE is_active = 1"
    )
    candidates = [dict(r) for r in plants
                  if r["icon_requested"] or _needs_real_icon(r["icon_key"], valid_ids)]
    matched: list[dict] = []
    for plant in candidates:
        found = await match_icon_key(db, plant["name"], plant.get("species"))
        if found and found in valid_ids and not found.startswith("placeholder"):
            await db.execute(
                "UPDATE plants SET icon_key = ?, icon_requested = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (found, plant["id"]))
            matched.append({"plant_id": plant["id"], "plant_name": plant["name"], "icon_key": found})
    if matched:
        await db.commit()
    unmatched = [{"plant_id": p["id"], "plant_name": p["name"]}
                 for p in candidates if not any(m["plant_id"] == p["id"] for m in matched)]
    return {"matched_plants": len(matched), "matches": matched,
            "unmatched_plants": len(unmatched), "unmatched": unmatched}


@router.get("/gaps")
async def get_icon_gaps(db=Depends(db_dep), account=Depends(get_current_account)):
    """Return three gap lists:
    - requested: plants that asked for an icon but don't have one yet
    - species_without_icon: plant_species entries with no matching icon in the manifest
    - icons_without_species: base icons in the manifest not matched to any species
    """
    manifest = load_manifest()

    # Build set of scientific names in the manifest (normalised) → icon_id
    sci_to_icon: dict[str, str] = {}
    for entry in manifest:
        sci = entry.get("sci", "")
        if sci:
            sci_to_icon[_normalize(sci)] = entry["id"]

    # Base icons only (exclude form variants like _bare, _potted, etc.)
    base_icons = [e for e in manifest if not _FORM_SUFFIXES.search(e["id"]) and not e.get("variant_of")]

    # 1. requested — plants that lack a usable icon: flagged, placeholdered, missing,
    #    or carrying a dangling icon_key that no longer resolves to a real icon.
    valid_ids = {e["id"] for e in await load_catalog(db)}
    requested_rows = await db.execute_fetchall(
        "SELECT id, name, species, icon_key, icon_requested FROM plants WHERE is_active = 1"
    )
    requested = [{"id": r["id"], "name": r["name"], "species": r["species"]}
                 for r in requested_rows
                 if r["icon_requested"] or _needs_real_icon(r["icon_key"], valid_ids)]

    # 2. species_without_icon — plant_species entries with no matching manifest icon
    species_rows = await db.execute_fetchall(
        "SELECT id, common_name_nl, latin_name FROM plant_species ORDER BY common_name_nl"
    )
    species_without_icon = []
    for row in species_rows:
        latin = row["latin_name"] or ""
        if not latin or _normalize(latin) not in sci_to_icon:
            species_without_icon.append({"id": row["id"], "name": row["common_name_nl"], "latin": latin or None})

    # 3. icons_without_species — base icons not referenced by any plant_species
    latin_norms = {_normalize(r["latin_name"]) for r in species_rows if r["latin_name"]}
    icons_without_species = [
        {"id": e["id"], "name": e.get("name", e["id"]), "sci": e.get("sci") or None}
        for e in base_icons
        if _normalize(e.get("sci", "")) not in latin_norms
    ]

    return {
        "requested": requested,
        "species_without_icon": species_without_icon,
        "icons_without_species": icons_without_species,
    }


@router.patch("/request/{plant_id}")
async def request_icon(plant_id: int, db=Depends(db_dep), account=Depends(get_current_account)):
    """Flag a plant as needing an icon."""
    row = await db.execute_fetchall("SELECT id FROM plants WHERE id = ? AND is_active = 1", (plant_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Plant not found")
    await db.execute("UPDATE plants SET icon_requested = TRUE WHERE id = ?", (plant_id,))
    await db.commit()
    return {"status": "requested", "plant_id": plant_id}
