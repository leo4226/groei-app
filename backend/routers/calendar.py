from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from database import db_dep
from auth import get_current_account
from models import CalendarEventOut
from services.warnings import compute_plant_warnings, CareWarning
from services.scheduling import calculate_effective_interval
from services.calendar_grouping import get_calendar_grouping_preferences

router = APIRouter(tags=["calendar"])

# Safety caps
MAX_RANGE_DAYS = 366   # refuse ranges longer than a year
MAX_OCCURRENCES = 200  # per schedule


def _care_warning_to_dict(w: CareWarning) -> dict:
    """Convert a CareWarning dataclass to the dict shape the client expects."""
    return {
        "severity": w.severity,
        "color": w.color,
        "icon": w.icon,
    }


def _generate_occurrences(
    next_due: date,
    interval_days: int,
    season_adjust: str | None,
    from_dt: date,
    to_dt: date,
) -> list[date]:
    """Generate all occurrence dates for a schedule that fall in [from_dt, to_dt].

    Starts at `next_due` and repeatedly adds the effective interval
    (season-adjusted) until we pass `to_dt`. Only returns dates >= from_dt.
    """
    occurrences: list[date] = []
    current = next_due
    count = 0

    while current <= to_dt and count < MAX_OCCURRENCES:
        if current >= from_dt:
            occurrences.append(current)
        effective = calculate_effective_interval(interval_days, season_adjust, current)
        current = current + timedelta(days=effective)
        count += 1

    return occurrences


def _group_outdoor_events(
    events: list[CalendarEventOut], *, care_types: set[str], map_ids: set[int],
) -> list[CalendarEventOut]:
    grouped: dict[tuple[str, str, int], list[CalendarEventOut]] = {}
    retained: list[CalendarEventOut] = []
    for event in events:
        if (
            event.map_id in map_ids
            and event.type in care_types
            and not event.weather_triggered
        ):
            grouped.setdefault((event.date, event.type, event.map_id), []).append(event)
        else:
            retained.append(event)
    for (event_date, care_type, map_id), members in grouped.items():
        first = members[0]
        retained.append(CalendarEventOut(
            id=f"garden:{map_id}:{care_type}:{event_date}", date=event_date, type=care_type,
            plant_id=None, plant_name=None, plant_icon_variant=None, schedule_id=None,
            map_id=map_id, map_name=first.map_name,
            overdue=any(member.overdue for member in members), grouped=True,
            group_count=len(members),
            group_member_schedule_ids=[member.schedule_id for member in members if member.schedule_id is not None],
        ))
    return retained


