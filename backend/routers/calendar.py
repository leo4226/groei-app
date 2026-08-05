import json
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, Query
from database import db_dep
from auth import get_current_account
from models import CalendarEventOut, WaterOutlookOut
from services.warnings import compute_plant_warnings, CareWarning
from services.scheduling import calculate_effective_interval
from services.calendar_grouping import get_calendar_grouping_preferences
from services.care_rhythm import (
    effective_weekdays_for_map,
    get_saved_care_rhythm_config,
)
from services.care_sessions import project_water_session
from services.garden_care import schedule_interval_days
from services.weather_task_service import (
    sync_ephemeral_schedules,
    weather_task_metadata,
    heat_water_metadata,
    HEAT_WATER_MAX_TEMP_C,
)
from services.weather_warning_state import weather_warning_states_for_account
from services.weather_forecast import get_map_forecast
from services.water_pressure import WeatherDay, calculate_water_pressure
from services.moisture_check_service import sync_moisture_checks
from care_types import CARE_TYPES, WEATHER_COLDHEAT_COLORS, normalize_care_type

import logging
logger = logging.getLogger(__name__)
router = APIRouter(tags=["calendar"])

# Safety caps
MAX_RANGE_DAYS = 366   # refuse ranges longer than a year
MAX_OCCURRENCES = 200  # per schedule
MAX_ROUTINE_LOOKAHEAD_DAYS = 6  # latest preferred day before a due date
AMSTERDAM_TZ = ZoneInfo("Europe/Amsterdam")
UTC_TZ = ZoneInfo("UTC")


def _water_pressure_today() -> date:
    return datetime.now(AMSTERDAM_TZ).date()


def _as_date(value) -> date:
    return value if isinstance(value, date) else date.fromisoformat(value)


def _pressure_weather_days(forecast: dict, *, usable: bool) -> list[WeatherDay]:
    if not usable:
        return []
    return [
        WeatherDay(
            date=date.fromisoformat(day["date"]),
            max_temp_c=float(day["max_temp_c"]),
            precipitation_mm=float(day["precipitation_mm"]),
            et0_mm=float(day["et0_mm"]),
        )
        for day in forecast.get("days", [])
    ]


