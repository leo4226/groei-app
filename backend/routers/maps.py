import json
import logging
import re
import time

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from datetime import date

from database import db_dep
from auth import get_current_account
from models import MapOut, MapDetailOut, MapPlantOut, MapObjectOut, MapItemsOut, MapCreate, MapUpdate, GardenSuggestionsOut, PlantRecommendationOut
from services.environment import get_rain_data, get_temp_data
from services.garden_log import get_last_garden_watered, get_last_garden_fertilized
from services.svg_renderer import render_canvas_data, render_thumbnail
from services.plant_reader import enrich_plants
from services.storage import build_storage_from_env
from services.garden_biodiversity import compute_for_map as compute_biodiversity
from services.plant_suggestions import recommend_for_garden, recommend_for_streek
from services.streek import streek_for, all_streken
from services.bees import bee_support_for_map
from services.geocode import reverse_geocode

logger = logging.getLogger(__name__)

router = APIRouter(tags=["maps"])


class GardenBiodiversityOut(BaseModel):
    score: int
    species_count: int
    native_count: int
    invasive_count: int
    pollinator_coverage_months: list[bool]
    components: dict
    streek_slug: str | None = None
    streek_name: str | None = None
    streek_native_count: int = 0
    drachtplant_count: int = 0
    area_m2: float | None = None
    score_targets: dict = {}
    soil_ph: dict = {}
    growth_form: dict = {}
    circularity: dict = {}   # self-reported kringloop practices (advice-only)
    features: dict = {}      # physical garden features: shelter, nesting, water (advice-only)


class StreekOut(BaseModel):
    slug: str
    name: str


@router.get("/streken", response_model=list[StreekOut])
async def list_streken(account = Depends(get_current_account)):
    """The 25 Dutch ecological streken — for the 'Kies je streek' picker.
    Static data (georeferenced from streektuinen.nl); no DB read needed."""
    return all_streken()


@router.get("/maps", response_model=list[MapOut])
async def list_maps(account = Depends(get_current_account), db = Depends(db_dep)):
    rows = await db.execute_fetchall(
        "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data, map_type, lat, lon, bearing, thumbnail_file, streek_slug, streek_source, is_public, photos_public, place_name, country_code FROM maps WHERE household_id = ? ORDER BY sort_order",
        (account["household_id"],),
    )
    return [dict(r) for r in rows]


@router.get("/maps/{slug}", response_model=MapDetailOut)
async def get_map(slug: str, account = Depends(get_current_account), db = Depends(db_dep)):
    row = await db.execute_fetchall(
        "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data, map_type, lat, lon, bearing, thumbnail_file, streek_slug, streek_source, is_public, photos_public, place_name, country_code FROM maps WHERE slug = ? AND household_id = ?",
        (slug, account["household_id"]),
    )
    if not row:
        raise HTTPException(404, "Map not found")
    map_data = dict(row[0])
    return map_data


# Canonical circularity (kringloop) practices — a fixed, ordered set so the
# meter is always N/len(CIRCULARITY_KEYS). Extend deliberately (a new key
# lowers every existing garden's ratio until re-reported).
CIRCULARITY_KEYS = ("compost", "mulch", "rainwater", "peat_free")


class CircularityIn(BaseModel):
    compost: bool = False
    mulch: bool = False
    rainwater: bool = False
    peat_free: bool = False


@router.get("/maps/{slug}/biodiversity", response_model=GardenBiodiversityOut)
async def get_map_biodiversity(slug: str, account = Depends(get_current_account), db = Depends(db_dep)):
    """Per-garden biodiversity profile. Outdoor-only — indoor maps return 404
    since their ornamental tropicals have no NL ecological role."""
    row = await db.execute_fetchall(
        "SELECT id, map_type FROM maps WHERE slug = ? AND household_id = ?",
        (slug, account["household_id"]),
    )
    if not row:
        raise HTTPException(404, "Map not found")
    if (row[0]["map_type"] or "outdoor") != "outdoor":
        raise HTTPException(404, "Biodiversity score is only computed for outdoor maps")
    profile = await compute_biodiversity(db, row[0]["id"])
    return GardenBiodiversityOut(
        score=profile.score,
        species_count=profile.species_count,
        native_count=profile.native_count,
        invasive_count=profile.invasive_count,
        pollinator_coverage_months=profile.pollinator_coverage_months,
        components=profile.components,
        streek_slug=profile.streek_slug,
        streek_name=profile.streek_name,
        streek_native_count=profile.streek_native_count,
        drachtplant_count=profile.drachtplant_count,
        area_m2=profile.area_m2,
        score_targets=profile.score_targets,
        soil_ph=profile.soil_ph,
        growth_form=profile.growth_form,
        circularity=profile.circularity,
        features=profile.features,
    )


