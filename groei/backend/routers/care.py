from fastapi import APIRouter, HTTPException, Depends
from database import db_dep
from models import CareAction, CareLogOut
from services.scheduling import calculate_next_due
from datetime import date, datetime

router = APIRouter(tags=["care"])


@router.post("/care/done")
async def mark_care_done(action: CareAction, db = Depends(db_dep)):
    # Find the matching schedule
    cursor = await db.execute(
        """SELECT id, interval_days, season_adjust FROM care_schedules
           WHERE plant_id = ? AND care_type = ? AND is_active = 1""",
        (action.plant_id, action.care_type),
    )
    schedule = await cursor.fetchone()
    if not schedule:
        raise HTTPException(status_code=404, detail="No active schedule found")

    now = datetime.now().isoformat()
    today = date.today()

    # Insert care log
    await db.execute(
        """INSERT INTO care_log (plant_id, care_type, done_by, done_at, notes, skipped)
           VALUES (?, ?, ?, ?, ?, 0)""",
        (action.plant_id, action.care_type, action.user_id, now, action.notes),
    )

    # Update schedule
    next_due = calculate_next_due(
        today, schedule["interval_days"], schedule["season_adjust"]
    )
    await db.execute(
        """UPDATE care_schedules
           SET last_done = ?, last_done_by = ?, next_due = ?
           WHERE id = ?""",
        (now, action.user_id, str(next_due), schedule["id"]),
    )

    await db.commit()
    return {"ok": True, "next_due": str(next_due)}


@router.post("/care/skip")
async def skip_care(action: CareAction, db = Depends(db_dep)):
    cursor = await db.execute(
        """SELECT id, interval_days, season_adjust FROM care_schedules
           WHERE plant_id = ? AND care_type = ? AND is_active = 1""",
        (action.plant_id, action.care_type),
    )
    schedule = await cursor.fetchone()
    if not schedule:
        raise HTTPException(status_code=404, detail="No active schedule found")

    now = datetime.now().isoformat()
    today = date.today()

    # Insert care log with skipped=1
    await db.execute(
        """INSERT INTO care_log (plant_id, care_type, done_by, done_at, notes, skipped)
           VALUES (?, ?, ?, ?, ?, 1)""",
        (action.plant_id, action.care_type, action.user_id, now, action.notes),
    )

    # Advance next_due
    next_due = calculate_next_due(
        today, schedule["interval_days"], schedule["season_adjust"]
    )
    await db.execute(
        "UPDATE care_schedules SET next_due = ? WHERE id = ?",
        (str(next_due), schedule["id"]),
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
        "UPDATE care_schedules SET is_active = 0 WHERE id = ?",
        (schedule_id,),
    )
    await db.commit()
    return {"ok": True}


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