async def build_water_outlook(db, *, household_id: int) -> dict:
    """Build map-local Water pressure for one household without writing."""
    rows = await db.execute_fetchall(
        """SELECT cs.id AS schedule_id, cs.next_due,
                  p.id AS plant_id, p.name AS plant_name,
                  p.container_id, p.ground_zone_id,
                  m.id AS map_id, m.name AS map_name, m.map_type, m.lat, m.lon
           FROM care_schedules cs
           JOIN plants p ON p.id = cs.plant_id
           JOIN maps m ON m.id = p.map_id
           WHERE cs.care_type = 'water'
             AND cs.is_active = 1 AND cs.is_ephemeral = 0
             AND cs.next_due IS NOT NULL AND p.is_active = 1
             AND p.household_id = ? AND m.household_id = ?
           ORDER BY CASE WHEN m.map_type = 'outdoor' THEN 0 ELSE 1 END,
                    m.id, p.name, p.id""",
        (household_id, household_id),
    )

    proxy_rows = await db.execute_fetchall(
        """SELECT lat, lon FROM maps
           WHERE household_id = ? AND map_type = 'outdoor'
             AND lat IS NOT NULL AND lon IS NOT NULL
           ORDER BY id LIMIT 1""",
        (household_id,),
    )
    proxy_coordinates = (
        (float(proxy_rows[0]["lat"]), float(proxy_rows[0]["lon"]))
        if proxy_rows else None
    )

    grouped: dict[int, dict] = {}
    coordinate_by_map: dict[int, tuple[float, float] | None] = {}
    source_by_map: dict[int, str] = {}
    for raw in rows:
        row = dict(raw)
        map_id = row["map_id"]
        grouped.setdefault(map_id, {"row": row, "plants": []})["plants"].append(row)
        if map_id in coordinate_by_map:
            continue
        if row["map_type"] == "outdoor" and row.get("lat") is not None and row.get("lon") is not None:
            coordinate_by_map[map_id] = (float(row["lat"]), float(row["lon"]))
            source_by_map[map_id] = "own_map"
        elif row["map_type"] == "indoor" and proxy_coordinates is not None:
            coordinate_by_map[map_id] = proxy_coordinates
            source_by_map[map_id] = "outdoor_proxy"
        else:
            coordinate_by_map[map_id] = None
            source_by_map[map_id] = "none"

    forecasts: dict[tuple[float, float], dict] = {}
    for coordinates in dict.fromkeys(
        value for value in coordinate_by_map.values() if value is not None
    ):
        assert coordinates is not None
        try:
            forecasts[coordinates] = await get_map_forecast(*coordinates)
        except Exception:
            logger.warning("Map forecast failed for coordinates %s", coordinates)
            forecasts[coordinates] = {
                "available": False, "stale": False,
                "source_timestamp": None, "days": [],
            }

    today = _water_pressure_today()
    level_rank = {"unknown": 0, "normal": 1, "elevated": 2, "high": 3}
    maps = []
    for map_id, group in grouped.items():
        map_row = group["row"]
        coordinates = coordinate_by_map[map_id]
        forecast = forecasts.get(coordinates, {}) if coordinates is not None else {}
        if coordinates is None:
            weather_status = "missing_coordinates"
        elif forecast.get("stale"):
            weather_status = "stale"
        elif not forecast.get("available"):
            weather_status = "unavailable"
        else:
            weather_status = "fresh"
        weather_days = _pressure_weather_days(
            forecast,
            usable=weather_status == "fresh",
        )

        plants = []
        for plant in group["plants"]:
            if map_row["map_type"] == "indoor":
                environment = "indoor"
            elif plant.get("ground_zone_id"):
                environment = "outdoor_ground"
            else:
                environment = "outdoor_container"
            next_due = _as_date(plant["next_due"])
            pressure = calculate_water_pressure(
                environment=environment,
                today=today,
                next_due=next_due,
                weather_days=weather_days,
            )
            plants.append({
                "plant_id": plant["plant_id"],
                "plant_name": plant["plant_name"],
                "schedule_id": plant["schedule_id"],
                "environment": environment,
                "next_due": next_due,
                "recommended_check_date": pressure.recommended_check_date,
                "level": pressure.level,
                "score": pressure.score,
                "reason_nl": pressure.reason_nl,
                "reason_en": pressure.reason_en,
                "factors": pressure.factors,
            })

        map_level = max(
            (plant["level"] for plant in plants),
            key=lambda level: level_rank[level],
            default="unknown",
        )
        maps.append({
            "map_id": map_id,
            "map_name": map_row["map_name"],
            "map_type": map_row["map_type"],
            "level": map_level,
            "weather_status": weather_status,
            "temperature_source": source_by_map[map_id],
            "source_timestamp": forecast.get("source_timestamp"),
            "high_count": sum(plant["level"] == "high" for plant in plants),
            "elevated_count": sum(plant["level"] == "elevated" for plant in plants),
            "plants": plants,
        })

    return {"generated_at": today, "maps": maps}


@router.get("/calendar/water-outlook", response_model=WaterOutlookOut)
async def get_water_outlook(
    account=Depends(get_current_account),
    db=Depends(db_dep),
):
    """Return read-only, map-local Water pressure for active schedules."""
    return await build_water_outlook(db, household_id=account["household_id"])


def _care_warning_to_dict(w: CareWarning) -> dict:
    """Convert a CareWarning dataclass to the dict shape the client expects."""
    return {
        "severity": w.severity,
        "color": w.color,
        "icon": w.icon,
        "reason_nl": w.reason_nl,
        "reason_en": w.reason_en,
        "action_nl": w.action_nl,
        "action_en": w.action_en,
        "weather_metric": w.weather_metric,
        "weather_value_c": w.weather_value_c,
        "forecast_day_label_nl": w.forecast_day_label_nl,
        "forecast_day_label_en": w.forecast_day_label_en,
    }


def _moisture_metadata(notes: str | None) -> dict:
    if not notes:
        return {}
    try:
        value = json.loads(notes)
    except (TypeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


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
    events: list[CalendarEventOut], *, rules: dict[int, set[str]],
) -> list[CalendarEventOut]:
    """Group configured map care; the legacy name is retained for compatibility."""
    grouped: dict[tuple[str, str, int], list[CalendarEventOut]] = {}
    retained: list[CalendarEventOut] = []
    for event in events:
        configured = (
            event.routine_session
            or (
                event.routine_reason is None
                and event.type in rules.get(event.map_id, set())
            )
        )
        if (
            event.map_id is not None
            and configured
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
            group_member_event_ids=[member.id for member in members],
            group_members=[
                {
                    "schedule_id": member.schedule_id,
                    "plant_id": member.plant_id,
                    "plant_name": member.plant_name,
                    "plant_icon_variant": member.plant_icon_variant,
                    "canonical_date": member.canonical_date,
                }
                for member in members
                if (
                    member.schedule_id is not None
                    and member.plant_id is not None
                    and member.plant_name is not None
                )
            ],
            routine_session=any(member.routine_session for member in members),
            routine_reason=(
                "routine" if any(member.routine_session for member in members) else None
            ),
        ))
    return retained


