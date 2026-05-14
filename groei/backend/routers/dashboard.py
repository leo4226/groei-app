import json
import random

from fastapi import APIRouter, Depends
from database import db_dep
from auth import get_current_account
from models import DashboardResponse, DashboardV2Response, StatusCounts, RecentLogEntry, CareTask, PlantFactOut
from datetime import date
from services.weather_task_service import sync_ephemeral_schedules

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(db = Depends(db_dep), account = Depends(get_current_account)):
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
        WHERE cs.is_active = 1 AND p.is_active = 1 AND p.household_id = ?
        ORDER BY cs.next_due ASC
    """, (account["household_id"],))
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


@router.get("/plant-fact", response_model=PlantFactOut)
async def get_plant_fact(db = Depends(db_dep), account = Depends(get_current_account)):
    rows = await db.execute_fetchall("""
        SELECT p.id, p.name, p.icon_key, ps.phenology_json, ps.common_name_nl
        FROM plants p
        JOIN plant_species ps ON p.species_id = ps.id
        WHERE p.is_active = 1 AND p.species_id IS NOT NULL AND p.household_id = ?
    """, (account["household_id"],))

    candidates = []
    for row in rows:
        phen_str = row["phenology_json"]
        if not phen_str:
            continue
        try:
            phen = json.loads(phen_str) if isinstance(phen_str, str) else phen_str
        except json.JSONDecodeError:
            continue
        fact = phen.get("interesting_facts_nl", "").strip()
        if not fact:
            continue
        candidates.append(PlantFactOut(
            plant_id=row["id"],
            plant_name=row["name"],
            icon_key=row["icon_key"],
            fact_nl=fact,
            species_name=row["common_name_nl"],
        ))

    if not candidates:
        from fastapi.responses import Response
        return Response(status_code=404)

    return random.choice(candidates)


@router.get("/dashboard/v2", response_model=DashboardV2Response)
async def get_dashboard_v2(db = Depends(db_dep), account = Depends(get_current_account)):
    # Sync weather-driven ephemeral tasks
    await sync_ephemeral_schedules()

    # ── Task lists ──
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
        WHERE cs.is_active = 1 AND p.is_active = 1 AND p.household_id = ?
        ORDER BY cs.next_due ASC
    """, (account["household_id"],))
    rows = await cursor.fetchall()

    overdue, due_today, upcoming = [], [], []
    for row in rows:
        days_diff = (date.fromisoformat(row["next_due"]) - date.today()).days
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
    overdue.sort(key=lambda t: t.days_overdue, reverse=True)

    # ── Status counts ──
    total_row = await db.execute_fetchall(
        "SELECT COUNT(*) as n FROM plants WHERE is_active = 1"
    )
    total = total_row[0]["n"] if total_row else 0

    water_rows = await db.execute_fetchall("""
        SELECT
            SUM(CASE WHEN CAST(julianday('now') - julianday(cs.next_due) AS INTEGER) BETWEEN 1 AND 2 THEN 1 ELSE 0 END) as thirsty,
            SUM(CASE WHEN CAST(julianday('now') - julianday(cs.next_due) AS INTEGER) >= 3 THEN 1 ELSE 0 END) as dry
        FROM care_schedules cs
        JOIN plants p ON cs.plant_id = p.id
        WHERE cs.care_type = 'water' AND cs.is_active = 1 AND p.is_active = 1 AND p.household_id = ?
    """, (account["household_id"],))
    thirsty = int(water_rows[0]["thirsty"] or 0) if water_rows else 0
    dry = int(water_rows[0]["dry"] or 0) if water_rows else 0

    on_schedule_rows = await db.execute_fetchall("""
        SELECT COUNT(DISTINCT p.id) as n
        FROM plants p
        WHERE p.is_active = 1 AND p.household_id = ?
        AND p.id NOT IN (
            SELECT DISTINCT plant_id FROM care_schedules
            WHERE is_active = 1 AND next_due < date('now')
        )
    """, (account["household_id"],))
    on_schedule = on_schedule_rows[0]["n"] if on_schedule_rows else 0

    status_counts = StatusCounts(total=total, on_schedule=on_schedule, thirsty=thirsty, dry=dry)

    # ── Recent log ──
    log_rows = await db.execute_fetchall("""
        SELECT cl.id, cl.plant_id, p.name as plant_name, p.icon_key,
               cl.care_type, cl.done_at, cl.notes
        FROM care_log cl
        JOIN plants p ON cl.plant_id = p.id
        WHERE cl.skipped = 0 AND p.household_id = ?
        ORDER BY cl.done_at DESC
        LIMIT 5
    """, (account["household_id"],))
    recent_log = [
        RecentLogEntry(
            id=r["id"],
            plant_id=r["plant_id"],
            plant_name=r["plant_name"],
            icon_key=r["icon_key"],
            care_type=r["care_type"],
            done_at=r["done_at"],
            notes=r["notes"],
        )
        for r in log_rows
    ]

    # ── Plant fact ──
    fact_rows = await db.execute_fetchall("""
        SELECT p.id, p.name, p.icon_key, ps.phenology_json, ps.common_name_nl
        FROM plants p
        JOIN plant_species ps ON p.species_id = ps.id
        WHERE p.is_active = 1 AND p.species_id IS NOT NULL AND p.household_id = ?
    """, (account["household_id"],))
    candidates = []
    for row in fact_rows:
        phen_str = row["phenology_json"]
        if not phen_str:
            continue
        try:
            phen = json.loads(phen_str) if isinstance(phen_str, str) else phen_str
        except json.JSONDecodeError:
            continue
        fact = phen.get("interesting_facts_nl", "").strip()
        if not fact:
            continue
        candidates.append(PlantFactOut(
            plant_id=row["id"],
            plant_name=row["name"],
            icon_key=row["icon_key"],
            fact_nl=fact,
            species_name=row["common_name_nl"],
        ))
    plant_fact = random.choice(candidates) if candidates else None

    return DashboardV2Response(
        overdue=overdue,
        due_today=due_today,
        upcoming=upcoming,
        status_counts=status_counts,
        recent_log=recent_log,
        plant_fact=plant_fact,
    )
