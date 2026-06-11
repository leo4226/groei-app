from fastapi import APIRouter, HTTPException, Depends, Query
from database import db_dep
from models import CareAction, CareLogOut, RecentLogEntry
from services.scheduling import calculate_next_due
from datetime import date, datetime, timedelta
from auth import get_current_account

router = APIRouter(tags=["care"])


@router.post("/care/done")
async def mark_care_done(action: CareAction, db = Depends(db_dep)):
    # Find the matching schedule
    cursor = await db.execute(
        """SELECT id, interval_days, season_adjust, is_ephemeral FROM care_schedules
           WHERE plant_id = ? AND care_type = ? AND is_active = 1""",
        (action.plant_id, action.care_type),
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
    return {"ok": True, "next_due": str(next_due), "care_log_id": care_log_id}


@router.post("/care/skip")
async def skip_care(action: CareAction, db = Depends(db_dep)):
    cursor = await db.execute(
        """SELECT id, interval_days, season_adjust, is_ephemeral FROM care_schedules
           WHERE plant_id = ? AND care_type = ? AND is_active = 1""",
        (action.plant_id, action.care_type),
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


@router.delete("/care/schedules/{schedule_id}")
async def delete_care_schedule(schedule_id: int, db = Depends(db_dep)):
    cursor = await db.execute(
        "SELECT id FROM care_schedules WHERE id = ? AND is_active = 1",
        (schedule_id,),
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
async def get_care_log(plant_id: int, db = Depends(db_dep)):
    cursor = await db.execute(
        """SELECT cl.*, u.name as done_by_name
           FROM care_log cl
           LEFT JOIN users u ON cl.done_by = u.id
           WHERE cl.plant_id = ?
           ORDER BY cl.done_at DESC
           LIMIT 50""",
        (plant_id,),
    )
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]