def _group_moisture_check_events(
    events: list[CalendarEventOut],
) -> list[CalendarEventOut]:
    grouped: dict[tuple[str, int], list[CalendarEventOut]] = {}
    retained: list[CalendarEventOut] = []
    for event in events:
        if event.type == "moisture_check" and event.map_id is not None:
            grouped.setdefault((event.date, event.map_id), []).append(event)
        else:
            retained.append(event)

    for (event_date, map_id), members in grouped.items():
        first = members[0]
        retained.append(CalendarEventOut(
            id=f"moisture:{map_id}:{event_date}",
            date=event_date,
            type="moisture_check",
            plant_id=None,
            plant_name=None,
            plant_icon_variant=None,
            schedule_id=None,
            map_id=map_id,
            map_name=first.map_name,
            overdue=any(member.overdue for member in members),
            severity="info",
            reason_nl=first.reason_nl,
            reason_en=first.reason_en,
            action_nl="Voel de grond en geef alleen water als die droog aanvoelt.",
            action_en="Feel the soil and water only when it feels dry.",
            grouped=True,
            group_count=len(members),
            group_member_schedule_ids=[
                member.schedule_id for member in members
                if member.schedule_id is not None
            ],
            group_member_event_ids=[member.id for member in members],
            group_members=[
                {
                    "schedule_id": member.schedule_id,
                    "plant_id": member.plant_id,
                    "plant_name": member.plant_name,
                    "plant_icon_variant": member.plant_icon_variant,
                    "reason_nl": member.reason_nl,
                    "reason_en": member.reason_en,
                }
                for member in members
                if (
                    member.schedule_id is not None
                    and member.plant_id is not None
                    and member.plant_name is not None
                )
            ],
            weather_triggered=True,
        ))
    return retained


def _group_heat_water_events(
    events: list[CalendarEventOut],
) -> list[CalendarEventOut]:
    """Collapse per-plant heat-water reminders into one card per map and day."""
    grouped: dict[tuple[str, int], list[CalendarEventOut]] = {}
    retained: list[CalendarEventOut] = []
    for event in events:
        if event.type == "water" and event.weather_triggered and event.map_id is not None:
            grouped.setdefault((event.date, event.map_id), []).append(event)
        else:
            retained.append(event)

    for (event_date, map_id), members in grouped.items():
        first = members[0]
        retained.append(CalendarEventOut(
            id=f"heat-water:{map_id}:{event_date}",
            date=event_date,
            type="water",
            plant_id=None,
            plant_name=None,
            plant_icon_variant=None,
            schedule_id=None,
            map_id=map_id,
            map_name=first.map_name,
            overdue=any(member.overdue for member in members),
            grouped=True,
            group_count=len(members),
            group_member_schedule_ids=[
                member.schedule_id for member in members
                if member.schedule_id is not None
            ],
            group_member_event_ids=[member.id for member in members],
            group_members=[
                {
                    "schedule_id": member.schedule_id,
                    "plant_id": member.plant_id,
                    "plant_name": member.plant_name,
                    "plant_icon_variant": member.plant_icon_variant,
                    "reason_nl": member.reason_nl,
                    "reason_en": member.reason_en,
                }
                for member in members
                if (
                    member.schedule_id is not None
                    and member.plant_id is not None
                    and member.plant_name is not None
                )
            ],
            severity=first.severity or "warning",
            reason_nl=first.reason_nl,
            reason_en=first.reason_en,
            action_nl=first.action_nl,
            action_en=first.action_en,
            color=first.color,
            icon=first.icon,
            weather_triggered=True,
        ))
    return retained


def _history_date(value) -> date:
    if isinstance(value, datetime):
        timestamp = value if value.tzinfo else value.replace(tzinfo=UTC_TZ)
        return timestamp.astimezone(AMSTERDAM_TZ).date()
    if isinstance(value, date):
        return value
    return _history_date(datetime.fromisoformat(value))


