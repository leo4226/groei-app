import json
import os
import time
from datetime import date

from fastapi import APIRouter, UploadFile, File, HTTPException

from database import get_db
from models import PlantOut, PlantCreate, PlantUpdate, CareScheduleOut, PlantPositionUpdate, PlantContainerUpdate, PlantGroundZoneUpdate
from routers.icons import find_variant
from services.scheduling import calculate_next_due
from species_service import get_or_create_species
from threshold_service import generate_thresholds

router = APIRouter(tags=["plants"])

PHOTOS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "photos")


@router.get("/plants", response_model=list[PlantOut])
async def list_plants():
    async with get_db() as db:
        cursor = await db.execute("""
            SELECT p.*, l.name as location_name, l.icon as location_icon,
                   s.phenology_json
            FROM plants p
            LEFT JOIN locations l ON p.location_id = l.id
            LEFT JOIN plant_species s ON p.species_id = s.id
            WHERE p.is_active = 1
            ORDER BY p.name
        """)
        plants = [dict(row) for row in await cursor.fetchall()]

        for plant in plants:
            if plant.get("phenology_json"):
                plant["phenology"] = json.loads(plant.pop("phenology_json"))
            else:
                plant.pop("phenology_json", None)

            sched_cursor = await db.execute("""
                SELECT cs.*, u.name as last_done_by_name
                FROM care_schedules cs
                LEFT JOIN users u ON cs.last_done_by = u.id
                WHERE cs.plant_id = ? AND cs.is_active = 1
            """, (plant["id"],))
            plant["care_schedules"] = [dict(row) for row in await sched_cursor.fetchall()]

        return plants


