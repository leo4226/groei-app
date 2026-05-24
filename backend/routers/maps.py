import json
import re

from fastapi import APIRouter, HTTPException, Depends
from datetime import date

from database import db_dep
from auth import get_current_account
from models import MapOut, MapDetailOut, MapPlantOut, MapObjectOut, MapItemsOut, MapCreate, MapUpdate
from services.environment import get_rain_data, get_temp_data
from services.garden_log import get_last_garden_watered, get_last_garden_fertilized
from services.svg_renderer import render_canvas_data, render_thumbnail
from services.plant_reader import enrich_plant, enrich_plants
from services.storage import build_storage_from_env

router = APIRouter(tags=["maps"])


@router.get("/maps", response_model=list[MapOut])
async def list_maps(account = Depends(get_current_account), db = Depends(db_dep)):
    rows = await db.execute_fetchall(
        "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data, map_type, lat, lon, bearing, thumbnail_file FROM maps WHERE household_id = ? ORDER BY sort_order",
        (account["household_id"],),
    )
    return [dict(r) for r in rows]


@router.get("/maps/{slug}", response_model=MapDetailOut)
async def get_map(slug: str, account = Depends(get_current_account), db = Depends(db_dep)):
    row = await db.execute_fetchall(
        "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data, map_type, lat, lon, bearing, thumbnail_file FROM maps WHERE slug = ?",
        (slug,),
    )
    if not row:
        raise HTTPException(404, "Map not found")
    map_data = dict(row[0])
    return map_data


@router.get("/maps/{slug}/plants", response_model=list[MapPlantOut])
async def get_map_plants(slug: str, account = Depends(get_current_account), db = Depends(db_dep)):
    map_row = await db.execute_fetchall(
        "SELECT id, map_type FROM maps WHERE slug = ?", (slug,)
    )
    if not map_row:
        raise HTTPException(404, "Map not found")
    map_id = map_row[0]["id"]
    map_type = map_row[0]["map_type"] or "outdoor"

    plant_rows = await db.execute_fetchall(
        """SELECT p.id, p.name, p.species, p.map_x, p.map_y, p.photo_path,
                  p.container_id, p.ground_zone_id, p.display_radius_cm,
                  p.sun_requirement, p.plant_type, p.icon_key, p.species_id,
                  p.is_locked, p.care_thresholds,
                  s.phenology_json
           FROM plants p
           LEFT JOIN plant_species s ON p.species_id = s.id
           WHERE p.map_id = ? AND p.is_active = 1 AND p.map_x IS NOT NULL AND p.map_y IS NOT NULL""",
        (map_id,),
    )
    today = date.today().isoformat()
    temp_data = await get_temp_data()
    rain_data = await get_rain_data()
    last_watered = await get_last_garden_watered()
    last_fertilized = await get_last_garden_fertilized()
    return await enrich_plants(db, plant_rows, today, temp_data=temp_data, rain_data=rain_data, last_watered=last_watered, last_fertilized=last_fertilized, map_type=map_type)




@router.get("/maps/{slug}/items", response_model=MapItemsOut)
async def get_map_items(slug: str, account = Depends(get_current_account), db = Depends(db_dep)):
    map_row = await db.execute_fetchall("SELECT id, map_type FROM maps WHERE slug = ?", (slug,))
    if not map_row:
        raise HTTPException(404, "Map not found")
    map_id = map_row[0]["id"]
    map_type = map_row[0]["map_type"] or "outdoor"
    today = date.today().isoformat()
    temp_data = await get_temp_data()
    rain_data = await get_rain_data()
    last_watered = await get_last_garden_watered()

    # Free-standing + ground-zone plants (not inside a container)
    plant_rows = await db.execute_fetchall(
        """SELECT p.id, p.name, p.species, p.map_x, p.map_y, p.photo_path,
                  p.container_id, p.ground_zone_id, p.display_radius_cm, p.sun_requirement,
                  p.plant_type, p.icon_key, p.species_id, p.is_locked, p.care_thresholds,
                  s.phenology_json
           FROM plants p
           LEFT JOIN plant_species s ON p.species_id = s.id
           WHERE p.map_id = ? AND p.is_active = 1 AND p.map_x IS NOT NULL AND p.map_y IS NOT NULL
             AND p.container_id IS NULL""",
        (map_id,),
    )
    plants = await enrich_plants(db, plant_rows, today, temp_data=temp_data, rain_data=rain_data, last_watered=last_watered, map_type=map_type)

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
                      p.plant_type, p.icon_key, p.species_id, p.is_locked, p.care_thresholds,
                      s.phenology_json
               FROM plants p
               LEFT JOIN plant_species s ON p.species_id = s.id
               WHERE p.container_id = ? AND p.is_active = 1""",
            (obj["id"],),
        )
        contained = await enrich_plants(db, contained_rows, today, temp_data=temp_data, rain_data=rain_data, last_watered=last_watered, map_type=map_type)
        for p in contained:
            p["map_x"] = p["map_x"] or 0
            p["map_y"] = p["map_y"] or 0
        obj["contained_plants"] = contained
        objects.append(obj)

    return {"plants": plants, "objects": objects}


def _slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r'[^a-z0-9]+', '-', slug).strip('-')
    return slug or 'map'


@router.get("/maps/by-id/{map_id}", response_model=MapOut)
async def get_map_by_id(map_id: int, account = Depends(get_current_account), db = Depends(db_dep)):
    rows = await db.execute_fetchall(
        "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data, map_type, lat, lon, bearing, thumbnail_file FROM maps WHERE id = ?",
        (map_id,),
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

    cursor = await db.execute(
        """INSERT INTO maps (name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data, map_type, lat, lon, bearing, household_id)
           VALUES (?, ?, ?, '0 0 680 680', '{"px_per_meter": 46}', ?, ?, ?, ?, ?, ?, ?)""",
        (data.name, slug, svg_url, next_order, canvas_data, data.map_type, data.lat, data.lon, data.bearing, account["household_id"]),
    )
    await db.commit()
    map_id = cursor.lastrowid
    rows = await db.execute_fetchall(
        "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data, map_type, lat, lon, bearing, thumbnail_file FROM maps WHERE id = ?",
        (map_id,),
    )
    return dict(rows[0])


@router.put("/maps/{map_id}", response_model=MapOut)
async def update_map(map_id: int, data: MapUpdate, account = Depends(get_current_account), db = Depends(db_dep)):
    existing = await db.execute_fetchall("SELECT id, slug FROM maps WHERE id = ?", (map_id,))
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

    if updates:
        params.append(map_id)
        await db.execute(f"UPDATE maps SET {', '.join(updates)} WHERE id = ?", params)
        await db.commit()

    rows = await db.execute_fetchall(
        "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data, map_type, lat, lon, bearing, thumbnail_file FROM maps WHERE id = ?",
        (map_id,),
    )
    return dict(rows[0])



@router.delete("/maps/{map_id}")
async def delete_map(map_id: int, account = Depends(get_current_account), db = Depends(db_dep)):
    existing = await db.execute_fetchall("SELECT id FROM maps WHERE id = ?", (map_id,))
    if not existing:
        raise HTTPException(404, "Map not found")
    await db.execute("DELETE FROM maps WHERE id = ?", (map_id,))
    await db.commit()
    return {"ok": True}
