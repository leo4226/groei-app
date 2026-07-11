from fastapi import APIRouter, HTTPException, Depends, Query
from database import db_dep
from models import CareAction, CareUndo, CareLogOut, RecentLogEntry, GardenCareCompleteIn, GardenCareOperationOut
from services.scheduling import calculate_next_due
from services.garden_care import complete_outdoor_care, undo_outdoor_care
from datetime import date, datetime, timedelta
from auth import get_current_account

router = APIRouter(tags=["care"])


@router.post("/care/done")
async def mark_care_done(action: CareAction, db = Depends(db_dep),
                         account = Depends(get_current_account)):
    # Find the matching schedule — scoped to the caller's household
    cursor = await db.execute(
        """SELECT cs.id, cs.interval_days, cs.season_adjust, cs.is_ephemeral,
                  cs.next_due, cs.last_done, cs.last_done_by
           FROM care_schedules cs JOIN plants p ON cs.plant_id = p.id
           WHERE cs.plant_id = ? AND cs.care_type = ? AND cs.is_active = 1
             AND p.household_id = ?""",
        (action.plant_id, action.care_type, account["household_id"]),
    )
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
        next_due = calculate_next_due(
            today, schedule["interval_days"], schedule["season_adjust"]
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
        """SELECT cs.id, cs.interval_days, cs.season_adjust, cs.is_ephemeral
           FROM care_schedules cs JOIN plants p ON cs.plant_id = p.id
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
        next_due = calculate_next_due(
            today, schedule["interval_days"], schedule["season_adjust"]
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
    result = await complete_outdoor_care(
        db,
        household_id=account["household_id"],
        care_type=body.care_type,
        completed_at=completed_at,
        user_id=body.user_id,
        map_id=body.map_id,
    )
    if result["operation_id"] is None:
        raise HTTPException(status_code=404, detail="No eligible outdoor schedules found")
    return GardenCareOperationOut(
        operation_id=result["operation_id"], care_type=body.care_type,
        completed_at=completed_at, affected_count=result["affected_count"],
    )


@router.post("/care/garden/{operation_id}/undo")
async def undo_garden_care(operation_id: int, db=Depends(db_dep),
                           account=Depends(get_current_account)):
    restored = await undo_outdoor_care(
        db, household_id=account["household_id"], operation_id=operation_id,
    )
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
        "UPDATE care_schedules SET interval_days = ? WHERE id = ?",
        (interval, schedule_id),
    )
    await db.commit()
    return {"ok": True, "schedule_id": schedule_id, "interval_days": interval}
