import json
import random
from fastapi import APIRouter, HTTPException, Depends, Query
from database import db_dep
from models import (
    CareAction, CareUndo, CareLogOut, RecentLogEntry, PlantFactOut,
    GardenCareCompleteIn, GardenCareOperationOut,
    MapWateringRoundCompleteIn, MapWateringRoundOut,
    MoistureCheckResolveIn, MoistureCheckResolveOut,
)
from services.scheduling import calculate_next_due
from services.garden_care import (
    GardenCareSelectionError,
    GardenCareUndoConflict,
    can_undo_outdoor_care,
    complete_outdoor_care,
    schedule_interval_days,
    undo_outdoor_care,
)
from services.moisture_check_service import (
    MoistureCheckSelectionError,
    resolve_moisture_checks,
)
from datetime import date, datetime, timedelta
from auth import get_current_account

router = APIRouter(tags=["care"])


async def _get_household_map(db, *, map_id: int, household_id: int) -> dict:
    maps = await db.execute_fetchall(
        """SELECT id, name
           FROM maps
           WHERE id = ? AND household_id = ?""",
        (map_id, household_id),
    )
    if not maps:
        raise HTTPException(status_code=404, detail={"code": "map_not_found"})
    return maps[0]


@router.get(
    "/care/maps/{map_id}/watering-round",
    response_model=MapWateringRoundOut,
)
async def get_map_watering_round(
    map_id: int,
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    map_row = await _get_household_map(
        db,
        map_id=map_id,
        household_id=account["household_id"],
    )

    members = await db.execute_fetchall(
        """SELECT cs.id AS schedule_id,
                  p.id AS plant_id,
                  p.name AS plant_name,
                  p.icon_key AS plant_icon_variant,
                  cs.next_due AS canonical_date,
                  cs.rhythm_opt_out
           FROM care_schedules cs
           JOIN plants p ON p.id = cs.plant_id
           WHERE p.household_id = ?
             AND p.map_id = ?
             AND p.is_active = 1
             AND cs.care_type = 'water'
             AND cs.is_active = 1
           ORDER BY LOWER(p.name), cs.id""",
        (account["household_id"], map_id),
    )
    history_rows = await db.execute_fetchall(
        """SELECT operation.id AS operation_id,
                  operation.completed_at,
                  operation.completed_by,
                  completed_user.name AS completed_by_name,
                  COUNT(member.schedule_id) AS affected_count
           FROM garden_care_operations operation
           LEFT JOIN garden_care_operation_members member
             ON member.operation_id = operation.id
           LEFT JOIN users completed_user
             ON completed_user.id = operation.completed_by
           WHERE operation.household_id = ?
             AND operation.map_id = ?
             AND operation.care_type = 'water'
             AND operation.undone_at IS NULL
           GROUP BY operation.id, operation.completed_at,
                    operation.completed_by, completed_user.name
           ORDER BY operation.completed_at DESC, operation.id DESC
           LIMIT 3""",
        (account["household_id"], map_id),
    )
    history = [
        {**dict(row), "can_undo": False}
        for row in history_rows
    ]
    if history:
        history[0]["can_undo"] = await can_undo_outdoor_care(
            db,
            household_id=account["household_id"],
            operation_id=history[0]["operation_id"],
        )
    return {
        "map_id": map_row["id"],
        "map_name": map_row["name"],
        "members": members,
        "history": history,
    }


@router.post(
    "/care/maps/{map_id}/watering-round/complete",
    response_model=GardenCareOperationOut,
)
async def complete_map_watering_round(
    map_id: int,
    body: MapWateringRoundCompleteIn,
    db=Depends(db_dep),
    account=Depends(get_current_account),
):
    await _get_household_map(
        db,
        map_id=map_id,
        household_id=account["household_id"],
    )
    completed_at = body.completed_at or date.today()
    try:
        result = await complete_outdoor_care(
            db,
            household_id=account["household_id"],
            care_type="water",
            completed_at=completed_at,
            user_id=body.user_id,
            map_id=map_id,
            schedule_ids=body.schedule_ids,
            completion_mode="map_round",
        )
    except GardenCareSelectionError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_map_watering_selection"},
        ) from exc
    if result["operation_id"] is None:
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_map_watering_selection"},
        )
    return {
        **result,
        "care_type": "water",
        "completed_at": completed_at,
    }


