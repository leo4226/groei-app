"""Server-side grouped map care operations with reversible schedule snapshots."""
from datetime import date, datetime
from typing import Literal

from care_types import CARE_TYPES
from services.calendar_grouping import get_calendar_grouping_preferences
from services.care_rhythm import (
    effective_weekdays_for_map,
    get_saved_care_rhythm_config,
)
from services.care_sessions import project_water_session
from services.care_profile import environment_for_plant
from services.db_transactions import database_transaction, for_update_clause
from services.scheduling import calculate_effective_interval, calculate_next_due


class GardenCareUndoConflict(Exception):
    """The grouped operation no longer owns the schedules it would restore."""


class GardenCareSelectionError(Exception):
    """A selected schedule is not part of the requested grouped map action."""


def _comparable_db_value(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat(sep=" ")
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _as_date(value) -> date:
    return value if isinstance(value, date) else date.fromisoformat(value)


def schedule_interval_days(schedule: dict, care_type: str) -> int | None:
    """Return a safe interval for a grouped schedule.

    Some older manually-created FEED/PRUNE rows can be missing interval data even
    though the calendar can still group and show them. Completing such a session
    should not 500; fall back to the catalog default for that plant's
    environment so the group can be aligned onto a valid next due date.
    """
    raw_interval = schedule.get("interval_days")
    if isinstance(raw_interval, int) and not isinstance(raw_interval, bool) and raw_interval > 0:
        return raw_interval
    environment = environment_for_plant(schedule)
    default_interval = CARE_TYPES.get(care_type, {}).get("default_intervals", {}).get(environment)
    return default_interval if isinstance(default_interval, int) and default_interval > 0 else None


async def _operation_members(db, operation_id: int, *, lock: bool) -> list[dict]:
    return await db.execute_fetchall(
        """SELECT gom.schedule_id, gom.previous_next_due,
                  gom.previous_last_done, gom.previous_last_done_by,
                  gom.care_log_id, gom.applied_next_due,
                  gom.applied_last_done, cs.next_due AS current_next_due,
                  cs.last_done AS current_last_done,
                  cs.last_done_by AS current_last_done_by,
                  cs.plant_id, cs.care_type
           FROM garden_care_operation_members gom
           JOIN care_schedules cs ON cs.id = gom.schedule_id
           WHERE gom.operation_id = ?"""
        + (for_update_clause(db) if lock else ""),
        (operation_id,),
    )


async def _members_are_undoable(
    db,
    members: list[dict],
    *,
    completed_by: int | None,
    lock: bool,
) -> bool:
    if not members:
        return False
    for member in members:
        if member.get("care_log_id") is None:
            return False
        newer_logs = await db.execute_fetchall(
            """SELECT id FROM care_log
               WHERE plant_id = ? AND care_type = ? AND id > ?
               ORDER BY id LIMIT 1"""
            + (for_update_clause(db) if lock else ""),
            (member["plant_id"], member["care_type"], member["care_log_id"]),
        )
        applied_matches = (
            member.get("applied_next_due") is not None
            and member.get("applied_last_done") is not None
            and _comparable_db_value(member["current_next_due"])
            == _comparable_db_value(member["applied_next_due"])
            and _comparable_db_value(member["current_last_done"])
            == _comparable_db_value(member["applied_last_done"])
            and member.get("current_last_done_by") == completed_by
        )
        if newer_logs or not applied_matches:
            return False
    return True


async def can_undo_outdoor_care(
    db,
    *,
    household_id: int,
    operation_id: int,
) -> bool:
    operations = await db.execute_fetchall(
        """SELECT id, completed_by FROM garden_care_operations
           WHERE id = ? AND household_id = ? AND undone_at IS NULL""",
        (operation_id, household_id),
    )
    if not operations:
        return False
    members = await _operation_members(db, operation_id, lock=False)
    return await _members_are_undoable(
        db,
        members,
        completed_by=operations[0]["completed_by"],
        lock=False,
    )


async def complete_outdoor_care(
    db, *, household_id: int, care_type: str, completed_at: date, user_id: int,
    map_id: int, schedule_ids: list[int] | None = None,
    completion_mode: Literal["planned", "map_round"] = "planned",
) -> dict:
    user_rows = await db.execute_fetchall(
        "SELECT id FROM users WHERE id = ? AND household_id = ?",
        (user_id, household_id),
    )
    if not user_rows:
        return {"operation_id": None, "affected_count": 0}

    map_round = completion_mode == "map_round"
    if map_round and care_type != "water":
        raise GardenCareSelectionError

    rhythm_config = await get_saved_care_rhythm_config(db, household_id)
    routine_water = care_type == "water" and rhythm_config is not None
    if not map_round:
        preferences = await get_calendar_grouping_preferences(db, household_id)
        configured_types = next(
            (
                set(rule["care_types"])
                for rule in preferences["rules"]
                if rule["map_id"] == map_id
            ),
            set(),
        )
        if care_type not in configured_types and not routine_water:
            return {"operation_id": None, "affected_count": 0}

    async with database_transaction(db):
        # Ephemeral water rows are informational heat-water reminders (#785),
        # never completable as regular water work.
        ephemeral_guard = "AND cs.is_ephemeral = 0" if care_type == "water" else ""
        schedules = await db.execute_fetchall(
            """SELECT cs.id, cs.plant_id, cs.interval_days, cs.season_adjust,
                      cs.next_due, cs.last_done, cs.last_done_by,
                      cs.rhythm_opt_out,
                      p.container_id, COALESCE(m.map_type, 'outdoor') AS map_type
               FROM care_schedules cs
               JOIN plants p ON p.id = cs.plant_id
               JOIN maps m ON m.id = p.map_id
               WHERE p.household_id = ? AND p.is_active = 1 AND cs.is_active = 1
                 AND cs.care_type = ? AND m.id = ?
               """ + ephemeral_guard + for_update_clause(db),
            (household_id, care_type, map_id),
        )
        if not schedules:
            if map_round and schedule_ids is not None:
                raise GardenCareSelectionError
            return {"operation_id": None, "affected_count": 0}

        routine_schedule_ids: set[int] = set()
        if routine_water:
            for schedule in schedules:
                interval_days = schedule_interval_days(schedule, care_type)
                if interval_days is None:
                    continue
                canonical_due = _as_date(schedule["next_due"])
                projection = project_water_session(
                    canonical_due=canonical_due,
                    effective_interval=calculate_effective_interval(
                        interval_days,
                        schedule.get("season_adjust"),
                        canonical_due,
                    ),
                    preferred_weekdays=effective_weekdays_for_map(
                        rhythm_config,
                        map_id=map_id,
                        map_type=schedule.get("map_type"),
                    ),
                    opted_out=bool(schedule.get("rhythm_opt_out")),
                )
                if projection.is_routine:
                    routine_schedule_ids.add(schedule["id"])
            if not map_round:
                schedules = [
                    schedule for schedule in schedules
                    if schedule["id"] in routine_schedule_ids
                ]

        if schedule_ids is not None:
            requested_ids = set(schedule_ids)
            eligible_by_id = {schedule["id"]: schedule for schedule in schedules}
            if len(requested_ids) != len(schedule_ids) or not requested_ids.issubset(eligible_by_id):
                raise GardenCareSelectionError
            schedules = [eligible_by_id[schedule_id] for schedule_id in schedule_ids]

        if not schedules:
            return {"operation_id": None, "affected_count": 0}

        operation = await db.execute_fetchall(
            """INSERT INTO garden_care_operations
               (household_id, care_type, map_id, completed_at, completed_by)
               VALUES (?, ?, ?, ?, ?) RETURNING id""",
            (household_id, care_type, map_id, completed_at, user_id),
        )
        operation_id = operation[0]["id"]
        done_at = datetime.combine(completed_at, datetime.min.time())

        if care_type == "water":
            # Snapshot the household's current garden_water_log row onto the
            # operation so undo can restore it, then upsert the watering round
            # as the latest entry (single row per household, log_garden_water
            # semantics: DELETE then INSERT).
            previous = await db.execute_fetchall(
                """SELECT watered_at, watered_by, water_amount
                   FROM garden_water_log
                   WHERE household_id = ?
                   ORDER BY watered_at DESC LIMIT 1""",
                (household_id,),
            )
            if previous:
                prev_watered_at = previous[0]["watered_at"]
                prev_watered_by = previous[0]["watered_by"]
                prev_water_amount = previous[0]["water_amount"]
            else:
                prev_watered_at = prev_watered_by = prev_water_amount = None
            await db.execute(
                """UPDATE garden_care_operations
                   SET previous_watered_at = ?, previous_watered_by = ?,
                       previous_water_amount = ?
                   WHERE id = ?""",
                (prev_watered_at, prev_watered_by, prev_water_amount, operation_id),
            )
            await db.execute(
                "DELETE FROM garden_water_log WHERE household_id = ?",
                (household_id,),
            )
            await db.execute(
                """INSERT INTO garden_water_log
                   (watered_at, watered_by, water_amount, household_id)
                   VALUES (?, ?, NULL, ?)""",
                (completed_at, user_id, household_id),
            )

        for schedule in schedules:
            log = await db.execute_fetchall(
                """INSERT INTO care_log (plant_id, care_type, done_by, done_at, skipped)
                   VALUES (?, ?, ?, ?, FALSE) RETURNING id""",
                (schedule["plant_id"], care_type, user_id, done_at),
            )
            interval_days = schedule_interval_days(schedule, care_type)
            if interval_days is None:
                raise GardenCareSelectionError
            canonical_due = _as_date(schedule["next_due"])
            recurrence_anchor = (
                canonical_due
                if schedule["id"] in routine_schedule_ids
                and completed_at <= canonical_due
                else completed_at
            )
            next_due = calculate_next_due(
                recurrence_anchor, interval_days, schedule["season_adjust"],
            )
            await db.execute_fetchall(
                """INSERT INTO garden_care_operation_members
                   (operation_id, schedule_id, previous_next_due, previous_last_done,
                    previous_last_done_by, care_log_id, applied_next_due,
                    applied_last_done)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING operation_id""",
                (
                    operation_id, schedule["id"], schedule["next_due"],
                    schedule.get("last_done"), schedule.get("last_done_by"), log[0]["id"],
                    next_due, done_at,
                ),
            )
            await db.execute(
                """UPDATE care_schedules SET last_done = ?, last_done_by = ?, next_due = ?
                   WHERE id = ?""",
                (done_at, user_id, next_due, schedule["id"]),
            )

    return {"operation_id": operation_id, "affected_count": len(schedules)}


async def undo_outdoor_care(db, *, household_id: int, operation_id: int) -> bool:
    async with database_transaction(db):
        operations = await db.execute_fetchall(
            """SELECT id, completed_by, care_type, previous_watered_at,
                      previous_watered_by, previous_water_amount
               FROM garden_care_operations
               WHERE id = ? AND household_id = ? AND undone_at IS NULL"""
            + for_update_clause(db),
            (operation_id, household_id),
        )
        if not operations:
            return False
        members = await _operation_members(db, operation_id, lock=True)
        completed_by = operations[0]["completed_by"]
        if not await _members_are_undoable(
            db,
            members,
            completed_by=completed_by,
            lock=True,
        ):
            raise GardenCareUndoConflict

        for member in members:
            await db.execute(
                """UPDATE care_schedules SET next_due = ?, last_done = ?, last_done_by = ?
                   WHERE id = ?""",
                (
                    member["previous_next_due"], member.get("previous_last_done"),
                    member.get("previous_last_done_by"), member["schedule_id"],
                ),
            )
            if member.get("care_log_id"):
                await db.execute(
                    """UPDATE garden_care_operation_members SET care_log_id = NULL
                       WHERE operation_id = ? AND schedule_id = ?""",
                    (operation_id, member["schedule_id"]),
                )
                await db.execute("DELETE FROM care_log WHERE id = ?", (member["care_log_id"],))
        if operations[0]["care_type"] == "water":
            # Restore the garden_water_log row the round overwrote (or leave
            # the table empty if no row existed before the round).
            await db.execute(
                "DELETE FROM garden_water_log WHERE household_id = ?",
                (household_id,),
            )
            if operations[0].get("previous_watered_at") is not None:
                await db.execute(
                    """INSERT INTO garden_water_log
                       (watered_at, watered_by, water_amount, household_id)
                       VALUES (?, ?, ?, ?)""",
                    (
                        operations[0]["previous_watered_at"],
                        operations[0].get("previous_watered_by"),
                        operations[0].get("previous_water_amount"),
                        household_id,
                    ),
                )
        await db.execute(
            "UPDATE garden_care_operations SET undone_at = CURRENT_TIMESTAMP WHERE id = ?",
            (operation_id,),
        )
    return True
