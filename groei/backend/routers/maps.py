import json

import re
import os

from fastapi import APIRouter, HTTPException
from datetime import date

from database import get_db
from models import MapOut, MapDetailOut, ZoneOut, MapPlantOut, MostUrgent, MapObjectOut, MapItemsOut, MapCreate, MapUpdate
from routers.plant_care import _get_temp_data
from services.svg_renderer import render_canvas_data

# Path to frontend public/maps — SVGs land here so Vite serves them in dev
_MAPS_PUBLIC = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "public", "maps")
)

router = APIRouter(tags=["maps"])


@router.get("/maps", response_model=list[MapOut])
async def list_maps():
    async with get_db() as db:
        rows = await db.execute_fetchall(
            "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data FROM maps ORDER BY sort_order"
        )
        return [dict(r) for r in rows]


@router.get("/maps/{slug}", response_model=MapDetailOut)
async def get_map(slug: str):
    async with get_db() as db:
        row = await db.execute_fetchall(
            "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data FROM maps WHERE slug = ?",
            (slug,),
        )
        if not row:
            raise HTTPException(404, "Map not found")
        map_data = dict(row[0])

        zones = await db.execute_fetchall(
            "SELECT id, map_id, name, zone_type, sun_exposure, boundary, color, sort_order FROM zones WHERE map_id = ? ORDER BY sort_order",
            (map_data["id"],),
        )
        map_data["zones"] = [dict(z) for z in zones]
        return map_data


@router.get("/maps/{slug}/plants", response_model=list[MapPlantOut])
async def get_map_plants(slug: str):
    async with get_db() as db:
        # Verify map exists
        map_row = await db.execute_fetchall(
            "SELECT id FROM maps WHERE slug = ?", (slug,)
        )
        if not map_row:
            raise HTTPException(404, "Map not found")
        map_id = map_row[0]["id"]

        # Get plants on this map
        plants = await db.execute_fetchall(
            """SELECT id, name, species, map_x, map_y, photo_path, sun_requirement, plant_type, icon_key
               FROM plants
               WHERE map_id = ? AND is_active = 1 AND map_x IS NOT NULL AND map_y IS NOT NULL""",
            (map_id,),
        )

        today = date.today().isoformat()
        result = []
        for p in plants:
            plant = dict(p)

            # Compute care status from schedules
            schedules = await db.execute_fetchall(
                """SELECT cs.care_type, cs.next_due, u.name as last_done_by_name
                   FROM care_schedules cs
                   LEFT JOIN users u ON cs.last_done_by = u.id
                   WHERE cs.plant_id = ? AND cs.is_active = 1
                   ORDER BY cs.next_due ASC""",
                (plant["id"],),
            )

            care_status = "good"
            most_urgent = None

            for s in schedules:
                s = dict(s)
                next_due = s["next_due"]
                if next_due < today:
                    care_status = "overdue"
                    days = (date.fromisoformat(today) - date.fromisoformat(next_due)).days
                    most_urgent = MostUrgent(
                        care_type=s["care_type"],
                        days_overdue=days,
                        last_done_by=s["last_done_by_name"],
                    )
                    break
                elif next_due == today:
                    if care_status != "overdue":
                        care_status = "due_today"
                        most_urgent = MostUrgent(
                            care_type=s["care_type"],
                            days_overdue=0,
                            last_done_by=s["last_done_by_name"],
                        )

            plant["care_status"] = care_status
            plant["most_urgent"] = most_urgent
            result.append(plant)

        return result


def _compute_temp_status(care_thresholds_json: str | None, temp_data: dict) -> str:
    """Derive a temperature status string from care thresholds + current week's weather."""
    if not care_thresholds_json:
        return "comfortable"
    try:
        thresholds = json.loads(care_thresholds_json)
    except (json.JSONDecodeError, TypeError):
        return "comfortable"

    days = temp_data.get("days") or []
    if not days:
        return "comfortable"

    week_min = min(d["min"] for d in days)
    week_max = max(d["max"] for d in days)
    min_temp = thresholds.get("min_temp_c")
    max_temp = thresholds.get("max_temp_c")

    if min_temp is not None:
        if week_min <= min_temp:
            return "freezing"
        if week_min <= min_temp + 3:
            return "chilling"

    if max_temp is not None and week_max >= max_temp:
        return "heatstress"

    return "comfortable"


def _compute_care_status(schedules, today):
    """Shared helper to compute care_status and most_urgent from schedule rows."""
    care_status = "good"
    most_urgent = None
    for s in schedules:
        s = dict(s)
        next_due = s["next_due"]
        if next_due < today:
            care_status = "overdue"
            days = (date.fromisoformat(today) - date.fromisoformat(next_due)).days
            most_urgent = MostUrgent(
                care_type=s["care_type"], days_overdue=days, last_done_by=s.get("last_done_by_name"),
            )
            break
        elif next_due == today:
            if care_status != "overdue":
                care_status = "due_today"
                most_urgent = MostUrgent(
                    care_type=s["care_type"], days_overdue=0, last_done_by=s.get("last_done_by_name"),
                )
    return care_status, most_urgent


async def _plant_with_care(db, plant_row, today, temp_data: dict | None = None):
    """Enrich a plant dict with care_status, most_urgent, temp_status, and parsed phenology."""
    plant = dict(plant_row)
    schedules = await db.execute_fetchall(
        """SELECT cs.care_type, cs.next_due, u.name as last_done_by_name
           FROM care_schedules cs
           LEFT JOIN users u ON cs.last_done_by = u.id
           WHERE cs.plant_id = ? AND cs.is_active = 1
           ORDER BY cs.next_due ASC""",
        (plant["id"],),
    )
    plant["care_status"], plant["most_urgent"] = _compute_care_status(schedules, today)
    care_thresholds = plant.pop("care_thresholds", None)
    plant["temp_status"] = _compute_temp_status(care_thresholds, temp_data or {})
    phenology_json = plant.pop("phenology_json", None)
    plant["phenology"] = json.loads(phenology_json) if phenology_json else None
    return plant


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
        plants = [await _plant_with_care(db, p, today, temp_data) for p in plant_rows]

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
            contained = []
            for cp in contained_rows:
                p = await _plant_with_care(db, cp, today, temp_data)
                # Ensure map_x/map_y are set for the model (contained plants inherit from container)
                p["map_x"] = p["map_x"] or 0
                p["map_y"] = p["map_y"] or 0
                contained.append(p)
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
            "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data FROM maps WHERE id = ?",
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

        canvas_data = json.dumps({"zones": [], "scale_px_per_m": 46, "canvas_w": 680, "canvas_h": 680})

        cursor = await db.execute(
            """INSERT INTO maps (name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data)
               VALUES (?, ?, 'blank.svg', '0 0 680 680', '{"px_per_meter": 46}', ?, ?)""",
            (data.name, slug, next_order, canvas_data),
        )
        await db.commit()
        map_id = cursor.lastrowid
        rows = await db.execute_fetchall(
            "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data FROM maps WHERE id = ?",
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

        if updates:
            params.append(map_id)
            await db.execute(f"UPDATE maps SET {', '.join(updates)} WHERE id = ?", params)
            await db.commit()

        rows = await db.execute_fetchall(
            "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order, canvas_data FROM maps WHERE id = ?",
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