@router.post("/care/done")
async def mark_care_done(action: CareAction, db = Depends(db_dep),
                         account = Depends(get_current_account)):
    # Find the matching schedule — scoped to the caller's household
    schedule_query = """SELECT cs.id, cs.interval_days, cs.season_adjust, cs.is_ephemeral,
                               cs.next_due, cs.last_done, cs.last_done_by,
                               p.container_id, COALESCE(m.map_type, 'outdoor') AS map_type
                        FROM care_schedules cs JOIN plants p ON cs.plant_id = p.id
                        LEFT JOIN maps m ON m.id = p.map_id
                        WHERE cs.plant_id = ? AND cs.care_type = ? AND cs.is_active = 1
                          AND p.household_id = ?"""
    schedule_params: tuple = (
        action.plant_id,
        action.care_type,
        account["household_id"],
    )
    if action.schedule_id is not None:
        schedule_query += " AND cs.id = ?"
        schedule_params += (action.schedule_id,)
    cursor = await db.execute(schedule_query, schedule_params)
    schedule = await cursor.fetchone()
    if not schedule:
        raise HTTPException(status_code=404, detail="No active schedule found")

    now = datetime.now()
    today = date.today()

    # Insert care log (id returned so the client can attach a photo to it)
    cursor = await db.execute(
        """INSERT INTO care_log (plant_id, care_type, done_by, done_at, notes, skipped)
           VALUES (?, ?, ?, ?, ?, FALSE)""",
        (action.plant_id, action.care_type, action.user_id, now, action.notes),
    )
    care_log_id = cursor.lastrowid

    # Capture previous state for undo support
    previous_next_due = schedule.get("next_due")
    previous_last_done = schedule.get("last_done")
    previous_last_done_by = schedule.get("last_done_by")

    # Update schedule
    if schedule["is_ephemeral"]:
        next_due = today + timedelta(days=1)
    else:
        interval_days = schedule_interval_days(schedule, action.care_type)
        if interval_days is None:
            raise HTTPException(status_code=422, detail="Invalid schedule interval")
        next_due = calculate_next_due(
            today, interval_days, schedule["season_adjust"]
        )
    await db.execute(
        """UPDATE care_schedules
           SET last_done = ?, last_done_by = ?, next_due = ?
           WHERE id = ?""",
        (now, action.user_id, next_due, schedule["id"]),
    )

    await db.commit()
    return {
        "ok": True, "next_due": str(next_due), "care_log_id": care_log_id,
        "previous_next_due": str(previous_next_due) if previous_next_due else None,
        "previous_last_done": str(previous_last_done) if previous_last_done else None,
        "previous_last_done_by": previous_last_done_by,
    }


@router.post("/care/skip")
async def skip_care(action: CareAction, db = Depends(db_dep),
                    account = Depends(get_current_account)):
    cursor = await db.execute(
        """SELECT cs.id, cs.interval_days, cs.season_adjust, cs.is_ephemeral,
                  p.container_id, COALESCE(m.map_type, 'outdoor') AS map_type
           FROM care_schedules cs JOIN plants p ON cs.plant_id = p.id
           LEFT JOIN maps m ON m.id = p.map_id
           WHERE cs.plant_id = ? AND cs.care_type = ? AND cs.is_active = 1
             AND p.household_id = ?""",
        (action.plant_id, action.care_type, account["household_id"]),
    )
    schedule = await cursor.fetchone()
    if not schedule:
        raise HTTPException(status_code=404, detail="No active schedule found")

    now = datetime.now()
    today = date.today()

    # Insert care log with skipped=1
    await db.execute(
        """INSERT INTO care_log (plant_id, care_type, done_by, done_at, notes, skipped)
           VALUES (?, ?, ?, ?, ?, TRUE)""",
        (action.plant_id, action.care_type, action.user_id, now, action.notes),
    )

    # Advance next_due
    if schedule["is_ephemeral"]:
        next_due = today + timedelta(days=1)
    else:
        interval_days = schedule_interval_days(schedule, action.care_type)
        if interval_days is None:
            raise HTTPException(status_code=422, detail="Invalid schedule interval")
        next_due = calculate_next_due(
            today, interval_days, schedule["season_adjust"]
        )
    await db.execute(
        "UPDATE care_schedules SET next_due = ? WHERE id = ?",
        (next_due, schedule["id"]),
    )

    await db.commit()
    return {"ok": True, "next_due": str(next_due)}