@router.get("/calendar/events", response_model=list[CalendarEventOut])
async def list_calendar_events(
    from_: str = Query(..., alias="from"),
    to: str = Query(...),
    env: str | None = Query(None),
    group_outdoor: bool = Query(False),
    account = Depends(get_current_account),
    db = Depends(db_dep),
):
    try:
        from_dt = date.fromisoformat(from_)
        to_dt = date.fromisoformat(to)
    except ValueError:
        raise HTTPException(400, "Invalid date — expected YYYY-MM-DD")

    # Reject excessive ranges
    if (to_dt - from_dt).days > MAX_RANGE_DAYS:
        raise HTTPException(400, f"Date range too large — max {MAX_RANGE_DAYS} days")

    # Validate env filter
    if env and env not in ('tuin', 'huis'):
        raise HTTPException(400, "env must be 'tuin' or 'huis'")

    # 1. Fetch all plants in the household, optionally filtered by env
    plant_params: tuple = (account["household_id"],)

    plants = await db.execute_fetchall(
        "SELECT p.id, p.name, p.species_id, p.map_id, m.name AS map_name, m.map_type, p.container_id, p.ground_zone_id, "
        "p.care_profile, p.care_thresholds, p.icon_key "
        "FROM plants p LEFT JOIN maps m ON p.map_id = m.id "
        "WHERE p.household_id = ? AND p.is_active = 1",
        plant_params,
    )

    # Collect species_ids for later enrichment
    species_ids = {p.get("species_id") for p in plants if p.get("species_id")}
    species_names: dict[int, dict[str, str | None]] = {}
    if species_ids:
        placeholders = ",".join("?" * len(species_ids))
        species_rows = await db.execute_fetchall(
            f"SELECT id, common_name_nl, common_name_en FROM plant_species WHERE id IN ({placeholders})",
            tuple(species_ids),
        )
        species_names = {r["id"]: {"nl": r.get("common_name_nl"), "en": r.get("common_name_en")} for r in species_rows}

    # Build plant_id → species_id map so we can look up species names by plant
    plant_species_map: dict[int, int | None] = {p["id"]: p.get("species_id") for p in plants}

    # Apply env filter in Python (same logic as warnings/summary)
    if env == 'tuin':
        plants = [p for p in plants if p['map_type'] != 'indoor']
    elif env == 'huis':
        plants = [p for p in plants if p['map_type'] == 'indoor']
    plant_map = {p["id"]: dict(p) for p in plants}

    # 2. Fetch all active schedules that CAN produce events in range
    #    Regular schedules: next_due <= to_dt (they recur forward from next_due)
    #    Ephemeral: next_due BETWEEN from_dt AND to_dt (one-shot, no recurrence)
    if env and not plants:
        return []

    if env:
        placeholders = ','.join('?' * len(plants))
        sched_params = (account["household_id"],) + tuple(p["id"] for p in plants) + (to_dt, from_dt, to_dt)
        extra_where = f" AND cs.plant_id IN ({placeholders})"
    else:
        sched_params = (account["household_id"], to_dt, from_dt, to_dt)
        extra_where = ""

    rows = await db.execute_fetchall(
        """
        SELECT
            cs.id           AS schedule_id,
            cs.plant_id     AS plant_id,
            cs.care_type    AS type,
            cs.next_due     AS due_date,
            cs.last_done    AS last_done,
            cs.interval_days AS interval_days,
            cs.season_adjust AS season_adjust,
            cs.is_ephemeral AS is_ephemeral,
            p.name          AS plant_name,
            p.icon_key      AS plant_icon_variant
        FROM care_schedules cs
        JOIN plants p ON p.id = cs.plant_id
        WHERE cs.is_active = 1
          AND p.household_id = ?
          AND cs.care_type <> 'photo'
          """ + extra_where + """
          AND (
            (cs.is_ephemeral = 0 AND cs.next_due <= ?)
            OR
            (cs.is_ephemeral = 1 AND cs.next_due BETWEEN ? AND ?)
          )
        ORDER BY cs.next_due, cs.care_type
        """,
        sched_params,
    )

    # 3. Group raw schedule rows by plant for warning computation
    from collections import defaultdict
    today_date = date.today()

    # Build enrichment cache from ALL raw schedules per plant. The SQL row uses
    # event-friendly aliases (`type`, `due_date`); normalize back to the shape
    # compute_plant_warnings expects (`care_type`, `next_due`).
    raw_by_plant: dict[int, list[dict]] = defaultdict(list)
    for r in rows:
        raw_by_plant[r["plant_id"]].append({
            "care_type": r["type"],
            "next_due": r["due_date"],
            "last_done": r["last_done"],
        })

    enrichment_cache: dict[tuple[int, str], dict] = {}
    for pid, scheds in raw_by_plant.items():
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
            pass

    # 4. Build enriched events — virtual occurrences for regular, one-shot for ephemeral
    events = []
    today = today_date

    for r in rows:
        pid = r["plant_id"]
        ct = r["type"]
        enrichment = enrichment_cache.get((pid, ct), {})

        # Normalise: asyncpg returns datetime.date; aiosqlite returns str
        due_raw = r["due_date"]
        if isinstance(due_raw, str):
            next_due = date.fromisoformat(due_raw)
        else:
            next_due = due_raw

        if r.get("is_ephemeral"):
            # One-shot — only show if in range (already guaranteed by query)
            sp_id = plant_species_map.get(pid)
            sp = species_names.get(sp_id, {}) if sp_id else {}
            events.append(CalendarEventOut(
                id=f"schedule:{r['schedule_id']}:{ct}",
                date=next_due.isoformat(),
                type=ct,
                plant_id=pid,
                plant_name=r["plant_name"],
                species_common_name_nl=sp.get("nl"),
                species_common_name_en=sp.get("en"),
                plant_icon_variant=r["plant_icon_variant"],
                map_id=plant_map[pid].get("map_id"),
                map_name=plant_map[pid].get("map_name"),
                schedule_id=r["schedule_id"],
                overdue=next_due < today,
                severity=enrichment.get("severity"),
                color=enrichment.get("color"),
                icon=enrichment.get("icon"),
            ))
        else:
            # Recurring — generate all occurrences in [from_dt, to_dt]
            occurrences = _generate_occurrences(
                next_due,
                r["interval_days"],
                r.get("season_adjust"),
                from_dt,
                to_dt,
            )
            # Clamp overdue: if schedule is overdue at window start and no
            # occurrences fall inside the window, show one at from_dt so
            # outstanding work is never silently omitted from forward-looking
            # agenda views (Audit F7, #439).
            if not occurrences and next_due < from_dt and from_dt <= to_dt:
                occurrences = [from_dt]
            sp_id = plant_species_map.get(pid)
            sp = species_names.get(sp_id, {}) if sp_id else {}
            for i, occ in enumerate(occurrences):
                # overdue if: occurrence is before today, or it's the clamped
                # first occurrence of an already-overdue schedule
                is_overdue = occ < today or (
                    i == 0 and next_due < today and occ == from_dt
                )
                events.append(CalendarEventOut(
                    id=f"schedule:{r['schedule_id']}:{ct}:{i}",
                    date=occ.isoformat(),
                    type=ct,
                    plant_id=pid,
                    plant_name=r["plant_name"],
                    species_common_name_nl=sp.get("nl"),
                    species_common_name_en=sp.get("en"),
                    plant_icon_variant=r["plant_icon_variant"],
                    map_id=plant_map[pid].get("map_id"),
                    map_name=plant_map[pid].get("map_name"),
                    schedule_id=r["schedule_id"],
                    overdue=is_overdue,
                    severity=enrichment.get("severity"),
                    color=enrichment.get("color"),
                    icon=enrichment.get("icon"),
                ))

    # Shared household preferences supersede the legacy browser-local query flag.
    preferences = await get_calendar_grouping_preferences(db, account["household_id"])
    events = _group_outdoor_events(
        events,
        care_types=set(preferences["care_types"]),
        map_ids=set(preferences["map_ids"]),
    )

    return events
