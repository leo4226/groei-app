import json
import os
from datetime import date as _date, timedelta as _timedelta

from fastapi import APIRouter, BackgroundTasks, UploadFile, File, HTTPException, Depends

from database import db_dep
from auth import get_current_account
from models import PlantOut, PlantCreate, PlantUpdate, CareScheduleOut, PlantPositionUpdate, PlantContainerUpdate, PlantGroundZoneUpdate, BulkArchiveInput, PlacementCreate, PlacementUpdate, SecondaryMarkerOut
from routers.icons import resolve_placement_icon, match_icon_key
from routers.icon_generator import guess_category
from care_types import is_care_type_valid_for_env
from services.scheduling import calculate_next_due
from services.plant_reader import enrich_plant_full, _compute_care_status, _coerce_dates
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
            # Use ? placeholders (qm_to_pg translates these); the $1/$2 form is
            # not translated and breaks under dev SQLite.
            await db.execute(
                "INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due) VALUES (?, 'water', ?, CURRENT_DATE)",
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
               s.phenology_json,
               s.common_name_nl AS species_common_name_nl,
               s.common_name_en AS species_common_name_en
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
               s.phenology_json,
               s.common_name_nl AS species_common_name_nl,
               s.common_name_en AS species_common_name_en
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
    quantity = max(1, int(data.quantity or 1))
    cursor = await db.execute(
        """INSERT INTO plants (name, species, location_id, acquired_date, pot_size_cm, notes, map_id, map_x, map_y, sun_requirement, plant_type, icon_key, phase, sown_date, quantity, household_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (data.name, data.species, data.location_id,
         data.acquired_date,
         data.pot_size_cm, data.notes,
         data.map_id, data.map_x, data.map_y, data.sun_requirement, data.plant_type, data.icon_key,
         data.phase, data.sown_date, quantity, account["household_id"]),
    )
    plant_id = cursor.lastrowid

    # Resolve the plant's environment so we can refuse care types that don't
    # apply to it (e.g. rotate/mist for outdoor plants). Newly created plants
    # are never containers, so a non-indoor map → outdoor_ground.
    env_map_type = None
    if data.map_id is not None:
        map_rows = await db.execute_fetchall(
            "SELECT map_type FROM maps WHERE id = ? AND household_id = ?",
            (data.map_id, account["household_id"]),
        )
        if map_rows:
            env_map_type = map_rows[0]["map_type"]
    environment = "indoor" if env_map_type == "indoor" else "outdoor_ground"

    # Create care schedules — set next_due to today so tasks appear immediately.
    # Skip care types that are invalid for this environment so outdoor plants
    # never auto-acquire rotate/mist (etc.) schedules.
    for sched in data.care_schedules:
        if not is_care_type_valid_for_env(sched.care_type, environment):
            continue
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

    # Ensure every plant gets an icon. If the client did not pick one, try a
    # server-side match; otherwise assign a category placeholder and flag the
    # plant so the admin can generate a distinctive icon later. Never fatal.
    if not data.icon_key:
        try:
            matched = await match_icon_key(db, data.name, data.species)
            if matched:
                await db.execute("UPDATE plants SET icon_key = ? WHERE id = ?", (matched, plant_id))
            else:
                cat = guess_category(data.species or "") or guess_category(data.name) or "unknown"
                await db.execute(
                    "UPDATE plants SET icon_key = ?, icon_requested = TRUE WHERE id = ?",
                    (f"placeholder_{cat}", plant_id))
            await db.commit()
        except Exception as exc:  # noqa: BLE001
            print(f"Warning: icon assignment failed for {data.name}: {exc}")

    # Link or create species (non-fatal if Claude is unavailable). Prefer the
    # scientific species field when present; identify/database prefills set that
    # to the Latin name, which lets us reuse existing species rows even when the
    # user-facing name is localized or missing from the catalog.
    species_id = None
    try:
        species_lookup_name = data.species or data.name
        species_id = await get_or_create_species(db, species_lookup_name)
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
            # _seed_care_schedules is idempotent on care_type 'water'/'fertilize'.
            # The form's CARE_TYPE_INFO uses the same keys, so a form-sent
            # 'water'/'fertilize' suppresses the seed (no duplicate rows). Keep
            # both vocabularies in sync or this dedup silently breaks.
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

    # Guarantee every plant is at least waterable: if threshold generation
    # failed (e.g. Claude down) and the form sent no schedules, the plant could
    # otherwise end up with zero schedules. Seed a default water schedule when
    # none exists.
    existing_water = await db.execute_fetchall(
        "SELECT id FROM care_schedules WHERE plant_id = ? AND care_type = 'water' AND is_active = 1",
        (plant_id,),
    )
    if not existing_water:
        await db.execute(
            "INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due) VALUES (?, 'water', ?, ?)",
            (plant_id, 7, _date.today()),
        )
        await db.commit()

    # Return the created plant
    return await get_plant(plant_id, db=db)


@router.post("/plants/{plant_id}/retry-species", response_model=PlantOut)
async def retry_plant_species(plant_id: int, db = Depends(db_dep), account = Depends(get_current_account)):
    """Retry generating species data for a plant whose species_id is NULL.

    Calls get_or_create_species again (LLM) to generate phenology/care data
    and links the result. Also retries thresholds if still missing.
    """
    cursor = await db.execute(
        "SELECT id, name, species, species_id, care_thresholds "
        "FROM plants WHERE id = ? AND is_active = 1",
        (plant_id,),
    )
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Plant not found")

    plant = dict(row)
    species_lookup_name = plant.get("species") or plant["name"]
    species_id = await get_or_create_species(db, species_lookup_name)
    await db.execute(
        "UPDATE plants SET species_id = ? WHERE id = ?",
        (species_id, plant_id),
    )
    await db.commit()

    # If thresholds are still missing, retry those too
    if not plant.get("care_thresholds"):
        try:
            thresholds = await generate_thresholds(plant["name"], plant.get("species"))
            thresholds_json = json.dumps(thresholds)
            await db.execute(
                "UPDATE plants SET care_thresholds = ? WHERE id = ?",
                (thresholds_json, plant_id),
            )
            await db.commit()
            await _seed_care_schedules(db, plant_id, thresholds_json)
        except Exception as exc:
            print(f"Warning: could not regenerate thresholds for {plant['name']}: {exc}")

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

    if "quantity" in updates and updates["quantity"] is not None:
        updates["quantity"] = max(1, int(updates["quantity"]))

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


# ── Secondary placements: one plant can sit in several spots on a map ──

async def _fetch_marker(db, placement_id: int) -> dict | None:
    cur = await db.execute(
        """SELECT pp.id, pp.plant_id, pp.map_x, pp.map_y, pp.ground_zone_id, pp.phase,
                  p.name, p.icon_key
           FROM plant_placements pp
           JOIN plants p ON p.id = pp.plant_id
           WHERE pp.id = ?""",
        (placement_id,),
    )
    row = await cur.fetchone()
    return dict(row) if row else None


async def _owned_placement(db, plant_id: int, placement_id: int, household_id: int) -> bool:
    cur = await db.execute(
        """SELECT pp.id FROM plant_placements pp
           JOIN plants p ON p.id = pp.plant_id
           WHERE pp.id = ? AND pp.plant_id = ? AND p.household_id = ?""",
        (placement_id, plant_id, household_id),
    )
    return (await cur.fetchone()) is not None


@router.post("/plants/{plant_id}/placements", response_model=SecondaryMarkerOut)
async def add_placement(plant_id: int, data: PlacementCreate, db = Depends(db_dep), account = Depends(get_current_account)):
    cur = await db.execute(
        "SELECT id, name, icon_key FROM plants WHERE id = ? AND is_active = 1 AND household_id = ?",
        (plant_id, account["household_id"]),
    )
    plant = await cur.fetchone()
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")

    map_rows = await db.execute_fetchall(
        "SELECT id FROM maps WHERE id = ? AND household_id = ?",
        (data.map_id, account["household_id"]),
    )
    if not map_rows:
        raise HTTPException(status_code=404, detail="Map not found")

    plant = dict(plant)
    cursor = await db.execute(
        """INSERT INTO plant_placements (plant_id, map_id, map_x, map_y, ground_zone_id, phase)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (plant_id, data.map_id, data.map_x, data.map_y, data.ground_zone_id, data.phase),
    )
    await db.commit()
    return {
        "id": cursor.lastrowid, "plant_id": plant_id,
        "map_x": data.map_x, "map_y": data.map_y,
        "ground_zone_id": data.ground_zone_id, "phase": data.phase,
        "name": plant["name"], "icon_key": plant["icon_key"],
    }


@router.patch("/plants/{plant_id}/placements/{placement_id}", response_model=SecondaryMarkerOut)
async def update_placement(plant_id: int, placement_id: int, data: PlacementUpdate, db = Depends(db_dep), account = Depends(get_current_account)):
    if not await _owned_placement(db, plant_id, placement_id, account["household_id"]):
        raise HTTPException(status_code=404, detail="Placement not found")
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        await db.execute(
            f"UPDATE plant_placements SET {set_clause} WHERE id = ?",
            list(updates.values()) + [placement_id],
        )
        await db.commit()
    marker = await _fetch_marker(db, placement_id)
    if not marker:
        raise HTTPException(status_code=404, detail="Placement not found")
    return marker


@router.delete("/plants/{plant_id}/placements/{placement_id}")
async def delete_placement(plant_id: int, placement_id: int, db = Depends(db_dep), account = Depends(get_current_account)):
    if not await _owned_placement(db, plant_id, placement_id, account["household_id"]):
        raise HTTPException(status_code=404, detail="Placement not found")
    await db.execute("DELETE FROM plant_placements WHERE id = ?", (placement_id,))
    await db.commit()
    return {"ok": True}


@router.put("/plants/{plant_id}/position", response_model=PlantOut)
async def update_position(plant_id: int, data: PlantPositionUpdate, db = Depends(db_dep), account = Depends(get_current_account)):
    cursor = await db.execute("SELECT id, icon_key, container_id FROM plants WHERE id = ? AND is_active = 1", (plant_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Plant not found")
    new_icon = await resolve_placement_icon(db, row["icon_key"], container_id=None)
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
    new_icon = await resolve_placement_icon(db, row["icon_key"], container_id=data.container_id)
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
    new_icon = await resolve_placement_icon(db, row["icon_key"], container_id=None)
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
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)""",
        (src["name"], src["species"], src.get("species_id"), src["location_id"], src["photo_path"],
         src["pot_size_cm"], src["notes"], src["map_id"], src.get("display_radius_cm"),
         src.get("sun_requirement"), src.get("phase"), src.get("sown_date"), account["household_id"]),
    )
    new_id = new_cursor.lastrowid

    # Copy care schedules
    sched_rows = await db.execute_fetchall(
        "SELECT care_type, interval_days, season_adjust, notes FROM care_schedules WHERE plant_id = ? AND is_active = TRUE",
        (plant_id,),
    )
    for s in sched_rows:
        s = dict(s)
        next_due = calculate_next_due(None, s["interval_days"], s["season_adjust"])
        await db.execute(
            """INSERT INTO care_schedules (plant_id, care_type, interval_days, season_adjust, next_due, notes, is_active)
               VALUES (?, ?, ?, ?, ?, ?, TRUE)""",
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


@router.delete("/plants/bulk-archive")
@router.post("/plants/bulk-archive")
async def bulk_archive_plants(
    body: BulkArchiveInput,
    db = Depends(db_dep),
    account = Depends(get_current_account),
):
    if not body.plant_ids:
        return {"ok": True, "count": 0}
    placeholders = ",".join(["?"] * len(body.plant_ids))
    await db.execute(
        f"UPDATE plants SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id IN ({placeholders})",
        body.plant_ids,
    )
    await db.commit()
    return {"ok": True, "count": len(body.plant_ids)}


@router.delete("/plants/{plant_id}")
async def archive_plant(plant_id: int, db = Depends(db_dep), account = Depends(get_current_account)):
    await db.execute(
        "UPDATE plants SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (plant_id,),
    )
    await db.commit()
    return {"ok": True}


@router.patch("/plants/{plant_id}/restore")
async def restore_plant(plant_id: int, db = Depends(db_dep), account = Depends(get_current_account)):
    await db.execute(
        "UPDATE plants SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (plant_id,),
    )
    await db.commit()
    return {"ok": True}


@router.post("/plants/{plant_id}/photo", response_model=PlantOut)
async def upload_photo(plant_id: int, background: BackgroundTasks, file: UploadFile = File(...),
                       db = Depends(db_dep), account = Depends(get_current_account)):
    """Legacy single-photo endpoint — now creates a photo-journal entry
    (which also gains the household ownership check and thumbnail sync)."""
    from routers.plant_photos import upload_plant_photo
    # Direct call bypasses FastAPI's dependency resolution, so the Form(None)
    # defaults must be passed explicitly or Form objects leak into SQL params.
    await upload_plant_photo(plant_id, background, file=file, note=None,
                             taken_at=None, care_log_id=None, db=db, account=account)
    return await get_plant(plant_id, db=db)