@router.put("/maps/{slug}/circularity")
async def update_map_circularity(
    slug: str,
    data: CircularityIn,
    account = Depends(get_current_account),
    db = Depends(db_dep),
):
    """Self-reported kringloop practices for a garden (advice-only, not scored)."""
    row = await db.execute_fetchall(
        "SELECT id FROM maps WHERE slug = ? AND household_id = ?",
        (slug, account["household_id"]),
    )
    if not row:
        raise HTTPException(404, "Map not found")
    flags = {k: bool(getattr(data, k)) for k in CIRCULARITY_KEYS}
    await db.execute(
        "UPDATE maps SET circularity = ? WHERE id = ?",
        (json.dumps(flags), row[0]["id"]),
    )
    await db.commit()
    return flags


class GardenFeatureIn(BaseModel):
    feature_type: str
    count: int = 1


@router.put("/maps/{slug}/features")
async def update_map_feature(
    slug: str,
    data: GardenFeatureIn,
    account = Depends(get_current_account),
    db = Depends(db_dep),
):
    """Set the count of one physical garden feature (insectenhotel, nestkast,
    water, …). count = 0 removes it. Advice-only, never scored."""
    from services.garden_features import FEATURE_TYPES, features_for_map

    if data.feature_type not in FEATURE_TYPES:
        raise HTTPException(422, "Unknown feature type")
    count = max(0, min(int(data.count), 99))   # clamp: a garden isn't a warehouse

    map_id = await _owned_map_id(db, slug, account["household_id"])
    if count == 0:
        await db.execute(
            "DELETE FROM garden_features WHERE map_id = ? AND feature_type = ?",
            (map_id, data.feature_type),
        )
    else:
        existing = await db.execute_fetchall(
            "SELECT id FROM garden_features WHERE map_id = ? AND feature_type = ?",
            (map_id, data.feature_type),
        )
        if existing:
            await db.execute(
                "UPDATE garden_features SET count = ? WHERE map_id = ? AND feature_type = ?",
                (count, map_id, data.feature_type),
            )
        else:
            await db.execute(
                "INSERT INTO garden_features (map_id, feature_type, count) VALUES (?, ?, ?)",
                (map_id, data.feature_type, count),
            )
    await db.commit()

    summary = await features_for_map(db, map_id)
    return {
        "counts": summary.counts,
        "total": summary.total,
        "distinct": summary.distinct,
        "supported_groups": summary.supported_groups,
        "missing": summary.missing,
    }


class BeeSupportOut(BaseModel):
    forage_months: list[bool]
    supported_count: int
    supported_redlist_count: int
    total_bees: int
    total_redlist: int
    forage_gap_months: list[int]
    example_supported: list[str]


@router.get("/maps/{slug}/bee-support", response_model=BeeSupportOut)
async def get_bee_support(slug: str, account = Depends(get_current_account), db = Depends(db_dep)):
    """Which wild bees the garden's drachtplanten support, and where the forage
    gaps are (Bloeibogen/Naturalis). Outdoor-only."""
    row = await db.execute_fetchall(
        "SELECT id, map_type FROM maps WHERE slug = ? AND household_id = ?",
        (slug, account["household_id"]),
    )
    if not row:
        raise HTTPException(404, "Map not found")
    if (row[0]["map_type"] or "outdoor") != "outdoor":
        raise HTTPException(404, "Bee support is only computed for outdoor maps")
    s = await bee_support_for_map(db, row[0]["id"])
    return BeeSupportOut(**vars(s))


