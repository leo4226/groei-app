from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from database import db_dep
from auth import get_current_account
from models import CalendarEventOut
from services.warnings import compute_plant_warnings, CareWarning

router = APIRouter(tags=["calendar"])


def _care_warning_to_dict(w: CareWarning) -> dict:
    """Convert a CareWarning dataclass to the dict shape the client expects."""
    return {
        "severity": w.severity,
        "color": w.color,
        "icon": w.icon,
    }


@router.get("/calendar/events", response_model=list[CalendarEventOut])
async def list_calendar_events(
    from_: str = Query(..., alias="from"),
    to: str = Query(...),
    env: str | None = Query(None),
    account = Depends(get_current_account),
    db = Depends(db_dep),
):
    try:
        from_dt = date.fromisoformat(from_)
        to_dt = date.fromisoformat(to)
    except ValueError:
        raise HTTPException(400, "Invalid date — expected YYYY-MM-DD")

    # Validate env filter
    if env and env not in ('tuin', 'huis'):
        raise HTTPException(400, "env must be 'tuin' or 'huis'")

    # 1. Fetch all plants in the household, optionally filtered by env
    plant_params: tuple = (account["household_id"],)

    plants = await db.execute_fetchall(
        "SELECT p.id, p.name, m.map_type, p.container_id, p.ground_zone_id, "
        "p.care_profile, p.care_thresholds, p.icon_key "
        "FROM plants p LEFT JOIN maps m ON p.map_id = m.id "
        "WHERE p.household_id = ? AND p.is_active = 1",
        plant_params,
    )

    # Apply env filter in Python (same logic as warnings/summary)
    if env == 'tuin':
        plants = [p for p in plants if p['map_type'] != 'indoor']
    elif env == 'huis':
        plants = [p for p in plants if p['map_type'] == 'indoor']
    plant_map = {p["id"]: dict(p) for p in plants}

    # 2. Fetch all schedules in date range (limited to env plants if specified)
    if env and not plants:
        # No plants match the filter — return empty
        return []
    if env:
        placeholders = ','.join('?' * len(plants))
        sched_params = (account["household_id"],) + tuple(p["id"] for p in plants) + (from_dt, to_dt)
        extra_where = f" AND cs.plant_id IN ({placeholders})"
    else:
        sched_params = (account["household_id"], from_dt, to_dt)
        extra_where = ""

    rows = await db.execute_fetchall(
        """
        SELECT
            cs.id           AS schedule_id,
            cs.plant_id     AS plant_id,
            cs.care_type    AS type,
            cs.next_due     AS due_date,
            cs.last_done    AS last_done,
            p.name          AS plant_name,
            p.icon_key      AS plant_icon_variant
        FROM care_schedules cs
        JOIN plants p ON p.id = cs.plant_id
        WHERE cs.is_active = 1
          AND p.household_id = ?
          """ + extra_where + """
          AND cs.next_due BETWEEN ? AND ?
        ORDER BY cs.next_due, cs.care_type
        """,
        sched_params,
    )

    # 3. Group schedules by plant for efficient warning computation
    from collections import defaultdict
    schedules_by_plant: dict[int, list[dict]] = defaultdict(list)
    for r in rows:
        schedules_by_plant[r["plant_id"]].append(dict(r))

    # 4. Compute warnings once per plant, build enrichment cache
    # cache key: (plant_id, care_type) -> dict {severity, color, icon}
    enrichment_cache: dict[tuple[int, str], dict] = {}
    today_date = date.today()

    for pid, scheds in schedules_by_plant.items():
        plant = plant_map.get(pid)
        if not plant:
            continue
        warn_plant = {
            "id": pid,
            "map_type": plant.get("map_type"),
            "container_id": plant.get("container_id"),
            "ground_zone_id": plant.get("ground_zone_id"),
            "care_profile": plant.get("care_profile"),
            "care_thresholds": plant.get("care_thresholds"),
        }
        try:
            state = compute_plant_warnings(
                warn_plant, scheds, weather=None, today=today_date
            )
            for w in state.warnings:
                enrichment_cache[(pid, w.care_type)] = _care_warning_to_dict(w)
        except Exception:
            # Graceful degradation: don't break calendar on warning computation
            pass

    # 5. Build enriched events
    today = today_date  # keep as date object for safe comparison
    events = []
    for r in rows:
        pid = r["plant_id"]
        ct = r["type"]
        enrichment = enrichment_cache.get((pid, ct), {})

        # Normalise: asyncpg returns datetime.date; aiosqlite returns str
        due = r["due_date"]
        if isinstance(due, str):
            due = date.fromisoformat(due)

        events.append(CalendarEventOut(
            id=f"schedule:{r['schedule_id']}:{r['type']}",
            date=due.isoformat(),
            type=ct,
            plant_id=pid,
            plant_name=r["plant_name"],
            plant_icon_variant=r["plant_icon_variant"],
            schedule_id=r["schedule_id"],
            overdue=due < today,
            severity=enrichment.get("severity"),
            color=enrichment.get("color"),
            icon=enrichment.get("icon"),
        ))

    return events
