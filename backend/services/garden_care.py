"""Server-side grouped outdoor care operations with reversible schedule snapshots."""
from datetime import date, datetime

from services.scheduling import calculate_next_due


async def complete_outdoor_care(db, *, household_id: int, care_type: str, completed_at: date, user_id: int) -> dict:
    schedules = await db.execute_fetchall(
        """SELECT cs.id, cs.plant_id, cs.interval_days, cs.season_adjust,
                  cs.next_due, cs.last_done, cs.last_done_by
           FROM care_schedules cs
           JOIN plants p ON p.id = cs.plant_id
           LEFT JOIN maps m ON m.id = p.map_id
           WHERE p.household_id = ? AND p.is_active = 1 AND cs.is_active = 1
             AND cs.care_type = ? AND COALESCE(m.map_type, 'outdoor') <> 'indoor'""",
        (household_id, care_type),
    )
    if not schedules:
        return {"operation_id": None, "affected_count": 0}

    operation = await db.execute_fetchall(
        """INSERT INTO garden_care_operations
           (household_id, care_type, completed_at, completed_by)
           VALUES (?, ?, ?, ?) RETURNING id""",
        (household_id, care_type, completed_at, user_id),
    )
    operation_id = operation[0]["id"]
    done_at = datetime.combine(completed_at, datetime.min.time())

    for schedule in schedules:
        log = await db.execute_fetchall(
            """INSERT INTO care_log (plant_id, care_type, done_by, done_at, skipped)
               VALUES (?, ?, ?, ?, FALSE) RETURNING id""",
            (schedule["plant_id"], care_type, user_id, done_at),
        )
        next_due = calculate_next_due(completed_at, schedule["interval_days"], schedule["season_adjust"])
        await db.execute(
            """INSERT INTO garden_care_operation_members
               (operation_id, schedule_id, previous_next_due, previous_last_done,
                previous_last_done_by, care_log_id)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (operation_id, schedule["id"], schedule["next_due"], schedule.get("last_done"),
             schedule.get("last_done_by"), log[0]["id"]),
        )
        await db.execute(
            """UPDATE care_schedules SET last_done = ?, last_done_by = ?, next_due = ?
               WHERE id = ?""",
            (done_at, user_id, next_due, schedule["id"]),
        )

    await db.commit()
    return {"operation_id": operation_id, "affected_count": len(schedules)}


async def undo_outdoor_care(db, *, household_id: int, operation_id: int) -> bool:
    operations = await db.execute_fetchall(
        """SELECT id FROM garden_care_operations
           WHERE id = ? AND household_id = ? AND undone_at IS NULL""",
        (operation_id, household_id),
    )
    if not operations:
        return False
    members = await db.execute_fetchall(
        """SELECT schedule_id, previous_next_due, previous_last_done,
                  previous_last_done_by, care_log_id
           FROM garden_care_operation_members WHERE operation_id = ?""",
        (operation_id,),
    )
    for member in members:
        await db.execute(
            """UPDATE care_schedules SET next_due = ?, last_done = ?, last_done_by = ?
               WHERE id = ?""",
            (member["previous_next_due"], member.get("previous_last_done"),
             member.get("previous_last_done_by"), member["schedule_id"]),
        )
        if member.get("care_log_id"):
            await db.execute("DELETE FROM care_log WHERE id = ?", (member["care_log_id"],))
    await db.execute("UPDATE garden_care_operations SET undone_at = CURRENT_TIMESTAMP WHERE id = ?", (operation_id,))
    await db.commit()
    return True
