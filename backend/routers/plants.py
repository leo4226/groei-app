import json
import os
import time
from datetime import date as _date, timedelta as _timedelta

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends

from database import db_dep
from auth import get_current_account
from models import PlantOut, PlantCreate, PlantUpdate, CareScheduleOut, PlantPositionUpdate, PlantContainerUpdate, PlantGroundZoneUpdate
from routers.icons import resolve_placement_icon
from services.scheduling import calculate_next_due
from services.plant_reader import enrich_plant_full, _compute_care_status, _coerce_dates
from services.storage import build_storage_from_env
from species_service import get_or_create_species
from threshold_service import generate_thresholds

router = APIRouter(tags=["plants"])


async def _seed_care_schedules(db, plant_id: int, thresholds_json: str) -> None:
    """Create care_schedules for a plant from its threshold data. Idempotent — skips if schedule exists."""
    try:
        thresholds = json.loads(thresholds_json)
    except (json.JSONDecodeError, TypeError):
        return

    water_interval = thresholds.get("water_interval_days")
    fertilise_months = thresholds.get("fertilise_months") or []

    if water_interval and water_interval > 0:
        existing = await db.execute_fetchall(
            "SELECT id FROM care_schedules WHERE plant_id = ? AND care_type = 'water' AND is_active = 1",
            (plant_id,),
        )
        if not existing:
            await db.execute(
                "INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due) VALUES ($1, 'water', $2, CURRENT_DATE)",
                (plant_id, int(water_interval)),
            )

    if fertilise_months:
        existing = await db.execute_fetchall(
            "SELECT id FROM care_schedules WHERE plant_id = ? AND care_type = 'fertilize' AND is_active = 1",
            (plant_id,),
        )
        if not existing:
            today = _date.today()
            current_month = today.month
            sorted_months = sorted(fertilise_months)
            next_month = next((m for m in sorted_months if m >= current_month), sorted_months[0])
            if next_month >= current_month:
                next_due = _date(today.year, next_month, 1)
            else:
                next_due = _date(today.year + 1, next_month, 1)
            interval = max(30, 365 // len(fertilise_months))
            await db.execute(
                "INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due) VALUES (?, 'fertilize', ?, ?)",
                (plant_id, interval, next_due),
            )

    await db.commit()


@router.get("/plants", response_model=list[PlantOut])
async def list_plants(db = Depends(db_dep), account = Depends(get_current_account)):
    rows = await db.execute_fetchall("""
        SELECT p.*, l.name as location_name, l.icon as location_icon,
               s.phenology_json
        FROM plants p
        LEFT JOIN locations l ON p.location_id = l.id
        LEFT JOIN plant_species s ON p.species_id = s.id
        WHERE p.is_active = 1 AND p.household_id = ?
        ORDER BY p.name
    """, (account["household_id"],))
    today = _date.today().isoformat()
    plants = [dict(r) for r in rows]

    plant_ids = [p["id"] for p in plants]
    if plant_ids:
        placeholders = ",".join("?" for _ in plant_ids)
        sched_rows = await db.execute_fetchall(
            f"""SELECT cs.*, u.name as last_done_by_name
                FROM care_schedules cs
                LEFT JOIN users u ON cs.last_done_by = u.id
                WHERE cs.plant_id IN ({placeholders}) AND cs.is_active = 1
                ORDER BY cs.plant_id, cs.next_due ASC""",
            plant_ids,
        )
        by_plant: dict[int, list] = {}
        for row in sched_rows:
            r = dict(row)
            pid = r["plant_id"]
            by_plant.setdefault(pid, []).append(r)
    else:
        by_plant = {}

    for plant in plants:
        pid = plant["id"]
        schedules = by_plant.get(pid, [])
        plant["care_status"], _ = _compute_care_status(schedules, today)
        # Convert dates to strings for Pydantic model
        _coerce_dates(plant)
        for s in schedules:
            _coerce_dates(s)
        plant["care_schedules"] = schedules
        if plant.get("phenology_json"):
            try:
                plant["phenology"] = json.loads(plant.pop("phenology_json"))
            except (json.JSONDecodeError, TypeError):
                plant["phenology"] = None
                plant.pop("phenology_json", None)
        else:
            plant.pop("phenology_json", None)

    return plants


@router.get("/plants/{plant_id}", response_model=PlantOut)
async def get_plant(plant_id: int, db = Depends(db_dep), account = Depends(get_current_account)):
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
    today = _date.today().isoformat()
    return await enrich_plant_full(db, dict(row), today)


@router.post("/plants", response_model=PlantOut)
async def create_plant(data: PlantCreate, db = Depends(db_dep), account = Depends(get_current_account)):
    cursor = await db.execute(
        """INSERT INTO plants (name, species, location_id, acquired_date, pot_size_cm, notes, map_id, map_x, map_y, sun_requirement, plant_type, icon_key, phase, sown_date, household_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (data.name, data.species, data.location_id,
         data.acquired_date,
         data.pot_size_cm, data.notes,
         data.map_id, data.map_x, data.map_y, data.sun_requirement, data.plant_type, data.icon_key,
         data.phase, data.sown_date, account["household_id"]),
    )
    plant_id = cursor.lastrowid

    # Create care schedules — set next_due to today so tasks appear immediately
    for sched in data.care_schedules:
        from datetime import date as _date_today
        next_due = _date_today.today()
        await db.execute(
            """INSERT INTO care_schedules
               (plant_id, care_type, interval_days, season_adjust, next_due, notes)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (plant_id, sched.care_type, sched.interval_days,
             sched.season_adjust, next_due, sched.notes),
        )

    await db.commit()

    # Link or create species (non-fatal if Claude is unavailable)
    species_id = None
    try:
        species_id = await get_or_create_species(db, data.name)
        await db.execute(
            "UPDATE plants SET species_id = ? WHERE id = ?",
            (species_id, plant_id),
        )
        await db.commit()
    except Exception as exc:
        print(f"Warning: could not generate species data for {data.name}: {exc}")

    # Use cached care thresholds from species if available, else generate via Claude
    try:
        cached = None
        if species_id:
            sp_rows = await db.execute_fetchall(
                "SELECT care_thresholds FROM plant_species WHERE id = ?",
                (species_id,),
            )
            if sp_rows and sp_rows[0]["care_thresholds"]:
                cached = sp_rows[0]["care_thresholds"]

        if cached:
            await db.execute(
                "UPDATE plants SET care_thresholds = ? WHERE id = ?",
                (cached, plant_id),
            )
            await db.commit()
            await _seed_care_schedules(db, plant_id, cached)
        else:
            thresholds = await generate_thresholds(data.name, data.species)
            thresholds_json = json.dumps(thresholds)
            await db.execute(
                "UPDATE plants SET care_thresholds = ? WHERE id = ?",
                (thresholds_json, plant_id),
            )
            await db.commit()
            # Cache thresholds on species for future plants
            if species_id:
                await db.execute(
                    "UPDATE plant_species SET care_thresholds = ? WHERE id = ?",
                    (thresholds_json, species_id),
                )
                await db.commit()
            await _seed_care_schedules(db, plant_id, thresholds_json)
    except Exception as exc:
        print(f"Warning: could not generate thresholds for {data.name}: {exc}")

    # Return the created plant
    return await get_plant(plant_id, db=db)


@router.put("/plants/{plant_id}", response_model=PlantOut)
async def update_plant(plant_id: int, data: PlantUpdate, db = Depends(db_dep), account = Depends(get_current_account)):
    # Build SET clause from non-None fields
    updates = {}
    for field, value in data.model_dump(exclude_unset=True).items():
        if value is not None and isinstance(value, _date):
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

    return await get_plant(plant_id, db=db)


@router.put("/plants/{plant_id}/position", response_model=PlantOut)
async def update_position(plant_id: int, data: PlantPositionUpdate, db = Depends(db_dep), account = Depends(get_current_account)):
    cursor = await db.execute("SELECT id, icon_key FROM plants WHERE id = ? AND is_active = 1", (plant_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Plant not found")
    new_icon = resolve_placement_icon(row["icon_key"], container_id=None)
    try:
        await db.execute(
            """UPDATE plants
               SET map_id = ?, map_x = ?, map_y = ?, ground_zone_id = ?,
                   container_id = NULL, icon_key = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (data.map_id, data.map_x, data.map_y, data.ground_zone_id, new_icon, plant_id),
        )
        await db.commit()
    except Exception:
        # Fallback: update position without ground_zone_id (e.g., FK constraint)
        await db.execute(
            """UPDATE plants
               SET map_id = ?, map_x = ?, map_y = ?,
                   container_id = NULL, icon_key = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (data.map_id, data.map_x, data.map_y, new_icon, plant_id),
        )
        await db.commit()
    return await get_plant(plant_id, db=db)


@router.put("/plants/{plant_id}/container", response_model=PlantOut)
async def update_container(plant_id: int, data: PlantContainerUpdate, db = Depends(db_dep), account = Depends(get_current_account)):
    cursor = await db.execute("SELECT id, icon_key FROM plants WHERE id = ? AND is_active = 1", (plant_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Plant not found")
    new_icon = resolve_placement_icon(row["icon_key"], container_id=data.container_id)
    await db.execute(
        """UPDATE plants
           SET container_id = ?, ground_zone_id = NULL,
               icon_key = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?""",
        (data.container_id, new_icon, plant_id),
    )
    await db.commit()
    return await get_plant(plant_id, db=db)


@router.put("/plants/{plant_id}/ground-zone", response_model=PlantOut)
async def update_ground_zone(plant_id: int, data: PlantGroundZoneUpdate, db = Depends(db_dep), account = Depends(get_current_account)):
    cursor = await db.execute("SELECT id, icon_key FROM plants WHERE id = ? AND is_active = 1", (plant_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Plant not found")
    new_icon = resolve_placement_icon(row["icon_key"], container_id=None)
    try:
        await db.execute(
            """UPDATE plants
               SET ground_zone_id = ?, map_x = ?, map_y = ?,
                   container_id = NULL, icon_key = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (data.ground_zone_id, data.map_x, data.map_y, new_icon, plant_id),
        )
        await db.commit()
    except Exception:
        # Fallback: update position without ground_zone_id (e.g., FK constraint)
        await db.execute(
            """UPDATE plants
               SET map_x = ?, map_y = ?,
                   container_id = NULL, icon_key = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (data.map_x, data.map_y, new_icon, plant_id),
        )
        await db.commit()
    return await get_plant(plant_id, db=db)


@router.post("/plants/{plant_id}/duplicate", response_model=PlantOut)
async def duplicate_plant(plant_id: int, db = Depends(db_dep), account = Depends(get_current_account)):
    """Duplicate a plant: copies name, species, type, watering schedules, notes, photo ref, display_radius_cm.
    Does NOT copy: position, container, care log."""
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
           map_id, display_radius_cm, sun_requirement, phase, sown_date, is_active, household_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)""",
        (src["name"], src["species"], src.get("species_id"), src["location_id"], src["photo_path"],
         src["pot_size_cm"], src["notes"], src["map_id"], src.get("display_radius_cm"),
         src.get("sun_requirement"), src.get("phase"), src.get("sown_date"), account["household_id"]),
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
            (new_id, s["care_type"], s["interval_days"], s["season_adjust"], next_due, s["notes"]),
        )

    await db.commit()
    return await get_plant(new_id, db=db)


@router.patch("/plants/{plant_id}/lock")
async def toggle_lock(plant_id: int, locked: bool, db = Depends(db_dep), account = Depends(get_current_account)):
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
async def archive_plant(plant_id: int, db = Depends(db_dep), account = Depends(get_current_account)):
    await db.execute(
        "UPDATE plants SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (plant_id,),
    )
    await db.commit()
    return {"ok": True}


@router.patch("/plants/{plant_id}/restore")
async def restore_plant(plant_id: int, db = Depends(db_dep), account = Depends(get_current_account)):
    await db.execute(
        "UPDATE plants SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (plant_id,),
    )
    await db.commit()
    return {"ok": True}


@router.post("/plants/{plant_id}/photo", response_model=PlantOut)
async def upload_photo(plant_id: int, file: UploadFile = File(...), db = Depends(db_dep), account = Depends(get_current_account)):
    # Verify plant exists
    cursor = await db.execute("SELECT id FROM plants WHERE id = ?", (plant_id,))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Plant not found")

    # Upload to R2
    file_bytes = await file.read()
    ext = (file.filename or "photo.jpg").rsplit(".", 1)[-1].lower()
    key = f"photos/{plant_id}_{int(time.time())}.{ext}"
    storage = build_storage_from_env()
    public_url = storage.put(key, file_bytes, content_type=file.content_type or "image/jpeg")

    await db.execute(
        "UPDATE plants SET photo_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (public_url, plant_id),
    )
    await db.commit()

    return await get_plant(plant_id, db=db)
