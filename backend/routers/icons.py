import json
import os
import re

from fastapi import APIRouter, Depends, HTTPException

from database import db_dep
from auth import get_current_account, require_admin
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


async def resolve_placement_icon(
    db,
    icon_key: str | None,
    *,
    container_id: int | None,
    ground_zone_id: str | None = None,
    pot_size_cm: int | None = None,
) -> str | None:
    """Pick the right icon variant for a Plant's placement context.

    Form rule (CONTEXT.md):
      - inside a plant-bed Zone (ground_zone_id) → bare
      - inside a container object (container_id)  → potted
      - free / open-ground placement              → PRESERVE the current form

    Free placement deliberately does NOT reset the form. A lingering `pot_size_cm`
    used to force "potted" here, which silently reverted an explicit bare choice
    on every open-ground move (the potted/bare drift bug). `pot_size_cm` is still
    accepted for call-site compatibility but no longer influences the icon.
    """
    if ground_zone_id is not None:
        target_form = "bare"
    elif container_id is not None:
        target_form = "potted"
    else:
        # Neither a bed nor a container: keep whatever the plant already is, so an
        # explicit bare (or potted) choice survives an open-ground move.
        return icon_key
    return await find_variant(db, icon_key, target_form)


def _is_base_icon(entry: dict) -> bool:
    return not entry.get("variant_of") and not _FORM_SUFFIXES.search(entry["id"])


def _entry_match_texts(entry: dict) -> list[str]:
    return [entry["id"], entry.get("name", ""), entry.get("sci", ""), entry.get("name_nl", "")]


def _exact_ai_generated_match(catalog: list[dict], name: str, species: str | None) -> str | None:
    """Return an exact, distinctive generated icon for this plant if one exists.

    This is stricter than the generic matching fallback: only base generated icons
    with source='ai' qualify, and they must exactly match the plant name or
    species/scientific text after normalisation. Procedural rows are fallback
    placeholders and must not block future AI retries or upgrade generic icons.
    """
    wanted = {_normalize(text) for text in [name, species or ""] if text}
    if not wanted:
        return None
    for entry in catalog:
        if entry.get("source") != "ai" or not _is_base_icon(entry):
            continue
        if any(_normalize(text) in wanted for text in _entry_match_texts(entry) if text):
            return entry["id"]
    return None


def _form_of(icon_key: str | None, catalog: list[dict]) -> str | None:
    """Form ('bare'/'potted'/…) of a plant's current icon: from its catalog entry
    when the key still resolves, else from the key's form suffix (dangling keys)."""
    if not icon_key:
        return None
    for entry in catalog:
        if entry["id"] == icon_key:
            return entry.get("form")
    match = _FORM_SUFFIXES.search(icon_key)
    return match.group(1) if match else None


async def _with_preserved_form(db, catalog: list[dict], new_key: str, current_key: str | None) -> str:
    """Re-apply the plant's current bare/potted form to a newly assigned icon.

    Sync matching always lands on a base icon, and for generated icons the base
    IS the potted drawing — assigning it verbatim would flip an explicit bare
    choice back to potted (the recurring pot-comes-back bug). find_variant falls
    back to the base when the target form doesn't exist for the new icon.
    """
    form = _form_of(current_key, catalog)
    if form in ("bare", "potted"):
        return await find_variant(db, new_key, form)
    return new_key


async def sync_match_icon_key(
    db,
    plant: dict,
    *,
    catalog: list[dict] | None = None,
    valid_ids: set[str] | None = None,
) -> str | None:
    """Icon key that Settings/Admin sync should apply for a plant.

    Priority 1: upgrade to an exact AI-generated icon if one already exists, even
    when the current icon is otherwise valid but generic/shared.
    Priority 2: preserve legacy sync behaviour for requested/missing/placeholder/
    dangling icons by falling back to best-effort catalog matching.
    Priority 3: when the plant is linked to a species (species_id), look up the
    species' latin/common names and try matching against the catalog — this
    catches plants whose user-entered name/species text doesn't fuzzy-match but
    whose species already has a generated icon.

    Both paths are form-preserving: a plant already on a form variant of its
    exact icon (e.g. wallflower_bare vs wallflower) is NOT "upgraded" to the
    base, and any newly assigned icon keeps the plant's current bare/potted form.
    """
    catalog = catalog if catalog is not None else await load_catalog(db)
    valid_ids = valid_ids if valid_ids is not None else {e["id"] for e in catalog}

    current_key = plant.get("icon_key")
    current_base = _FORM_SUFFIXES.sub("", current_key) if current_key else None

    exact_generated = _exact_ai_generated_match(catalog, plant["name"], plant.get("species"))
    if exact_generated and exact_generated not in (current_key, current_base):
        return await _with_preserved_form(db, catalog, exact_generated, current_key)

    if plant.get("icon_requested") or _needs_real_icon(current_key, valid_ids):
        matched = await match_icon_key(db, plant["name"], plant.get("species"))
        if matched:
            return await _with_preserved_form(db, catalog, matched, current_key)

        # Fallback: try matching via the linked species row — the plant's
        # user-entered name/species may not fuzzy-match, but its species'
        # latin_name / common_name_nl often does match a generated icon.
        species_id = plant.get("species_id")
        if species_id:
            species_rows = await db.execute_fetchall(
                "SELECT common_name_nl, latin_name FROM plant_species WHERE id = ?",
                (species_id,),
            )
            if species_rows:
                sp = dict(species_rows[0])
                for species_text in (sp.get("latin_name"), sp.get("common_name_nl")):
                    if species_text:
                        matched = await match_icon_key(db, species_text, None)
                        if matched:
                            return await _with_preserved_form(db, catalog, matched, current_key)

        return matched  # None

    return None