async def _completion_history(
    db,
    *,
    household_id: int,
    from_dt: date,
    to_dt: date,
    env: str | None,
) -> list[CalendarEventOut]:
    """Project successful care logs and grouped operations into Month history."""
    env_where = ""
    if env == "tuin":
        env_where = " AND (m.map_type IS NULL OR m.map_type <> 'indoor')"
    elif env == "huis":
        env_where = " AND m.map_type = 'indoor'"

    log_rows = await db.execute_fetchall(
        """
        SELECT cl.id AS care_log_id, cl.plant_id, cl.care_type, cl.done_at,
               p.name AS plant_name, p.icon_key AS plant_icon_variant,
               p.map_id, m.name AS map_name
        FROM care_log cl
        JOIN plants p ON p.id = cl.plant_id
        LEFT JOIN maps m ON m.id = p.map_id
        LEFT JOIN garden_care_operation_members member
          ON member.care_log_id = cl.id
        WHERE p.household_id = ?
          AND cl.skipped = FALSE
          AND cl.care_type <> 'photo'
          AND member.care_log_id IS NULL
          AND DATE(cl.done_at) BETWEEN ? AND ?
        """ + env_where + """
        ORDER BY cl.done_at, cl.id
        """,
        (household_id, from_dt - timedelta(days=1), to_dt + timedelta(days=1)),
    )

    operation_rows = await db.execute_fetchall(
        """
        SELECT operation.id AS operation_id, operation.care_type,
               operation.completed_at, operation.map_id,
               m.name AS map_name, COUNT(member.schedule_id) AS member_count
        FROM garden_care_operations operation
        JOIN garden_care_operation_members member
          ON member.operation_id = operation.id
        LEFT JOIN maps m ON m.id = operation.map_id
        WHERE operation.household_id = ?
          AND operation.undone_at IS NULL
          AND operation.completed_at BETWEEN ? AND ?
        """ + env_where + """
        GROUP BY operation.id, operation.care_type, operation.completed_at,
                 operation.map_id, m.name
        ORDER BY operation.completed_at, operation.id
        """,
        (household_id, from_dt, to_dt),
    )

    history: list[CalendarEventOut] = []
    for row in log_rows:
        completed_date = _history_date(row["done_at"])
        if completed_date < from_dt or completed_date > to_dt:
            continue
        history.append(CalendarEventOut(
            id=f"care-log:{row['care_log_id']}",
            date=completed_date.isoformat(),
            type=normalize_care_type(row["care_type"]),
            status="completed",
            plant_id=row["plant_id"],
            plant_name=row["plant_name"],
            plant_icon_variant=row["plant_icon_variant"],
            schedule_id=None,
            map_id=row["map_id"],
            map_name=row["map_name"],
            overdue=False,
        ))
    history.extend(
        CalendarEventOut(
            id=f"garden-operation:{row['operation_id']}",
            date=_history_date(row["completed_at"]).isoformat(),
            type=normalize_care_type(row["care_type"]),
            status="completed",
            plant_id=None,
            plant_name=None,
            plant_icon_variant=None,
            schedule_id=None,
            map_id=row["map_id"],
            map_name=row["map_name"],
            overdue=False,
            grouped=True,
            group_count=int(row["member_count"]),
        )
        for row in operation_rows
    )
    return sorted(history, key=lambda event: (event.date, event.id))