@router.get("/maps/{slug}/plant-suggestions", response_model=GardenSuggestionsOut)
async def get_plant_suggestions(
    slug: str,
    account=Depends(get_current_account),
    db=Depends(db_dep),
):
    """Garden-level Tier 1 recommendations — what to add to improve biodiversity."""
    rows = await db.execute_fetchall(
        "SELECT id, map_type FROM maps WHERE slug = ? AND household_id = ?",
        (slug, account["household_id"]),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Map not found")
    m = dict(rows[0])
    if (m.get("map_type") or "outdoor") != "outdoor":
        raise HTTPException(status_code=400, detail="Plant suggestions only available for outdoor maps")

    # A bit deeper than the default 8 so the frontend's function lanes
    # (fills-a-gap / biggest-impact / small-&-easy / …) each have content.
    recs, gap_months = await recommend_for_garden(db, m["id"], limit=14)
    bio = await compute_biodiversity(db, m["id"])

    return GardenSuggestionsOut(
        suggestions=[PlantRecommendationOut(**vars(r)) for r in recs],
        gap_months=gap_months,
        biodiversity_score=bio.score,
    )


class DismissIn(BaseModel):
    species_id: int


async def _owned_map_id(db, slug: str, household_id: int) -> int:
    rows = await db.execute_fetchall(
        "SELECT id FROM maps WHERE slug = ? AND household_id = ?", (slug, household_id)
    )
    if not rows:
        raise HTTPException(404, "Map not found")
    return rows[0]["id"]


@router.post("/maps/{slug}/dismiss-recommendation")
async def dismiss_recommendation(
    slug: str, data: DismissIn, account = Depends(get_current_account), db = Depends(db_dep)
):
    """Wave off a recommended species for this garden — it won't be suggested
    here again until un-dismissed. Idempotent."""
    map_id = await _owned_map_id(db, slug, account["household_id"])
    exists = await db.execute_fetchall(
        "SELECT 1 FROM dismissed_recommendations WHERE map_id = ? AND species_id = ?",
        (map_id, data.species_id),
    )
    if not exists:
        await db.execute(
            "INSERT INTO dismissed_recommendations (map_id, species_id) VALUES (?, ?)",
            (map_id, data.species_id),
        )
        await db.commit()
    return {"dismissed": True, "species_id": data.species_id}


@router.delete("/maps/{slug}/dismiss-recommendation/{species_id}")
async def undismiss_recommendation(
    slug: str, species_id: int, account = Depends(get_current_account), db = Depends(db_dep)
):
    """Undo a dismissal — the species can be recommended here again."""
    map_id = await _owned_map_id(db, slug, account["household_id"])
    await db.execute(
        "DELETE FROM dismissed_recommendations WHERE map_id = ? AND species_id = ?",
        (map_id, species_id),
    )
    await db.commit()
    return {"dismissed": False, "species_id": species_id}


class StreekSuggestionsOut(BaseModel):
    streek_slug: str | None = None
    streek_name: str | None = None
    suggestions: list[PlantRecommendationOut]


@router.get("/maps/{slug}/streek-suggestions", response_model=StreekSuggestionsOut)
async def get_streek_suggestions(
    slug: str,
    account=Depends(get_current_account),
    db=Depends(db_dep),
):
    """"Planten uit jouw streek" — regionally-correct flora to add, from the
    garden's streek (streektuinen icoonsoorten resolved to our catalog)."""
    rows = await db.execute_fetchall(
        "SELECT id, map_type, streek_slug FROM maps WHERE slug = ? AND household_id = ?",
        (slug, account["household_id"]),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Map not found")
    m = dict(rows[0])
    if (m.get("map_type") or "outdoor") != "outdoor":
        raise HTTPException(status_code=400, detail="Streek suggestions only available for outdoor maps")

    streek_name, recs = await recommend_for_streek(db, m["id"])
    return StreekSuggestionsOut(
        streek_slug=m.get("streek_slug"),
        streek_name=streek_name,
        suggestions=[PlantRecommendationOut(**vars(r)) for r in recs],
    )


@router.get("/maps/{slug}/plants", response_model=list[MapPlantOut])
async def get_map_plants(slug: str, account = Depends(get_current_account), db = Depends(db_dep)):
    map_row = await db.execute_fetchall(
        "SELECT id, map_type FROM maps WHERE slug = ? AND household_id = ?", (slug, account["household_id"])
    )
    if not map_row:
        raise HTTPException(404, "Map not found")
    map_id = map_row[0]["id"]
    map_type = map_row[0]["map_type"] or "outdoor"

    plant_rows = await db.execute_fetchall(
        """SELECT p.id, p.name, p.species, p.map_x, p.map_y, p.photo_path,
                  p.container_id, p.ground_zone_id, p.display_radius_cm,
                  p.sun_requirement, p.plant_type, p.icon_key, p.species_id,
                  p.is_locked, p.quantity, p.care_thresholds, p.care_profile,
                  s.phenology_json,
                  s.common_name_nl AS species_common_name_nl,
                  s.common_name_en AS species_common_name_en
           FROM plants p
           LEFT JOIN plant_species s ON p.species_id = s.id
           WHERE p.map_id = ? AND p.is_active = 1 AND p.map_x IS NOT NULL AND p.map_y IS NOT NULL""",
        (map_id,),
    )
    today = date.today().isoformat()
    temp_data = await get_temp_data()
    rain_data = await get_rain_data()
    last_watered = await get_last_garden_watered(account["household_id"])
    last_fertilized = await get_last_garden_fertilized(account["household_id"])
    return await enrich_plants(db, plant_rows, today, temp_data=temp_data, rain_data=rain_data, last_watered=last_watered, last_fertilized=last_fertilized, map_type=map_type)




@router.get("/maps/{slug}/items", response_model=MapItemsOut)
async def get_map_items(slug: str, account = Depends(get_current_account), db = Depends(db_dep)):
    map_row = await db.execute_fetchall("SELECT id, map_type FROM maps WHERE slug = ? AND household_id = ?", (slug, account["household_id"]))
    if not map_row:
        raise HTTPException(404, "Map not found")
    map_id = map_row[0]["id"]
    map_type = map_row[0]["map_type"] or "outdoor"
    today = date.today().isoformat()
    temp_data = await get_temp_data()
    rain_data = await get_rain_data()
    last_watered = await get_last_garden_watered(account["household_id"])
    last_fertilized = await get_last_garden_fertilized(account["household_id"])

    # Free-standing + ground-zone plants (not inside a container)
    plant_rows = await db.execute_fetchall(
        """SELECT p.id, p.name, p.species, p.map_x, p.map_y, p.photo_path,
                  p.container_id, p.ground_zone_id, p.display_radius_cm, p.sun_requirement,
                  p.measured_sun_hours,
                  p.plant_type, p.icon_key, p.species_id, p.is_locked, p.quantity, p.care_thresholds,
                  p.care_profile, s.phenology_json,
                  s.common_name_nl AS species_common_name_nl,
                  s.common_name_en AS species_common_name_en
           FROM plants p
           LEFT JOIN plant_species s ON p.species_id = s.id
           WHERE p.map_id = ? AND p.is_active = 1 AND p.map_x IS NOT NULL AND p.map_y IS NOT NULL
             AND p.container_id IS NULL""",
        (map_id,),
    )
    plants = await enrich_plants(db, plant_rows, today, temp_data=temp_data, rain_data=rain_data, last_watered=last_watered, last_fertilized=last_fertilized, map_type=map_type)

    # Objects on this map
    obj_rows = await db.execute_fetchall(
        "SELECT * FROM objects WHERE map_id = ? AND is_active = 1",
        (map_id,),
    )
    objects = []
    for o in obj_rows:
        obj = dict(o)
        # Get contained plants
        contained_rows = await db.execute_fetchall(
            """SELECT p.id, p.name, p.species, p.map_x, p.map_y, p.photo_path,
                      p.container_id, p.ground_zone_id, p.display_radius_cm, p.sun_requirement,
                      p.measured_sun_hours,
                      p.plant_type, p.icon_key, p.species_id, p.is_locked, p.quantity, p.care_thresholds,
                      p.care_profile, s.phenology_json,
                      s.common_name_nl AS species_common_name_nl,
                      s.common_name_en AS species_common_name_en
               FROM plants p
               LEFT JOIN plant_species s ON p.species_id = s.id
               WHERE p.container_id = ? AND p.is_active = 1""",
            (obj["id"],),
        )
        contained = await enrich_plants(db, contained_rows, today, temp_data=temp_data, rain_data=rain_data, last_watered=last_watered, last_fertilized=last_fertilized, map_type=map_type)
        for p in contained:
            p["map_x"] = p["map_x"] or 0
            p["map_y"] = p["map_y"] or 0
        obj["contained_plants"] = contained
        objects.append(obj)

    # Secondary placements — extra spots for a plant whose primary marker lives
    # elsewhere (or on another map). Rendered as small dots that open the parent.
    placement_rows = await db.execute_fetchall(
        """SELECT pp.id, pp.plant_id, pp.map_x, pp.map_y, pp.ground_zone_id, pp.phase,
                  p.name, p.icon_key
           FROM plant_placements pp
           JOIN plants p ON p.id = pp.plant_id
           WHERE pp.map_id = ? AND p.is_active = 1 AND p.household_id = ?""",
        (map_id, account["household_id"]),
    )
    secondary_markers = [dict(r) for r in placement_rows]

    return {"plants": plants, "objects": objects, "secondary_markers": secondary_markers}


def _slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r'[^a-z0-9]+', '-', slug).strip('-')
    return slug or 'map'


@router.get("/maps/by-id/{map_id}", response_model=MapOut)
async def get_map_by_id(map_id: int, account = Depends(get_current_account), db = Depends(db_dep)):
    rows = await db.execute_fetchall(
        "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data, map_type, lat, lon, bearing, thumbnail_file, streek_slug, streek_source, is_public, photos_public, place_name, country_code FROM maps WHERE id = ? AND household_id = ?",
        (map_id, account["household_id"]),
    )
    if not rows:
        raise HTTPException(404, "Map not found")
    return dict(rows[0])


@router.post("/maps", response_model=MapOut)
async def create_map(data: MapCreate, account = Depends(get_current_account), db = Depends(db_dep)):
    base_slug = _slugify(data.name)
    slug = base_slug
    # Ensure unique slug
    n = 1
    while True:
        existing = await db.execute_fetchall("SELECT id FROM maps WHERE slug = ?", (slug,))
        if not existing:
            break
        n += 1
        slug = f"{base_slug}-{n}"

    max_order = await db.execute_fetchall("SELECT COALESCE(MAX(sort_order), 0) as m FROM maps")
    next_order = max_order[0]["m"] + 1

    canvas_data = json.dumps({"zones": [], "scale_px_per_m": 46, "canvas_w": 680, "canvas_h": 680, "mapType": data.map_type})

    # Generate a placeholder SVG so the dashboard thumbnail shows immediately
    svg_content = render_canvas_data(canvas_data, data.name)
    key = f"maps/{slug}.svg"
    storage = build_storage_from_env()
    svg_url = storage.put(key, svg_content.encode("utf-8"), content_type="image/svg+xml")

    # Resolve the streek from GPS (outdoor maps). Auto by default; the user can
    # override later via "Kies je streek" (PUT with streek_slug → 'manual').
    streek = streek_for(data.lat, data.lon)
    streek_slug = streek["slug"] if streek else None

    # City label for the public atlas — reverse-geocoded, silently skipped on
    # failure (the atlas then falls back to the ecological region name).
    place_name = None
    country_code = None
    if data.map_type == "outdoor" and data.lat is not None and data.lon is not None:
        try:
            geocoded = await reverse_geocode(data.lat, data.lon)
            if geocoded:
                place_name, country_code = geocoded
        except Exception:
            logger.warning("reverse geocode failed for new map")

    cursor = await db.execute(
        """INSERT INTO maps (name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data, map_type, lat, lon, bearing, household_id, streek_slug, streek_source, is_public, photos_public, place_name, country_code)
           VALUES (?, ?, ?, '0 0 680 680', '{"px_per_meter": 46}', ?, ?, ?, ?, ?, ?, ?, ?, 'auto', ?, ?, ?, ?)""",
        (data.name, slug, svg_url, next_order, canvas_data, data.map_type, data.lat, data.lon, data.bearing, account["household_id"], streek_slug, data.is_public, data.photos_public, place_name, country_code),
    )
    await db.commit()
    map_id = cursor.lastrowid
    rows = await db.execute_fetchall(
        "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data, map_type, lat, lon, bearing, thumbnail_file, streek_slug, streek_source, is_public, photos_public, place_name, country_code FROM maps WHERE id = ?",
        (map_id,),
    )
    return dict(rows[0])


@router.put("/maps/{map_id}", response_model=MapOut)
async def update_map(map_id: int, data: MapUpdate, account = Depends(get_current_account), db = Depends(db_dep)):
    existing = await db.execute_fetchall("SELECT id, slug, lat, lon, streek_source, place_name FROM maps WHERE id = ? AND household_id = ?", (map_id, account["household_id"]))
    if not existing:
        raise HTTPException(404, "Map not found")
    existing_row = dict(existing[0])

    updates = []
    params = []
    if data.name is not None:
        updates.append("name = ?")
        params.append(data.name)
    if data.canvas_data is not None:
        updates.append("canvas_data = ?")
        params.append(data.canvas_data)
        # Compute tight viewbox from zone bounding box (ADR-0001)
        try:
            cd = json.loads(data.canvas_data)
            zones = cd.get("zones", [])
            if zones:
                pad = 20
                min_x = min(z["x"] for z in zones)
                min_y = min(z["y"] for z in zones)
                max_x = max(z["x"] + z["width"] for z in zones)
                max_y = max(z["y"] + z["height"] for z in zones)
                vb = f"{min_x - pad} {min_y - pad} {max_x - min_x + pad * 2} {max_y - min_y + pad * 2}"
            else:
                w, h = cd.get("canvas_w", 680), cd.get("canvas_h", 680)
                vb = f"0 0 {w} {h}"
            updates.append("viewbox = ?")
            params.append(vb)

            # Re-render SVG thumbnail so dashboard stays in sync
            map_row = await db.execute_fetchall("SELECT name, slug FROM maps WHERE id = ?", (map_id,))
            if map_row:
                slug = map_row[0]["slug"]
                map_name = map_row[0]["name"]
                svg_content = render_canvas_data(data.canvas_data, map_name)
                key = f"maps/{slug}.svg"
                storage = build_storage_from_env()
                svg_url = storage.put(key, svg_content.encode("utf-8"), content_type="image/svg+xml")
                updates.append("svg_file = ?")
                params.append(svg_url)

            # Sync soil zones from canvas_data to ground_zones table
            soil_zones = [z for z in zones if z.get("type") == "soil"]
            for z in soil_zones:
                polygon = json.dumps([
                    [z["x"], z["y"]],
                    [z["x"] + z["width"], z["y"]],
                    [z["x"] + z["width"], z["y"] + z["height"]],
                    [z["x"], z["y"] + z["height"]],
                ])
                await db.execute(
                    """INSERT INTO ground_zones (id, map_id, name, zone_type, polygon, soil_note)
                       VALUES (?, ?, ?, 'soil', ?, ?)
                       ON CONFLICT (id) DO UPDATE SET
                         name = EXCLUDED.name,
                         polygon = EXCLUDED.polygon,
                         zone_type = 'soil',
                         soil_note = EXCLUDED.soil_note""",
                    (z["id"], map_id, z.get("label", "Grond"), polygon, z.get("soil_note")),
                )
        except (json.JSONDecodeError, TypeError):
            pass
        # Generate thumbnail SVG from zone blocks
        try:
            thumb_svg = render_thumbnail(data.canvas_data)
            if thumb_svg:
                thumb_key = f"maps/{existing_row['slug']}-thumb.svg"
                storage = build_storage_from_env()
                thumb_url = storage.put(thumb_key, thumb_svg.encode("utf-8"), content_type="image/svg+xml")
                updates.append("thumbnail_file = ?")
                params.append(thumb_url)
            else:
                updates.append("thumbnail_file = ?")
                params.append(None)
        except (json.JSONDecodeError, TypeError):
            pass
    if data.map_type is not None:
        updates.append("map_type = ?")
        params.append(data.map_type)
    if data.lat is not None:
        updates.append("lat = ?")
        params.append(data.lat)
    if data.lon is not None:
        updates.append("lon = ?")
        params.append(data.lon)
    if data.bearing is not None:
        updates.append("bearing = ?")
        params.append(data.bearing)
    if data.is_public is not None:
        updates.append("is_public = ?")
        params.append(bool(data.is_public))
    if data.photos_public is not None:
        updates.append("photos_public = ?")
        params.append(bool(data.photos_public))

    # ── City label (place_name) ──
    # Reverse-geocode when GPS moves, or when a map is first made public and
    # still has no label (lazy backfill for maps created before this column).
    need_geocode = data.lat is not None or data.lon is not None
    if data.is_public is True and not existing_row.get("place_name"):
        need_geocode = True
    if need_geocode:
        eff_lat = data.lat if data.lat is not None else existing_row.get("lat")
        eff_lon = data.lon if data.lon is not None else existing_row.get("lon")
        if eff_lat is not None and eff_lon is not None:
            try:
                geocoded = await reverse_geocode(eff_lat, eff_lon)
                if geocoded:
                    updates.append("place_name = ?")
                    params.append(geocoded[0])
                    updates.append("country_code = ?")
                    params.append(geocoded[1])
            except Exception:
                logger.warning("reverse geocode failed for map %s", map_id)

    # ── Streek resolution ──
    # An explicit streek_slug is a user's "Kies je streek" pick → 'manual',
    # which auto-resolution must never overwrite. Otherwise, when lat/lon
    # changes and the streek isn't manually pinned, re-resolve from GPS.
    if data.streek_slug is not None:
        updates.append("streek_slug = ?")
        params.append(data.streek_slug or None)
        updates.append("streek_source = ?")
        params.append("manual")
    elif (data.lat is not None or data.lon is not None) and existing_row.get("streek_source") != "manual":
        eff_lat = data.lat if data.lat is not None else existing_row.get("lat")
        eff_lon = data.lon if data.lon is not None else existing_row.get("lon")
        streek = streek_for(eff_lat, eff_lon)
        updates.append("streek_slug = ?")
        params.append(streek["slug"] if streek else None)
        updates.append("streek_source = ?")
        params.append("auto")

    if updates:
        params.append(map_id)
        await db.execute(f"UPDATE maps SET {', '.join(updates)} WHERE id = ?", params)
        await db.commit()

    rows = await db.execute_fetchall(
        "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data, map_type, lat, lon, bearing, thumbnail_file, streek_slug, streek_source, is_public, photos_public, place_name, country_code FROM maps WHERE id = ?",
        (map_id,),
    )
    return dict(rows[0])


class UnderlayOut(BaseModel):
    url: str


_UNDERLAY_MAX_BYTES = 12 * 1024 * 1024
_UNDERLAY_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


@router.post("/maps/{map_id}/underlay", response_model=UnderlayOut)
async def upload_map_underlay(
    map_id: int,
    file: UploadFile = File(...),
    account = Depends(get_current_account),
    db = Depends(db_dep),
):
    """Store a trace-over background image for a map in R2 and return its URL.

    The URL + placement transform live in the map's canvas_data (client-side);
    this endpoint only persists the bytes. The underlay is a private editor
    aid — it is never rendered on the read-only map view, the public share page,
    or the PNG export.
    """
    rows = await db.execute_fetchall(
        "SELECT slug FROM maps WHERE id = ? AND household_id = ?",
        (map_id, account["household_id"]),
    )
    if not rows:
        raise HTTPException(404, "Map not found")

    ext = _UNDERLAY_TYPES.get(file.content_type or "")
    if ext is None:
        raise HTTPException(415, "Unsupported image type")
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    if len(data) > _UNDERLAY_MAX_BYTES:
        raise HTTPException(413, "Image too large")

    slug = rows[0]["slug"]
    key = f"maps/{slug}/underlay-{int(time.time())}.{ext}"
    storage = build_storage_from_env()
    url = storage.put(key, data, content_type=file.content_type)
    return {"url": url}


@router.delete("/maps/{map_id}")
async def delete_map(map_id: int, account = Depends(get_current_account), db = Depends(db_dep)):
    existing = await db.execute_fetchall("SELECT id FROM maps WHERE id = ? AND household_id = ?", (map_id, account["household_id"]))
    if not existing:
        raise HTTPException(404, "Map not found")

    # Cascade delete: PostgreSQL FK constraints require cleaning up child rows first.
    # Plants stay alive — only map references are NULLed so they lose position on this map.

    # 1. NULL plant references to this map and its child entities
    await db.execute("UPDATE plants SET map_id = NULL WHERE map_id = $1", (map_id,))
    await db.execute(
        "UPDATE plants SET container_id = NULL WHERE container_id IN (SELECT id FROM objects WHERE map_id = $1)",
        (map_id,),
    )
    await db.execute(
        "UPDATE plants SET ground_zone_id = NULL WHERE ground_zone_id IN (SELECT id FROM ground_zones WHERE map_id = $1)",
        (map_id,),
    )

    # 2. Delete child entities bound to this map
    await db.execute("DELETE FROM weed_sightings WHERE map_id = $1", (map_id,))
    await db.execute("DELETE FROM ground_zones WHERE map_id = $1", (map_id,))
    await db.execute("DELETE FROM zones WHERE map_id = $1", (map_id,))
    await db.execute("DELETE FROM objects WHERE map_id = $1", (map_id,))

    # 3. Delete the map itself
    await db.execute("DELETE FROM maps WHERE id = $1", (map_id,))
    await db.commit()
    return {"ok": True}
