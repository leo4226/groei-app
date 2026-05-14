from fastapi import APIRouter, Depends
from database import db_dep
from models import DashboardResponse, CareTask
from datetime import date
from services.weather_task_service import sync_ephemeral_schedules

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(db = Depends(db_dep)):
    today = str(date.today())

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


@router.get("/dashboard-v2", response_model=DashboardResponse)
async def get_dashboard_v2(db = Depends(db_dep)):
    # Sync weather-driven ephemeral tasks
    await sync_ephemeral_schedules()

    today = str(date.today())

    cursor = await db.execute("""
        SELECT
            cs.id as schedule_id,
            cs.plant_id,
            p.name as plant_name,
            p.photo_path as plant_photo,
            l.name as location,
            m.map_type,
            cs.care_type,
            cs.next_due,
            cs.last_done_by,
            u.name as last_done_by_name,
            cs.last_done as last_done_at,
            cs.is_ephemeral
        FROM care_schedules cs
        JOIN plants p ON cs.plant_id = p.id
        LEFT JOIN locations l ON p.location_id = l.id
        LEFT JOIN maps m ON p.map_id = m.id
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
            map_type=row["map_type"],
            care_type=row["care_type"],
            days_overdue=-days_diff,
            last_done_by=row["last_done_by_name"],
            last_done_at=row["last_done_at"],
            schedule_id=row["schedule_id"],
            is_ephemeral=bool(row["is_ephemeral"]) if row["is_ephemeral"] is not None else False,
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
