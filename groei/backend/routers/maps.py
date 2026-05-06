import json
import re
import os

from fastapi import APIRouter, HTTPException
from datetime import date

from database import get_db
from models import MapOut, MapDetailOut, MapPlantOut, MapObjectOut, MapItemsOut, MapCreate, MapUpdate
from routers.plant_care import _get_temp_data
from services.svg_renderer import render_canvas_data
from services.plant_reader import enrich_plant, enrich_plants

# Path to frontend public/maps — SVGs land here so Vite serves them in dev
_MAPS_PUBLIC = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "public", "maps")
)

router = APIRouter(tags=["maps"])


@router.get("/maps", response_model=list[MapOut])
async def list_maps():
    async with get_db() as db:
        rows = await db.execute_fetchall(
            "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data, map_type, lat, lon, bearing FROM maps ORDER BY sort_order"
        )
        return [dict(r) for r in rows]


@router.get("/maps/{slug}", response_model=MapDetailOut)
async def get_map(slug: str):
    async with get_db() as db:
        row = await db.execute_fetchall(
            "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data, map_type, lat, lon, bearing FROM maps WHERE slug = ?",
            (slug,),
        )
        if not row:
            raise HTTPException(404, "Map not found")
        map_data = dict(row[0])
        return map_data


@router.get("/maps/{slug}/plants", response_model=list[MapPlantOut])
async def get_map_plants(slug: str):
    async with get_db() as db:
        map_row = await db.execute_fetchall(
            "SELECT id FROM maps WHERE slug = ?", (slug,)
        )
        if not map_row:
            raise HTTPException(404, "Map not found")
        map_id = map_row[0]["id"]

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
        return await enrich_plants(db, plant_rows, today)




@router.get("/maps/{slug}/items", response_model=MapItemsOut)
async def get_map_items(slug: str):
    async with get_db() as db:
        map_row = await db.execute_fetchall("SELECT id FROM maps WHERE slug = ?", (slug,))
        if not map_row:
            raise HTTPException(404, "Map not found")
        map_id = map_row[0]["id"]
        today = date.today().isoformat()
        temp_data = await _get_temp_data()

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
        plants = await enrich_plants(db, plant_rows, today, temp_data=temp_data)

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
            contained = await enrich_plants(db, contained_rows, today, temp_data=temp_data)
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
async def get_map_by_id(map_id: int):
    async with get_db() as db:
        rows = await db.execute_fetchall(
            "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data, map_type, lat, lon, bearing FROM maps WHERE id = ?",
            (map_id,),
        )
        if not rows:
            raise HTTPException(404, "Map not found")
        return dict(rows[0])


@router.post("/maps", response_model=MapOut)
async def create_map(data: MapCreate):
    async with get_db() as db:
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

        cursor = await db.execute(
            """INSERT INTO maps (name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data, map_type, lat, lon, bearing)
               VALUES (?, ?, 'blank.svg', '0 0 680 680', '{"px_per_meter": 46}', ?, ?, ?, ?, ?, ?)""",
            (data.name, slug, next_order, canvas_data, data.map_type, data.lat, data.lon, data.bearing),
        )
        await db.commit()
        map_id = cursor.lastrowid
        rows = await db.execute_fetchall(
            "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data, map_type, lat, lon, bearing FROM maps WHERE id = ?",
            (map_id,),
        )
        return dict(rows[0])


@router.put("/maps/{map_id}", response_model=MapOut)
async def update_map(map_id: int, data: MapUpdate):
    async with get_db() as db:
        existing = await db.execute_fetchall("SELECT id FROM maps WHERE id = ?", (map_id,))
        if not existing:
            raise HTTPException(404, "Map not found")

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
            "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data, map_type, lat, lon, bearing FROM maps WHERE id = ?",
            (map_id,),
        )
        return dict(rows[0])


@router.post("/maps/{map_id}/render-svg")
async def render_map_svg(map_id: int):
    async with get_db() as db:
        rows = await db.execute_fetchall(
            "SELECT id, name, slug, canvas_data FROM maps WHERE id = ?", (map_id,)
        )
        if not rows:
            raise HTTPException(404, "Map not found")
        row = dict(rows[0])
        if not row["canvas_data"]:
            raise HTTPException(400, "Map has no canvas data to render")

        svg_content = render_canvas_data(row["canvas_data"], row["name"])
        svg_filename = f"{row['slug']}.svg"
        svg_path = os.path.join(_MAPS_PUBLIC, svg_filename)

        os.makedirs(_MAPS_PUBLIC, exist_ok=True)
        with open(svg_path, "w", encoding="utf-8") as f:
            f.write(svg_content)

        await db.execute(
            "UPDATE maps SET svg_file = ? WHERE id = ?",
            (svg_filename, map_id),
        )
        await db.commit()
        return {"svg_file": svg_filename}


@router.delete("/maps/{map_id}")
async def delete_map(map_id: int):
    async with get_db() as db:
        existing = await db.execute_fetchall("SELECT id FROM maps WHERE id = ?", (map_id,))
        if not existing:
            raise HTTPException(404, "Map not found")
        if map_id == 1:
            raise HTTPException(400, "Cannot delete the default garden map")
        await db.execute("DELETE FROM maps WHERE id = ?", (map_id,))
        await db.commit()
        return {"ok": True}
