from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from database import db_dep
from auth import get_current_account
from models import CalendarEventOut

router = APIRouter(tags=["calendar"])


@router.get("/calendar/events", response_model=list[CalendarEventOut])
async def list_calendar_events(
    from_: str = Query(..., alias="from"),
    to: str = Query(...),
    account = Depends(get_current_account),
    db = Depends(db_dep),
):
    try:
        date.fromisoformat(from_)
        date.fromisoformat(to)
    except ValueError:
        raise HTTPException(400, "Invalid date — expected YYYY-MM-DD")

    rows = await db.execute_fetchall(
        """
        SELECT
            cs.id           AS schedule_id,
            cs.plant_id     AS plant_id,
            cs.care_type    AS type,
            cs.next_due     AS due_date,
            p.name          AS plant_name,
            p.icon_key      AS plant_icon_variant
        FROM care_schedules cs
        JOIN plants p ON p.id = cs.plant_id
        WHERE cs.is_active = 1
          AND p.household_id = ?
          AND cs.next_due BETWEEN ? AND ?
        ORDER BY cs.next_due, cs.care_type
        """,
        (account["household_id"], from_, to),
    )

    today = date.today().isoformat()
    return [
        CalendarEventOut(
            id=f"schedule:{r['schedule_id']}:{r['type']}",
            date=r["due_date"],
            type=r["type"],
            plant_id=r["plant_id"],
            plant_name=r["plant_name"],
            plant_icon_variant=r["plant_icon_variant"],
            schedule_id=r["schedule_id"],
            overdue=r["due_date"] < today,
        )
        for r in rows
    ]
