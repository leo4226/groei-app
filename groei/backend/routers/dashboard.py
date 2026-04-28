from fastapi import APIRouter
from database import get_db
from models import DashboardResponse, CareTask
from datetime import date

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard():
    today = str(date.today())

    async with get_db() as db:
        cursor = await db.execute("""
            SELECT
                cs.id as schedule_id,
                cs.plant_id,
                p.name as plant_name,
                p.photo_path as plant_photo,
                l.name as location,
                cs.care_type,
                cs.next_due,
                cs.last_done_by,
                u.name as last_done_by_name,
                cs.last_done as last_done_at
            FROM care_schedules cs
            JOIN plants p ON cs.plant_id = p.id
            LEFT JOIN locations l ON p.location_id = l.id
            LEFT JOIN users u ON cs.last_done_by = u.id
            WHERE cs.is_active = 1 AND p.is_active = 1
            ORDER BY cs.next_due ASC
        """)
        rows = await cursor.fetchall()

    overdue = []
    due_today = []
    upcoming = []

    for row in rows:
        next_due = row["next_due"]
        days_diff = (date.fromisoformat(next_due) - date.today()).days

        task = CareTask(
            plant_id=row["plant_id"],
            plant_name=row["plant_name"],
            plant_photo=row["plant_photo"],
            location=row["location"],
            care_type=row["care_type"],
            days_overdue=-days_diff,
            last_done_by=row["last_done_by_name"],
            last_done_at=row["last_done_at"],
            schedule_id=row["schedule_id"],
        )

        if days_diff < 0:
            overdue.append(task)
        elif days_diff == 0:
            due_today.append(task)
        elif days_diff <= 7:
            upcoming.append(task)

    # Sort overdue by most overdue first
    overdue.sort(key=lambda t: t.days_overdue, reverse=True)

    return DashboardResponse(overdue=overdue, due_today=due_today, upcoming=upcoming)