@router.post("/care/garden/complete", response_model=GardenCareOperationOut)
async def complete_garden_care(body: GardenCareCompleteIn, db=Depends(db_dep),
                               account=Depends(get_current_account)):
    completed_at = body.completed_at or date.today()
    try:
        result = await complete_outdoor_care(
            db,
            household_id=account["household_id"],
            care_type=body.care_type,
            completed_at=completed_at,
            user_id=body.user_id,
            map_id=body.map_id,
            schedule_ids=body.schedule_ids,
        )
    except GardenCareSelectionError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_grouped_schedule_selection"},
        ) from exc
    if result["operation_id"] is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "no_eligible_grouped_schedules"},
        )
    return GardenCareOperationOut(
        operation_id=result["operation_id"], care_type=body.care_type,
        completed_at=completed_at, affected_count=result["affected_count"],
    )


@router.post(
    "/care/moisture-checks/resolve",
    response_model=MoistureCheckResolveOut,
)
async def resolve_moisture_check_session(
    body: MoistureCheckResolveIn,
    account=Depends(get_current_account),
    db=Depends(db_dep),
):
    try:
        return await resolve_moisture_checks(
            db,
            household_id=account["household_id"],
            map_id=body.map_id,
            check_schedule_ids=body.check_schedule_ids,
            outcome=body.outcome,
            completed_at=body.completed_at,
            user_id=body.user_id,
        )
    except MoistureCheckSelectionError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": str(exc)},
        ) from exc


@router.post("/care/garden/{operation_id}/undo")
async def undo_garden_care(operation_id: int, db=Depends(db_dep),
                           account=Depends(get_current_account)):
    try:
        restored = await undo_outdoor_care(
            db, household_id=account["household_id"], operation_id=operation_id,
        )
    except GardenCareUndoConflict as exc:
        raise HTTPException(
            status_code=409,
            detail={"code": "garden_care_undo_conflict"},
        ) from exc
    if not restored:
        raise HTTPException(status_code=404, detail="Garden care operation not found")
    return {"ok": True}


@router.delete("/care/schedules/{schedule_id}")
async def delete_care_schedule(schedule_id: int, db = Depends(db_dep),
                               account = Depends(get_current_account)):
    cursor = await db.execute(
        """SELECT cs.id FROM care_schedules cs
           JOIN plants p ON cs.plant_id = p.id
           WHERE cs.id = ? AND cs.is_active = 1 AND p.household_id = ?""",
        (schedule_id, account["household_id"]),
    )
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Schedule not found")
    await db.execute(
        "UPDATE care_schedules SET is_active = FALSE WHERE id = ?",
        (schedule_id,),
    )
    await db.commit()
    return {"ok": True}


@router.get("/care/log", response_model=list[RecentLogEntry])
async def get_household_care_log(
    account = Depends(get_current_account),
    db = Depends(db_dep),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    rows = await db.execute_fetchall("""
        SELECT cl.id, cl.plant_id, p.name as plant_name, p.icon_key,
               cl.care_type, cl.done_at, cl.notes
        FROM care_log cl
        JOIN plants p ON cl.plant_id = p.id
        WHERE cl.skipped = 0 AND p.household_id = ?
        ORDER BY cl.done_at DESC
        LIMIT ? OFFSET ?
    """, (account["household_id"], limit, offset))
    return [
        RecentLogEntry(
            id=r["id"],
            plant_id=r["plant_id"],
            plant_name=r["plant_name"],
            icon_key=r["icon_key"],
            care_type=r["care_type"],
            done_at=str(r["done_at"]),
            notes=r["notes"],
        )
        for r in rows
    ]


@router.get("/care/log/{plant_id}", response_model=list[CareLogOut])
async def get_care_log(plant_id: int, db = Depends(db_dep),
                       account = Depends(get_current_account)):
    cursor = await db.execute(
        """SELECT cl.*, u.name as done_by_name
           FROM care_log cl
           JOIN plants p ON cl.plant_id = p.id
           LEFT JOIN users u ON cl.done_by = u.id
           WHERE cl.plant_id = ? AND p.household_id = ?
           ORDER BY cl.done_at DESC
           LIMIT 50""",
        (plant_id, account["household_id"]),
    )
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]


