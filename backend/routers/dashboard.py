import json
import random

from fastapi import APIRouter, Depends
from database import db_dep
from auth import get_current_account
from models import DashboardResponse, DashboardV2Response, StatusCounts, RecentLogEntry, PlantFactOut
from services.weather_task_service import sync_ephemeral_schedules
from services.care_task_service import fetch_household_schedule_rows, classify_care_tasks

router = APIRouter(tags=["dashboard"])


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


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(db = Depends(db_dep), account = Depends(get_current_account)):
    rows = await fetch_household_schedule_rows(db, account["household_id"])
    overdue, due_today, upcoming = classify_care_tasks(rows)
    return DashboardResponse(overdue=overdue, due_today=due_today, upcoming=upcoming)


@router.get("/plant-fact", response_model=PlantFactOut)
async def get_plant_fact(db = Depends(db_dep), account = Depends(get_current_account)):
    candidates = await _plant_fact_candidates(db, account["household_id"])
    if not candidates:
        from fastapi.responses import Response
        return Response(status_code=404)
    return random.choice(candidates)


@router.get("/dashboard/v2", response_model=DashboardV2Response)
async def get_dashboard_v2(db = Depends(db_dep), account = Depends(get_current_account)):
    # Sync weather-driven ephemeral tasks first
    await sync_ephemeral_schedules()

    # ── Care tasks ──
    rows = await fetch_household_schedule_rows(db, account["household_id"])
    overdue, due_today, upcoming = classify_care_tasks(rows)

    # ── Status counts ──
    total_row = await db.execute_fetchall(
        "SELECT COUNT(*) as n FROM plants WHERE is_active = 1 AND household_id = ?",
        (account["household_id"],)
    )
    total = total_row[0]["n"] if total_row else 0

    # Derived from the already-classified overdue list — always consistent with the task list
    thirsty = sum(1 for t in overdue if t.care_type == 'water' and 1 <= t.days_overdue <= 2)
    dry = sum(1 for t in overdue if t.care_type == 'water' and t.days_overdue >= 3)

    on_schedule_rows = await db.execute_fetchall("""
        SELECT COUNT(DISTINCT p.id) as n
        FROM plants p
        WHERE p.is_active = 1 AND p.household_id = ?
        AND p.id NOT IN (
            SELECT DISTINCT plant_id FROM care_schedules
            WHERE is_active = 1 AND next_due < CURRENT_DATE
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
            done_at=str(r["done_at"]),
            notes=r["notes"],
        )
        for r in log_rows
    ]

    # ── Plant fact ──
    candidates = await _plant_fact_candidates(db, account["household_id"])
    plant_fact = random.choice(candidates) if candidates else None

    return DashboardV2Response(
        overdue=overdue,
        due_today=due_today,
        upcoming=upcoming,
        status_counts=status_counts,
        recent_log=recent_log,
        plant_fact=plant_fact,
    )