@router.get("/plants/{plant_id}", response_model=PlantOut)
async def get_plant(plant_id: int):
    async with get_db() as db:
        cursor = await db.execute("""
            SELECT p.*, l.name as location_name, l.icon as location_icon,
                   s.phenology_json
            FROM plants p
            LEFT JOIN locations l ON p.location_id = l.id
            LEFT JOIN plant_species s ON p.species_id = s.id
            WHERE p.id = ? AND p.is_active = 1
        """, (plant_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Plant not found")

        plant = dict(row)
        if plant.get("phenology_json"):
            plant["phenology"] = json.loads(plant.pop("phenology_json"))
        else:
            plant.pop("phenology_json", None)

        sched_cursor = await db.execute("""
            SELECT cs.*, u.name as last_done_by_name
            FROM care_schedules cs
            LEFT JOIN users u ON cs.last_done_by = u.id
            WHERE cs.plant_id = ? AND cs.is_active = 1
        """, (plant_id,))
        plant["care_schedules"] = [dict(row) for row in await sched_cursor.fetchall()]

        return plant


@router.post("/plants", response_model=PlantOut)
async def create_plant(data: PlantCreate):
    async with get_db() as db:
        cursor = await db.execute(
            """INSERT INTO plants (name, species, location_id, acquired_date, pot_size_cm, notes, map_id, map_x, map_y, sun_requirement, plant_type, icon_key)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (data.name, data.species, data.location_id,
             str(data.acquired_date) if data.acquired_date else None,
             data.pot_size_cm, data.notes,
             data.map_id, data.map_x, data.map_y, data.sun_requirement, data.plant_type, data.icon_key),
        )
        plant_id = cursor.lastrowid

        # Create care schedules
        for sched in data.care_schedules:
            next_due = calculate_next_due(
                None, sched.interval_days, sched.season_adjust
            )
            await db.execute(
                """INSERT INTO care_schedules
                   (plant_id, care_type, interval_days, season_adjust, next_due, notes)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (plant_id, sched.care_type, sched.interval_days,
                 sched.season_adjust, str(next_due), sched.notes),
            )

        await db.commit()

        # Link or create species (non-fatal if Claude is unavailable)
        try:
            species_id = await get_or_create_species(db, data.name)
            await db.execute(
                "UPDATE plants SET species_id = ? WHERE id = ?",
                (species_id, plant_id),
            )
            await db.commit()
        except Exception as exc:
            print(f"Warning: could not generate species data for {data.name}: {exc}")

        # Generate care thresholds (non-fatal if Claude is unavailable)
        try:
            thresholds = await generate_thresholds(data.name, data.species)
            async with get_db() as db2:
                await db2.execute(
                    "UPDATE plants SET care_thresholds = ? WHERE id = ?",
                    (json.dumps(thresholds), plant_id),
                )
                await db2.commit()
        except Exception as exc:
            print(f"Warning: could not generate thresholds for {data.name}: {exc}")

        # Return the created plant
        return await get_plant(plant_id)


@router.put("/plants/{plant_id}", response_model=PlantOut)
async def update_plant(plant_id: int, data: PlantUpdate):
    async with get_db() as db:
        # Build SET clause from non-None fields
        updates = {}
        for field, value in data.model_dump(exclude_unset=True).items():
            if value is not None and isinstance(value, date):
                updates[field] = str(value)
            else:
                updates[field] = value

        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [plant_id]

        await db.execute(
            f"UPDATE plants SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            values,
        )
        await db.commit()

        return await get_plant(plant_id)


@router.put("/plants/{plant_id}/position", response_model=PlantOut)
async def update_position(plant_id: int, data: PlantPositionUpdate):
    async with get_db() as db:
        cursor = await db.execute("SELECT id, icon_key FROM plants WHERE id = ? AND is_active = 1", (plant_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Plant not found")
        new_icon = find_variant(row["icon_key"], "bare")
        await db.execute(
            """UPDATE plants
               SET map_id = ?, map_x = ?, map_y = ?, ground_zone_id = ?,
                   container_id = NULL, icon_key = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (data.map_id, data.map_x, data.map_y, data.ground_zone_id, new_icon, plant_id),
        )
        await db.commit()
        return await get_plant(plant_id)


@router.put("/plants/{plant_id}/container", response_model=PlantOut)
async def update_container(plant_id: int, data: PlantContainerUpdate):
    async with get_db() as db:
        cursor = await db.execute("SELECT id, icon_key FROM plants WHERE id = ? AND is_active = 1", (plant_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Plant not found")
        target_form = "potted" if data.container_id is not None else "bare"
        new_icon = find_variant(row["icon_key"], target_form)
        await db.execute(
            """UPDATE plants
               SET container_id = ?, ground_zone_id = NULL,
                   icon_key = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (data.container_id, new_icon, plant_id),
        )
        await db.commit()
        return await get_plant(plant_id)


@router.put("/plants/{plant_id}/ground-zone", response_model=PlantOut)
async def update_ground_zone(plant_id: int, data: PlantGroundZoneUpdate):
    async with get_db() as db:
        cursor = await db.execute("SELECT id, icon_key FROM plants WHERE id = ? AND is_active = 1", (plant_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Plant not found")
        new_icon = find_variant(row["icon_key"], "bare")
        await db.execute(
            """UPDATE plants
               SET ground_zone_id = ?, map_x = ?, map_y = ?,
                   container_id = NULL, icon_key = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (data.ground_zone_id, data.map_x, data.map_y, new_icon, plant_id),
        )
        await db.commit()
        return await get_plant(plant_id)


@router.post("/plants/{plant_id}/duplicate", response_model=PlantOut)
async def duplicate_plant(plant_id: int):
    """Duplicate a plant: copies name, species, type, watering schedules, notes, photo ref, display_radius_cm.
    Does NOT copy: position, container, care log."""
    async with get_db() as db:
        cursor = await db.execute("""
            SELECT p.*, l.name as location_name, l.icon as location_icon
            FROM plants p
            LEFT JOIN locations l ON p.location_id = l.id
            WHERE p.id = ? AND p.is_active = 1
        """, (plant_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Plant not found")
        src = dict(row)

        new_cursor = await db.execute(
            """INSERT INTO plants (name, species, species_id, location_id, photo_path, pot_size_cm, notes,
               map_id, display_radius_cm, sun_requirement, is_active)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)""",
            (src["name"], src["species"], src.get("species_id"), src["location_id"], src["photo_path"],
             src["pot_size_cm"], src["notes"], src["map_id"], src.get("display_radius_cm"),
             src.get("sun_requirement")),
        )
        new_id = new_cursor.lastrowid

        # Copy care schedules
        sched_rows = await db.execute_fetchall(
            "SELECT care_type, interval_days, season_adjust, notes FROM care_schedules WHERE plant_id = ? AND is_active = 1",
            (plant_id,),
        )
        for s in sched_rows:
            s = dict(s)
            next_due = calculate_next_due(None, s["interval_days"], s["season_adjust"])
            await db.execute(
                """INSERT INTO care_schedules (plant_id, care_type, interval_days, season_adjust, next_due, notes, is_active)
                   VALUES (?, ?, ?, ?, ?, ?, 1)""",
                (new_id, s["care_type"], s["interval_days"], s["season_adjust"], str(next_due), s["notes"]),
            )

        await db.commit()
        return await get_plant(new_id)


@router.patch("/plants/{plant_id}/lock")
async def toggle_lock(plant_id: int, locked: bool):
    async with get_db() as db:
        cursor = await db.execute("SELECT id FROM plants WHERE id = ? AND is_active = 1", (plant_id,))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Plant not found")
        await db.execute(
            "UPDATE plants SET is_locked = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (1 if locked else 0, plant_id),
        )
        await db.commit()
        return {"ok": True, "is_locked": locked}


@router.delete("/plants/{plant_id}")
async def archive_plant(plant_id: int):
    async with get_db() as db:
        await db.execute(
            "UPDATE plants SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (plant_id,),
        )
        await db.commit()
        return {"ok": True}


@router.post("/plants/{plant_id}/photo", response_model=PlantOut)
async def upload_photo(plant_id: int, file: UploadFile = File(...)):
    # Verify plant exists
    async with get_db() as db:
        cursor = await db.execute("SELECT id FROM plants WHERE id = ?", (plant_id,))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Plant not found")

    # Save file
    ext = os.path.splitext(file.filename or "photo.jpg")[1] or ".jpg"
    filename = f"{plant_id}_{int(time.time())}{ext}"
    filepath = os.path.join(PHOTOS_DIR, filename)

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    photo_path = f"/api/photos/{filename}"

    async with get_db() as db:
        await db.execute(
            "UPDATE plants SET photo_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (photo_path, plant_id),
        )
        await db.commit()

    return await get_plant(plant_id)