@router.post("/care/undo")
async def undo_care_done(action: CareUndo, db = Depends(db_dep),
                          account = Depends(get_current_account)):
    # Find the care log — scoped to the caller's household
    cursor = await db.execute(
        """SELECT cl.id, cl.plant_id, cl.care_type
           FROM care_log cl
           JOIN plants p ON cl.plant_id = p.id
           WHERE cl.id = ? AND p.household_id = ?""",
        (action.care_log_id, account["household_id"]),
    )
    log_entry = await cursor.fetchone()
    if not log_entry:
        raise HTTPException(status_code=404, detail="Care log entry not found")

    # Find the matching schedule
    cursor = await db.execute(
        """SELECT cs.id FROM care_schedules cs
           JOIN plants p ON cs.plant_id = p.id
           WHERE cs.plant_id = ? AND cs.care_type = ? AND cs.is_active = 1
             AND p.household_id = ?""",
        (log_entry["plant_id"], log_entry["care_type"], account["household_id"]),
    )
    schedule = await cursor.fetchone()
    if not schedule:
        raise HTTPException(status_code=404, detail="No active schedule found")

    # Restore schedule state to before the care action
    await db.execute(
        """UPDATE care_schedules
           SET last_done = ?, last_done_by = ?, next_due = ?
           WHERE id = ?""",
        (action.previous_last_done, action.previous_last_done_by,
         action.previous_next_due, schedule["id"]),
    )

    # Delete the care log entry
    await db.execute("DELETE FROM care_log WHERE id = ?", (action.care_log_id,))

    await db.commit()
    return {"ok": True}

@router.patch("/care/schedules/{schedule_id}")
async def update_schedule_interval(
    schedule_id: int,
    body: dict,
    db = Depends(db_dep),
    account = Depends(get_current_account),
):
    interval = body.get("interval_days")
    if not isinstance(interval, int) or interval < 1:
        raise HTTPException(status_code=422, detail="interval_days must be a positive integer")

    # Scope to caller's household via plant join
    cursor = await db.execute(
        """SELECT cs.id, cs.care_type FROM care_schedules cs
           JOIN plants p ON cs.plant_id = p.id
           WHERE cs.id = ? AND cs.is_active = 1
             AND p.household_id = ?""",
        (schedule_id, account["household_id"]),
    )
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Schedule not found")

    # Don't allow changing photo schedule interval via this endpoint
    if row["care_type"] == "photo":
        raise HTTPException(status_code=400, detail="Photo schedule interval is managed via the photo-reminder endpoint")

    await db.execute(
        """UPDATE care_schedules
           SET interval_days = ?,
               interval_source = 'manual',
               rhythm_opt_out = CASE
                   WHEN care_type = 'water' THEN TRUE
                   ELSE rhythm_opt_out
               END,
               rhythm_operation_id = NULL
           WHERE id = ?""",
        (interval, schedule_id),
    )
    await db.commit()
    return {"ok": True, "schedule_id": schedule_id, "interval_days": interval}



async def _plant_fact_candidates(db, household_id: int) -> list[PlantFactOut]:
    rows = await db.execute_fetchall("""
        SELECT p.id, p.name, p.icon_key, ps.phenology_json, ps.common_name_nl, ps.common_name_en
        FROM plants p
        JOIN plant_species ps ON p.species_id = ps.id
        WHERE p.is_active = 1 AND p.species_id IS NOT NULL AND p.household_id = ?
    """, (household_id,))

    candidates = []
    for row in rows:
        phen_str = row["phenology_json"]
        if not phen_str:
            continue
        try:
            phen = json.loads(phen_str) if isinstance(phen_str, str) else phen_str
        except json.JSONDecodeError:
            continue
        fact_nl = phen.get("interesting_facts_nl", "").strip()
        fact_en = phen.get("interesting_facts_en", "").strip()
        if not fact_nl and not fact_en:
            continue
        candidates.append(PlantFactOut(
            plant_id=row["id"],
            plant_name=row["name"],
            icon_key=row["icon_key"],
            fact_nl=fact_nl,
            fact_en=fact_en,
            species_name_nl=row["common_name_nl"],
            species_name_en=row.get("common_name_en") or None,
        ))
    return candidates


@router.get("/plant-fact", response_model=PlantFactOut)
async def get_plant_fact(db = Depends(db_dep), account = Depends(get_current_account)):
    candidates = await _plant_fact_candidates(db, account["household_id"])
    if not candidates:
        from fastapi.responses import Response
        return Response(status_code=404)
    return random.choice(candidates)
