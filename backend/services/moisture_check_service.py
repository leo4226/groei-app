"""Synchronize and resolve actionable map-aware moisture checks."""
from __future__ import annotations

import json
from datetime import date, datetime, time
from typing import Any, Literal

from services.db_transactions import database_transaction, for_update_clause
from services.scheduling import calculate_next_due


CARE_TYPE = "moisture_check"
ResolutionOutcome = Literal["still_moist", "watered"]


class MoistureCheckSelectionError(ValueError):
    """Selected checks do not form an actionable household/map session."""


def _as_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _decode_metadata(notes: str | None) -> dict:
    if not notes:
        return {}
    try:
        value = json.loads(notes)
    except (TypeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def _encode_metadata(value: dict) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def _completion_marker(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return str(value)


def _metadata(map_outlook: dict, plant: dict) -> dict:
    return {
        "kind": CARE_TYPE,
        "reason_nl": plant["reason_nl"],
        "reason_en": plant["reason_en"],
        "score": plant["score"],
        "temperature_source": map_outlook["temperature_source"],
        "water_schedule_id": plant["schedule_id"],
    }


def _desired_checks(outlook: dict) -> dict[int, dict]:
    desired: dict[int, dict] = {}
    for map_outlook in outlook.get("maps", []):
        for plant in map_outlook.get("plants", []):
            if plant.get("level") != "high":
                continue
            recommended = _as_date(plant["recommended_check_date"])
            next_due = _as_date(plant["next_due"])
            if recommended > next_due:
                continue
            desired[plant["plant_id"]] = {
                "map_id": map_outlook["map_id"],
                "next_due": recommended,
                "metadata": _metadata(map_outlook, plant),
                "water_schedule_id": plant["schedule_id"],
            }
    return desired


def _normalized_plants(outlook: dict) -> set[int]:
    return {
        plant["plant_id"]
        for map_outlook in outlook.get("maps", [])
        if map_outlook.get("weather_status") == "fresh"
        for plant in map_outlook.get("plants", [])
        if plant.get("level") not in ("high", "unknown")
    }


async def sync_moisture_checks(db, *, household_id: int, outlook: dict) -> dict[str, int]:
    """Make active check rows match one household's high-pressure outlook.

    A resolved check remains suppressed throughout the same pressure episode.
    Fresh normal pressure closes that episode. Canonical Water completion after
    check creation also deactivates the temporary check.
    """
    desired = _desired_checks(outlook)
    normalized = _normalized_plants(outlook)
    created = 0
    updated = 0
    deactivated = 0

    async with database_transaction(db):
        eligible_rows = await db.execute_fetchall(
            """SELECT cs.id AS schedule_id, cs.plant_id, cs.last_done, p.map_id
               FROM care_schedules cs
               JOIN plants p ON p.id = cs.plant_id
               WHERE p.household_id = ? AND p.is_active = 1
                 AND cs.care_type = 'water' AND cs.is_active = 1
                 AND cs.is_ephemeral = 0""",
            (household_id,),
        )
        eligible = {
            row["plant_id"]: {
                "schedule_id": row["schedule_id"],
                "map_id": row.get("map_id"),
                "last_done": _completion_marker(row.get("last_done")),
            }
            for row in eligible_rows
        }
        desired = {
            plant_id: item
            for plant_id, item in desired.items()
            if eligible.get(plant_id, {}).get("schedule_id")
            == item["water_schedule_id"]
            and eligible.get(plant_id, {}).get("map_id") == item["map_id"]
        }

        rows = await db.execute_fetchall(
            """SELECT cs.id, cs.plant_id, cs.is_active, cs.last_done, cs.notes
               FROM care_schedules cs
               JOIN plants p ON p.id = cs.plant_id
               WHERE p.household_id = ? AND cs.care_type = ?
                 AND cs.is_ephemeral = 1
               ORDER BY cs.plant_id, cs.id DESC""",
            (household_id, CARE_TYPE),
        )
        active_by_plant = {
            row["plant_id"]: row for row in rows if row["is_active"]
        }
        latest_by_plant: dict[int, dict] = {}
        for row in rows:
            latest_by_plant.setdefault(row["plant_id"], row)

        # A fresh non-high reading closes a previously resolved episode, so a
        # later distinct high-pressure episode may create a new check.
        for plant_id in normalized:
            latest = latest_by_plant.get(plant_id)
            if latest is None or latest["is_active"] or latest.get("last_done") is None:
                continue
            metadata = _decode_metadata(latest.get("notes"))
            if metadata.get("episode_closed") is True:
                continue
            metadata["episode_closed"] = True
            latest["notes"] = _encode_metadata(metadata)
            await db.execute(
                "UPDATE care_schedules SET notes = ? WHERE id = ?",
                (latest["notes"], latest["id"]),
            )

        # Generic Water completion can happen outside this dialog. Compare the
        # canonical completion marker captured when the check was created.
        for plant_id, active in list(active_by_plant.items()):
            if plant_id not in desired:
                continue
            metadata = _decode_metadata(active.get("notes"))
            if (
                "water_last_done" in metadata
                and metadata["water_last_done"] != eligible[plant_id]["last_done"]
            ):
                desired.pop(plant_id)

        stale_ids = [
            row["id"]
            for plant_id, row in active_by_plant.items()
            if plant_id not in desired
        ]
        for schedule_id in stale_ids:
            await db.execute(
                "UPDATE care_schedules SET is_active = FALSE WHERE id = ?",
                (schedule_id,),
            )
            deactivated += 1

        for plant_id, item in desired.items():
            active = active_by_plant.get(plant_id)
            if active is not None:
                metadata = dict(item["metadata"])
                existing_metadata = _decode_metadata(active.get("notes"))
                metadata["water_last_done"] = existing_metadata.get(
                    "water_last_done", eligible[plant_id]["last_done"],
                )
                await db.execute(
                    """UPDATE care_schedules
                       SET next_due = ?, notes = ?
                       WHERE id = ?""",
                    (item["next_due"], _encode_metadata(metadata), active["id"]),
                )
                updated += 1
                continue

            latest = latest_by_plant.get(plant_id)
            if (
                latest is not None
                and latest.get("last_done") is not None
                and _decode_metadata(latest.get("notes")).get("episode_closed") is not True
            ):
                continue

            metadata = dict(item["metadata"])
            metadata["water_last_done"] = eligible[plant_id]["last_done"]
            notes = _encode_metadata(metadata)
            inserted = await db.execute_fetchall(
                """INSERT INTO care_schedules
                   (plant_id, care_type, interval_days, next_due,
                    is_ephemeral, notes)
                   VALUES (?, ?, 1, ?, 1, ?)
                   ON CONFLICT DO NOTHING
                   RETURNING id""",
                (plant_id, CARE_TYPE, item["next_due"], notes),
            )
            if inserted:
                created += 1
            else:
                await db.execute(
                    """UPDATE care_schedules SET next_due = ?, notes = ?
                       WHERE plant_id = ? AND care_type = ?
                         AND is_ephemeral = 1 AND is_active = 1""",
                    (item["next_due"], notes, plant_id, CARE_TYPE),
                )
                updated += 1

    return {"created": created, "updated": updated, "deactivated": deactivated}


async def resolve_moisture_checks(
    db,
    *,
    household_id: int,
    map_id: int,
    check_schedule_ids: list[int],
    outcome: ResolutionOutcome,
    completed_at: date,
    user_id: int,
) -> dict[str, int | str]:
    """Resolve selected temporary checks without touching unselected plants."""
    unique_ids = list(dict.fromkeys(check_schedule_ids))
    if not unique_ids or len(unique_ids) != len(check_schedule_ids):
        raise MoistureCheckSelectionError("invalid_check_selection")
    if outcome not in ("still_moist", "watered"):
        raise MoistureCheckSelectionError("invalid_outcome")

    done_at = datetime.combine(completed_at, time.min)
    placeholders = ",".join("?" * len(unique_ids))
    lock = for_update_clause(db)

    async with database_transaction(db):
        user_rows = await db.execute_fetchall(
            "SELECT id FROM users WHERE id = ? AND household_id = ?",
            (user_id, household_id),
        )
        if not user_rows:
            raise MoistureCheckSelectionError("invalid_user")

        selected = await db.execute_fetchall(
            f"""SELECT mc.id, mc.plant_id, mc.is_active, p.is_active AS plant_active
                FROM care_schedules mc
                JOIN plants p ON p.id = mc.plant_id
                JOIN maps m ON m.id = p.map_id
                WHERE mc.id IN ({placeholders})
                  AND mc.care_type = ? AND mc.is_ephemeral = 1
                  AND p.household_id = ? AND m.household_id = ?
                  AND p.map_id = ?{lock}""",
            tuple(unique_ids) + (CARE_TYPE, household_id, household_id, map_id),
        )
        if len(selected) != len(unique_ids):
            raise MoistureCheckSelectionError("invalid_check_selection")

        active = [row for row in selected if row["is_active"]]
        if not active:
            return {"outcome": outcome, "affected_count": 0}

        if outcome == "still_moist":
            for check in active:
                await db.execute(
                    """UPDATE care_schedules
                       SET is_active = FALSE, last_done = ?, last_done_by = ?
                       WHERE id = ?""",
                    (done_at, user_id, check["id"]),
                )
            return {"outcome": outcome, "affected_count": len(active)}

        for check in active:
            if not check["plant_active"]:
                raise MoistureCheckSelectionError("base_schedule_unavailable")
            water_rows = await db.execute_fetchall(
                """SELECT cs.id, cs.interval_days, cs.season_adjust
                   FROM care_schedules cs
                   JOIN plants p ON p.id = cs.plant_id
                   WHERE cs.plant_id = ? AND p.household_id = ?
                     AND cs.care_type = 'water' AND cs.is_active = 1
                     AND cs.is_ephemeral = 0
                   ORDER BY cs.id LIMIT 1""" + lock,
                (check["plant_id"], household_id),
            )
            if not water_rows:
                raise MoistureCheckSelectionError("base_schedule_unavailable")
            water = water_rows[0]
            next_due = calculate_next_due(
                completed_at,
                water["interval_days"],
                water.get("season_adjust"),
            )
            await db.execute(
                """INSERT INTO care_log
                   (plant_id, care_type, done_at, done_by, skipped)
                   VALUES (?, 'water', ?, ?, FALSE)""",
                (check["plant_id"], done_at, user_id),
            )
            await db.execute(
                """UPDATE care_schedules
                   SET last_done = ?, last_done_by = ?, next_due = ?
                   WHERE id = ?""",
                (done_at, user_id, next_due, water["id"]),
            )
            await db.execute(
                """UPDATE care_schedules
                   SET is_active = FALSE, last_done = ?, last_done_by = ?
                   WHERE id = ?""",
                (done_at, user_id, check["id"]),
            )

        return {"outcome": outcome, "affected_count": len(active)}