@router.get("/calendar/events", response_model=list[CalendarEventOut])
async def list_calendar_events(
    from_: str = Query(..., alias="from"),
    to: str = Query(...),
    env: str | None = Query(None),
    group_outdoor: bool = Query(False),
    pin_overdue: bool = Query(False),
    include_history: bool = Query(False),
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

    rhythm_config = await get_saved_care_rhythm_config(
        db, account["household_id"],
    )
    planning_to = (
        to_dt + timedelta(days=MAX_ROUTINE_LOOKAHEAD_DAYS)
        if rhythm_config
        else to_dt
    )

    # Refresh weather-driven one-shot tasks on the Calendar path itself. This is
    # best-effort: cached-weather or sync failures must never turn Calendar into
    # a 500 or hide ordinary scheduled care.
    warning_weather = None
    try:
        sync_result = await sync_ephemeral_schedules(db)
        warning_weather = sync_result.get("warning_weather")
    except Exception:
        logger.warning("sync_ephemeral_schedules failed in calendar endpoint")

    try:
        pressure_outlook = await build_water_outlook(
            db, household_id=account["household_id"],
        )
        await sync_moisture_checks(
            db,
            household_id=account["household_id"],
            outlook=pressure_outlook,
        )
    except Exception:
        logger.warning("Water outlook / moisture sync failed in calendar endpoint")

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
        if include_history:
            return await _completion_history(
                db,
                household_id=account["household_id"],
                from_dt=from_dt,
                to_dt=to_dt,
                env=env,
            )
        return []

    if env:
        placeholders = ','.join('?' * len(plants))
        sched_params = (
            (account["household_id"],)
            + tuple(p["id"] for p in plants)
            + (planning_to, to_dt, from_dt, to_dt)
        )
        extra_where = f" AND cs.plant_id IN ({placeholders})"
    else:
        sched_params = (
            account["household_id"], planning_to, to_dt, from_dt, to_dt,
        )
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
            cs.rhythm_opt_out AS rhythm_opt_out,
            cs.is_ephemeral AS is_ephemeral,
            cs.notes        AS notes,
            p.name          AS plant_name,
            p.icon_key      AS plant_icon_variant
        FROM care_schedules cs
        JOIN plants p ON p.id = cs.plant_id
        WHERE cs.is_active = 1
          AND p.is_active = 1
          AND p.household_id = ?
          AND cs.care_type <> 'photo'
          """ + extra_where + """
          AND (
            (cs.is_ephemeral = 0 AND (
              (LOWER(cs.care_type) = 'water' AND cs.next_due <= ?)
              OR
              (LOWER(cs.care_type) <> 'water' AND cs.next_due <= ?)
            ))
            OR
            (cs.is_ephemeral = 1 AND cs.next_due BETWEEN ? AND ?)
          )
        ORDER BY cs.next_due, cs.care_type, cs.id
        """,
        sched_params,
    )

    # 3. Group raw schedule rows by plant for warning computation
    from collections import defaultdict
    today_date = _water_pressure_today()

    # Build enrichment cache from ALL raw schedules per plant. The SQL row uses
    # event-friendly aliases (`type`, `due_date`); normalize back to the shape
    # compute_plant_warnings expects (`care_type`, `next_due`).
    raw_by_plant: dict[int, list[dict]] = defaultdict(list)
    for r in rows:
        raw_by_plant[r["plant_id"]].append({
            "care_type": normalize_care_type(r["type"]),
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
                warn_plant, scheds, weather=warning_weather, today=today_date
            )
            for w in state.warnings:
                enrichment_cache[(pid, w.care_type)] = _care_warning_to_dict(w)
        except Exception:
            logger.warning("Warning enrichment failed for plant %s", pid)

    # 4. Build enriched events — virtual occurrences for regular, one-shot for ephemeral
    events = []
    today = today_date
    weather_states = await weather_warning_states_for_account(
        db, account["account_id"],
    )

    for r in rows:
        pid = r["plant_id"]
        plant = plant_map.get(pid)
        if not plant:
            continue
        ct = normalize_care_type(r["type"])
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
            warning_metadata = weather_task_metadata(r.get("notes"))
            warning_id = warning_metadata.get("weather_warning_id") if warning_metadata else None
            warning_state = weather_states.get(warning_id, {}) if warning_id else {}
            if ct == "moisture_check":
                metadata = _moisture_metadata(r.get("notes"))
                enrichment = {
                    **enrichment,
                    "severity": "info",
                    "reason_nl": metadata.get("reason_nl"),
                    "reason_en": metadata.get("reason_en"),
                    "action_nl": "Voel de grond en geef alleen water als die droog aanvoelt.",
                    "action_en": "Feel the soil and water only when it feels dry.",
                }
            elif ct == "water":
                heat = heat_water_metadata(r.get("notes"))
                if heat is not None:
                    max_c = float(heat.get("max_temp_c", HEAT_WATER_MAX_TEMP_C))
                    enrichment = {
                        **enrichment,
                        "severity": "warning",
                        "reason_nl": f"Extra water geven vanwege hitte — max {max_c:.0f}°C",
                        "reason_en": f"Extra watering due to heat — max {max_c:.0f}°C",
                        "action_nl": "Geef extra water of controleer de grond; potten drogen sneller uit.",
                        "action_en": "Water extra or check the soil; containers dry out faster.",
                        "color": WEATHER_COLDHEAT_COLORS["heat_protect_warning"],
                        "icon": CARE_TYPES["water"]["icon"],
                    }
            events.append(CalendarEventOut(
                id=f"schedule:{r['schedule_id']}:{ct}",
                date=next_due.isoformat(),
                type=ct,
                plant_id=pid,
                plant_name=r["plant_name"],
                species_common_name_nl=sp.get("nl"),
                species_common_name_en=sp.get("en"),
                plant_icon_variant=r["plant_icon_variant"],
                map_id=plant.get("map_id"),
                map_name=plant.get("map_name"),
                schedule_id=r["schedule_id"],
                overdue=next_due < today,
                **enrichment,
                weather_triggered=True,
                weather_warning_id=warning_id,
                acknowledged_at=warning_state.get("acknowledged_at"),
            ))
        else:
            # Recurring — generate all occurrences in [from_dt, to_dt]
            interval_days = schedule_interval_days({**dict(r), **plant}, ct)
            if interval_days is None:
                logger.warning(
                    "Skipping calendar schedule %s with invalid interval for care type %s",
                    r["schedule_id"], ct,
                )
                continue
            occurrence_to = (
                planning_to if rhythm_config and ct == "water" else to_dt
            )
            occurrences = _generate_occurrences(
                next_due,
                interval_days,
                r.get("season_adjust"),
                from_dt,
                occurrence_to,
            )
            # A pinned agenda shows the stored outstanding job once. Future
            # recurrences are speculative until that job is completed.
            if rhythm_config and pin_overdue and next_due < from_dt:
                occurrences = [next_due]
            elif (
                next_due < from_dt
                and (pin_overdue or not occurrences)
                and from_dt <= to_dt
                and from_dt not in occurrences
            ):
                # Month retains the legacy fallback when no recurrence lands
                # in the requested range.
                occurrences.insert(0, from_dt)
            sp_id = plant_species_map.get(pid)
            sp = species_names.get(sp_id, {}) if sp_id else {}
            routine_weekdays = (
                effective_weekdays_for_map(
                    rhythm_config,
                    map_id=plant.get("map_id"),
                    map_type=plant.get("map_type"),
                )
                if rhythm_config and ct == "water"
                else []
            )
            for i, occ in enumerate(occurrences):
                display_date = occ
                routine_session = False
                routine_reason = None
                if rhythm_config and ct == "water":
                    projection = project_water_session(
                        canonical_due=occ,
                        effective_interval=calculate_effective_interval(
                            interval_days, r.get("season_adjust"), occ,
                        ),
                        preferred_weekdays=routine_weekdays,
                        opted_out=bool(r.get("rhythm_opt_out")),
                    )
                    display_date = projection.session_date
                    routine_session = projection.is_routine
                    routine_reason = projection.reason
                if display_date < from_dt:
                    if pin_overdue and (
                        routine_session or occ == next_due
                    ):
                        display_date = from_dt
                    else:
                        continue
                if display_date > to_dt:
                    continue
                # overdue if: occurrence is before today, or it's the clamped
                # first occurrence of an already-overdue schedule
                is_overdue = occ < today or (
                    i == 0 and next_due < today and occ == from_dt
                )
                events.append(CalendarEventOut(
                    id=f"schedule:{r['schedule_id']}:{ct}:{occ.isoformat()}",
                    date=display_date.isoformat(),
                    type=ct,
                    plant_id=pid,
                    plant_name=r["plant_name"],
                    species_common_name_nl=sp.get("nl"),
                    species_common_name_en=sp.get("en"),
                    plant_icon_variant=r["plant_icon_variant"],
                    map_id=plant.get("map_id"),
                    map_name=plant.get("map_name"),
                    schedule_id=r["schedule_id"],
                    overdue=is_overdue,
                    canonical_date=occ.isoformat(),
                    routine_session=routine_session,
                    routine_reason=routine_reason,
                    **enrichment,
                ))

    events = _group_heat_water_events(events)
    events = _group_moisture_check_events(events)

    # Shared household preferences supersede the legacy browser-local query flag.
    preferences = await get_calendar_grouping_preferences(db, account["household_id"])
    events = _group_outdoor_events(
        events,
        rules={
            rule["map_id"]: set(rule["care_types"])
            for rule in preferences["rules"]
        },
    )

    if include_history:
        events.extend(await _completion_history(
            db,
            household_id=account["household_id"],
            from_dt=from_dt,
            to_dt=to_dt,
            env=env,
        ))

    return events