async def match_icon_key(db, name: str, species: str | None) -> str | None:
    """Best-effort icon_key for a plant by name/species. None if no match."""
    catalog = await load_catalog(db)
    lookup: dict[str, str] = {}
    for entry in catalog:
        # Only match the base icon — form variants (_bare/_potted, variant_of)
        # share a plant's name/sci and would otherwise shadow the base. A plant's
        # icon_key is always the base; placement derives the bare/potted form.
        if not _is_base_icon(entry):
            continue
        for text in _entry_match_texts(entry):
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
async def sync_icons(db=Depends(db_dep), admin=Depends(require_admin)):
    """Re-match this household's plants against the unified catalog.

    Existing behaviour: requested, placeholdered, icon-less, or dangling keys are
    assigned a real catalog icon when one exists. Upgrade behaviour: if a plant
    already has a valid generic/shared icon but an exact AI-generated icon exists
    for its own name/species, switch to that distinctive generated icon. Does NOT
    generate new files. Idempotent.

    Scoped to the caller's household. It used to select every active plant in the
    database: an admin pressing "sync icons" rewrote other households' plants and
    got their plant names listed back in the response. Admin here means "may run
    maintenance on my own garden", not "may reach into everyone's".
    """
    catalog = await load_catalog(db)
    valid_ids = {e["id"] for e in catalog}
    plants = [dict(r) for r in await db.execute_fetchall(
        "SELECT id, name, species, species_id, icon_key, icon_requested "
        "FROM plants WHERE is_active = 1 AND household_id = ?",
        (admin["household_id"],),
    )]
    matched: list[dict] = []
    unmatched: list[dict] = []
    for plant in plants:
        found = await sync_match_icon_key(db, plant, catalog=catalog, valid_ids=valid_ids)
        if found and found in valid_ids and not found.startswith("placeholder"):
            await db.execute(
                "UPDATE plants SET icon_key = ?, icon_requested = FALSE, "
                "updated_at = CURRENT_TIMESTAMP WHERE id = ? AND household_id = ?",
                (found, plant["id"], admin["household_id"]))
            matched.append({"plant_id": plant["id"], "plant_name": plant["name"], "icon_key": found})
        elif plant["icon_requested"] or _needs_real_icon(plant["icon_key"], valid_ids):
            unmatched.append({"plant_id": plant["id"], "plant_name": plant["name"]})
    if matched:
        await db.commit()
    return {"matched_plants": len(matched), "matches": matched,
            "unmatched_plants": len(unmatched), "unmatched": unmatched}


@router.get("/gaps")
async def get_icon_gaps(db=Depends(db_dep), account=Depends(get_current_account)):
    """Return three gap lists:
    - requested: plants that asked for an icon but don't have one yet
    - species_without_icon: plant_species entries with no matching icon at all
    - icons_without_species: base icons not matched to any species

    Reads the full catalog — curated *and* AI-generated. It used to read
    `load_manifest()`, the curated JSON file alone, so a species covered by a
    generated icon still counted as having none, and generated icons never
    appeared on the other side of the report. Note the mismatch that hid it:
    the `requested` list a few lines below already used `load_catalog`, so the
    three lists in one report disagreed about what an icon is.
    """
    manifest = await load_catalog(db)

    # Build set of scientific names in the catalog (normalised) → icon_id
    sci_to_icon: dict[str, str] = {}
    for entry in manifest:
        sci = entry.get("sci", "")
        if sci:
            sci_to_icon[_normalize(sci)] = entry["id"]

    # Base icons only (exclude form variants like _bare, _potted, etc.)
    base_icons = [e for e in manifest if not _FORM_SUFFIXES.search(e["id"]) and not e.get("variant_of")]

    # 1. requested — plants that lack a usable icon: flagged, placeholdered, missing,
    #    or carrying a dangling icon_key that no longer resolves to a real icon.
    valid_ids = {e["id"] for e in manifest}
    requested_rows = await db.execute_fetchall(
        "SELECT id, name, species, icon_key, icon_requested "
        "FROM plants WHERE is_active = 1 AND household_id = ?",
        (account["household_id"],),
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
    row = await db.execute_fetchall(
        "SELECT id FROM plants WHERE id = ? AND household_id = ? AND is_active = 1",
        (plant_id, account["household_id"]),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Plant not found")
    await db.execute("UPDATE plants SET icon_requested = TRUE WHERE id = ?", (plant_id,))
    await db.commit()
    return {"status": "requested", "plant_id": plant_id}
