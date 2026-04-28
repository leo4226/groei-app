import json

from fastapi import APIRouter, HTTPException
from datetime import date

from database import get_db
from models import MapOut, MapDetailOut, ZoneOut, MapPlantOut, MostUrgent, MapObjectOut, MapItemsOut
from routers.plant_care import _get_temp_data

router = APIRouter(tags=["maps"])


@router.get("/maps", response_model=list[MapOut])
async def list_maps():
    async with get_db() as db:
        rows = await db.execute_fetchall(
            "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order FROM maps ORDER BY sort_order"
        )
        return [dict(r) for r in rows]


@router.get("/maps/{slug}", response_model=MapDetailOut)
async def get_map(slug: str):
    async with get_db() as db:
        row = await db.execute_fetchall(
            "SELECT id, name, slug, svg_file, viewbox, scale_info, sort_order FROM maps WHERE slug = ?",
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
