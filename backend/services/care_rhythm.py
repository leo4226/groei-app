"""Deterministic Water Care-rhythm preference and session planning."""
import hashlib
import json
from datetime import date, timedelta
from itertools import combinations
from typing import Iterable

from fastapi import HTTPException

from services.care_sessions import project_water_session
from services.db_transactions import database_transaction, for_update_clause
from services.scheduling import calculate_effective_interval


ISO_WEEKDAYS = tuple(range(1, 8))


def _normalized_weekdays(values: Iterable[int]) -> tuple[int, ...]:
    weekdays = tuple(sorted(set(values)))
    if any(day not in ISO_WEEKDAYS for day in weekdays):
        raise ValueError("weekdays_must_use_iso_1_to_7")
    return weekdays


def _as_date(value: date | str) -> date:
    return date.fromisoformat(value) if isinstance(value, str) else value


def _canonical_timestamp(value) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat(sep=" ")
    return str(value).replace("T", " ")


def align_due_date(
    due: date,
    preferred_weekdays: Iterable[int],
) -> tuple[date, int, str]:
    """Return a safe aligned date, signed movement, and machine-readable reason."""
    weekdays = _normalized_weekdays(preferred_weekdays)
    if due.isoweekday() in weekdays:
        return due, 0, "aligned"

    previous = due - timedelta(days=1)
    if previous.isoweekday() in weekdays:
        return previous, -1, "moved_earlier"

    return due, 0, "outside_window"


def _proposal_score(rows: list[dict], candidate: tuple[int, ...]) -> tuple:
    actual_weekdays: set[int] = set()
    movement = 0
    exceptions = 0
    for row in rows:
        aligned, moved_days, reason = align_due_date(
            _as_date(row["next_due"]), candidate,
        )
        actual_weekdays.add(aligned.isoweekday())
        movement += abs(moved_days)
        if reason == "outside_window":
            exceptions += 1

    return (
        len(actual_weekdays),
        movement,
        exceptions,
        len(candidate),
        candidate,
    )


def propose_preferred_weekdays(schedule_rows: Iterable[dict]) -> list[int]:
    """Choose one or two weekdays using the approved deterministic score."""
    rows = sorted(
        (dict(row) for row in schedule_rows),
        key=lambda row: (row.get("schedule_id", 0), str(row["next_due"])),
    )
    if not rows:
        return []

    candidates = [
        candidate
        for size in (1, 2)
        for candidate in combinations(ISO_WEEKDAYS, size)
    ]
    best = min(candidates, key=lambda candidate: _proposal_score(rows, candidate))
    return list(best)


def normalize_rhythm_config(config: dict) -> dict:
    """Return a canonical config used by preview, persistence, and hashing."""
    indoor = list(_normalized_weekdays(config.get("indoor_weekdays", [])))
    outdoor = list(_normalized_weekdays(config.get("outdoor_weekdays", [])))
    if len(indoor) > 2 or len(outdoor) > 2:
        raise ValueError("at_most_two_preferred_weekdays")

    overrides: list[dict] = []
    seen_map_ids: set[int] = set()
    for raw in config.get("map_overrides", []):
        map_id = raw.get("map_id")
        if not isinstance(map_id, int) or map_id < 1:
            raise ValueError("invalid_map_override")
        if map_id in seen_map_ids:
            raise ValueError("duplicate_map_override")
        seen_map_ids.add(map_id)
        weekdays = list(_normalized_weekdays(raw.get("weekdays", [])))
        if not weekdays or len(weekdays) > 2:
            raise ValueError("map_override_requires_one_or_two_weekdays")
        overrides.append({"map_id": map_id, "weekdays": weekdays})

    return {
        "indoor_weekdays": indoor,
        "outdoor_weekdays": outdoor,
        "map_overrides": sorted(overrides, key=lambda item: item["map_id"]),
    }


def _effective_weekdays(row: dict, config: dict) -> list[int]:
    overrides = {
        item["map_id"]: item["weekdays"]
        for item in config["map_overrides"]
    }
    if row.get("map_id") in overrides:
        return overrides[row["map_id"]]
    if row.get("map_type") == "indoor":
        return config["indoor_weekdays"]
    return config["outdoor_weekdays"]


def effective_weekdays_for_map(
    config: dict,
    *,
    map_id: int | None,
    map_type: str | None,
) -> list[int]:
    """Resolve a map override before its indoor or outdoor default."""
    return _effective_weekdays(
        {"map_id": map_id, "map_type": map_type},
        config,
    )


def _hashable_schedule_state(row: dict) -> dict:
    return {
        "schedule_id": row["schedule_id"],
        "plant_id": row.get("plant_id"),
        "map_id": row.get("map_id"),
        "map_type": row.get("map_type"),
        "next_due": _as_date(row["next_due"]).isoformat(),
        "interval_days": row.get("interval_days"),
        "season_adjust": row.get("season_adjust"),
        "rhythm_opt_out": bool(row.get("rhythm_opt_out")),
        "rhythm_operation_id": row.get("rhythm_operation_id"),
        "last_done": _canonical_timestamp(row.get("last_done")),
        "last_done_by": row.get("last_done_by"),
    }


def build_rhythm_preview(
    schedule_rows: Iterable[dict],
    config: dict,
    *,
    today: date,
    household_id: int,
) -> dict:
    """Project a complete Water rhythm preview without writing state."""
    canonical = normalize_rhythm_config(config)
    rows = sorted(
        (dict(row) for row in schedule_rows),
        key=lambda row: (_as_date(row["next_due"]), row["schedule_id"]),
    )

    hash_payload = {
        "household_id": household_id,
        "today": today.isoformat(),
        "config": canonical,
        "schedules": sorted(
            (_hashable_schedule_state(row) for row in rows),
            key=lambda row: row["schedule_id"],
        ),
    }
    encoded = json.dumps(
        hash_payload,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    preview_hash = hashlib.sha256(encoded).hexdigest()

    items: list[dict] = []
    group_members: dict[tuple[str, int], list[int]] = {}
    moved = unchanged = exceptions = 0

    for row in rows:
        due = _as_date(row["next_due"])
        weekdays = _effective_weekdays(row, canonical)
        if due <= today:
            new_due, movement, status, reason = due, 0, "exception", "not_future"
        else:
            projection = project_water_session(
                canonical_due=due,
                effective_interval=calculate_effective_interval(
                    row["interval_days"], row.get("season_adjust"), due,
                ),
                preferred_weekdays=weekdays,
                opted_out=bool(row.get("rhythm_opt_out")),
            )
            if projection.is_routine:
                new_due = projection.session_date
                movement = (new_due - due).days
                status = "moved" if movement else "unchanged"
                reason = projection.reason
            else:
                new_due, movement = due, 0
                status, reason = "exception", projection.reason

        if status == "moved":
            moved += 1
        elif status == "unchanged":
            unchanged += 1
        else:
            exceptions += 1

        if status != "exception" and row.get("map_id") is not None:
            group_members.setdefault(
                (new_due.isoformat(), row["map_id"]), [],
            ).append(row["schedule_id"])

        items.append({
            "schedule_id": row["schedule_id"],
            "plant_id": row.get("plant_id"),
            "plant_name": row.get("plant_name"),
            "species_common_name_nl": row.get("species_common_name_nl"),
            "species_common_name_en": row.get("species_common_name_en"),
            "plant_icon_variant": row.get("plant_icon_variant"),
            "map_id": row.get("map_id"),
            "map_name": row.get("map_name"),
            "map_type": "indoor" if row.get("map_type") == "indoor" else "outdoor",
            "old_date": due.isoformat(),
            "new_date": new_due.isoformat(),
            "movement_days": movement,
            "status": status,
            "reason": reason,
        })

    map_names = {
        row.get("map_id"): row.get("map_name")
        for row in rows
        if row.get("map_id") is not None
    }
    groups = [
        {
            "date": event_date,
            "map_id": map_id,
            "map_name": map_names.get(map_id),
            "count": len(schedule_ids),
            "schedule_ids": sorted(schedule_ids),
        }
        for (event_date, map_id), schedule_ids in sorted(group_members.items())
    ]

    return {
        "config": canonical,
        "preview_hash": preview_hash,
        "items": items,
        "groups": groups,
        "summary": {
            "total": len(items),
            "moved": moved,
            "unchanged": unchanged,
            "exceptions": exceptions,
            "group_count": len(groups),
        },
    }


def _decode_weekdays(value: str | list | None) -> list[int]:
    if isinstance(value, list):
        raw = value
    elif value:
        try:
            raw = json.loads(value)
        except (TypeError, json.JSONDecodeError):
            raw = []
    else:
        raw = []
    if not isinstance(raw, list):
        return []
    try:
        return list(_normalized_weekdays(raw))[:2]
    except (TypeError, ValueError):
        return []


async def household_rhythm_maps(db, household_id: int) -> list[dict]:
    rows = await db.execute_fetchall(
        """SELECT id, name, COALESCE(map_type, 'outdoor') AS map_type
           FROM maps WHERE household_id = ? ORDER BY name, id""",
        (household_id,),
    )
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "map_type": "indoor" if row.get("map_type") == "indoor" else "outdoor",
        }
        for row in rows
    ]


async def _validate_config_maps(db, household_id: int, config: dict) -> dict:
    canonical = normalize_rhythm_config(config)
    maps = await household_rhythm_maps(db, household_id)
    valid_map_ids = {item["id"] for item in maps}
    if any(
        override["map_id"] not in valid_map_ids
        for override in canonical["map_overrides"]
    ):
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_care_rhythm_map"},
        )
    return canonical


async def fetch_rhythm_schedule_rows(
    db,
    household_id: int,
    *,
    lock: bool = False,
) -> list[dict]:
    query = """
        SELECT cs.id AS schedule_id, cs.plant_id, cs.next_due,
               cs.interval_days, cs.season_adjust,
               cs.rhythm_opt_out, cs.rhythm_operation_id,
               cs.last_done, cs.last_done_by,
               p.name AS plant_name, p.icon_key AS plant_icon_variant,
               p.map_id, m.name AS map_name,
               COALESCE(m.map_type, 'outdoor') AS map_type
        FROM care_schedules cs
        JOIN plants p ON p.id = cs.plant_id
        JOIN maps m ON m.id = p.map_id
        WHERE p.household_id = ? AND p.is_active = 1
          AND cs.is_active = 1 AND cs.is_ephemeral = 0
          AND cs.care_type = 'water'
        ORDER BY cs.next_due, cs.id
    """
    if lock:
        query += for_update_clause(db)
    return [
        dict(row)
        for row in await db.execute_fetchall(query, (household_id,))
    ]


async def get_care_rhythm_settings(
    db,
    household_id: int,
    *,
    today: date | None = None,
) -> dict:
    today = today or date.today()
    maps = await household_rhythm_maps(db, household_id)
    preferences = await db.execute_fetchall(
        """SELECT indoor_weekdays, outdoor_weekdays
           FROM household_care_rhythm_preferences WHERE household_id = ?""",
        (household_id,),
    )
    overrides = await db.execute_fetchall(
        """SELECT map_id, weekdays FROM map_care_rhythm_overrides
           WHERE household_id = ? ORDER BY map_id""",
        (household_id,),
    )

    if preferences:
        row = preferences[0]
        config = normalize_rhythm_config({
            "indoor_weekdays": _decode_weekdays(row.get("indoor_weekdays")),
            "outdoor_weekdays": _decode_weekdays(row.get("outdoor_weekdays")),
            "map_overrides": [
                {
                    "map_id": item["map_id"],
                    "weekdays": _decode_weekdays(item.get("weekdays")),
                }
                for item in overrides
                if _decode_weekdays(item.get("weekdays"))
            ],
        })
        saved = True
    else:
        schedules = await fetch_rhythm_schedule_rows(db, household_id)
        eligible = [
            row for row in schedules
            if _as_date(row["next_due"]) > today and not row.get("rhythm_opt_out")
        ]
        config = {
            "indoor_weekdays": propose_preferred_weekdays(
                row for row in eligible if row.get("map_type") == "indoor"
            ),
            "outdoor_weekdays": propose_preferred_weekdays(
                row for row in eligible if row.get("map_type") != "indoor"
            ),
            "map_overrides": [],
        }
        saved = False

    return {"saved": saved, "config": config, "maps": maps}


async def preview_care_rhythm(
    db,
    *,
    household_id: int,
    config: dict,
    today: date | None = None,
) -> dict:
    today = today or date.today()
    canonical = await _validate_config_maps(db, household_id, config)
    schedules = await fetch_rhythm_schedule_rows(db, household_id)
    return build_rhythm_preview(
        schedules,
        canonical,
        today=today,
        household_id=household_id,
    )


async def preview_onboarding_care_rhythm(
    db,
    *,
    household_id: int,
    map_id: int,
    interval_days: int,
    today: date | None = None,
) -> dict:
    today = today or date.today()
    baseline = today + timedelta(days=interval_days)
    maps = await household_rhythm_maps(db, household_id)
    selected_map = next((item for item in maps if item["id"] == map_id), None)
    if selected_map is None:
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_care_rhythm_map"},
        )

    snapshot = await _config_snapshot(db, household_id)
    if not snapshot["saved"]:
        return {
            "available": False,
            "baseline_date": baseline.isoformat(),
            "proposed_date": None,
            "movement_days": 0,
            "reason": "not_configured",
        }

    weekdays = _effective_weekdays(
        {"map_id": map_id, "map_type": selected_map["map_type"]},
        snapshot["config"],
    )
    if not weekdays:
        return {
            "available": False,
            "baseline_date": baseline.isoformat(),
            "proposed_date": None,
            "movement_days": 0,
            "reason": "no_routine",
        }

    proposed, movement, reason = align_due_date(baseline, weekdays)
    available = reason != "outside_window"
    return {
        "available": available,
        "baseline_date": baseline.isoformat(),
        "proposed_date": proposed.isoformat() if available else None,
        "movement_days": movement if available else 0,
        "reason": reason,
    }


class CareRhythmStalePreview(Exception):
    """The schedule state changed after the user reviewed the preview."""


class CareRhythmUndoConflict(Exception):
    """A later write owns configuration or schedules from this operation."""


async def _config_snapshot(db, household_id: int, *, lock: bool = False) -> dict:
    preference_query = """
        SELECT indoor_weekdays, outdoor_weekdays, last_operation_id
        FROM household_care_rhythm_preferences WHERE household_id = ?
    """
    if lock:
        preference_query += for_update_clause(db)
    preferences = await db.execute_fetchall(preference_query, (household_id,))
    if not preferences:
        return {
            "saved": False,
            "config": {
                "indoor_weekdays": [],
                "outdoor_weekdays": [],
                "map_overrides": [],
            },
            "last_operation_id": None,
        }

    row = preferences[0]
    overrides = await db.execute_fetchall(
        """SELECT map_id, weekdays FROM map_care_rhythm_overrides
           WHERE household_id = ? ORDER BY map_id""",
        (household_id,),
    )
    config = normalize_rhythm_config({
        "indoor_weekdays": _decode_weekdays(row.get("indoor_weekdays")),
        "outdoor_weekdays": _decode_weekdays(row.get("outdoor_weekdays")),
        "map_overrides": [
            {
                "map_id": item["map_id"],
                "weekdays": _decode_weekdays(item.get("weekdays")),
            }
            for item in overrides
            if _decode_weekdays(item.get("weekdays"))
        ],
    })
    return {
        "saved": True,
        "config": config,
        "last_operation_id": row.get("last_operation_id"),
    }


async def get_saved_care_rhythm_config(
    db,
    household_id: int,
) -> dict | None:
    """Return the persisted Care Rhythm config for a household, or None if
    no saved preferences row exists.

    Calls ``_config_snapshot`` exactly once and uses its existing decoding
    and normalization behaviour (``_decode_weekdays`` / ``normalize_rhythm_config``).
    Never writes to the database. Does not leak another household's config.
    Returns ``None`` even when ``get_care_rhythm_settings`` would dynamically
    propose weekdays for an unsaved household.
    """
    snapshot = await _config_snapshot(db, household_id)
    if not snapshot["saved"]:
        return None
    return snapshot["config"]


async def _write_config(
    db,
    *,
    household_id: int,
    config: dict,
    operation_id: int | None,
) -> None:
    canonical = normalize_rhythm_config(config)
    await db.execute_fetchall(
        """INSERT INTO household_care_rhythm_preferences
           (household_id, indoor_weekdays, outdoor_weekdays, last_operation_id)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (household_id) DO UPDATE SET
             indoor_weekdays = EXCLUDED.indoor_weekdays,
             outdoor_weekdays = EXCLUDED.outdoor_weekdays,
             last_operation_id = EXCLUDED.last_operation_id
           RETURNING household_id""",
        (
            household_id,
            json.dumps(canonical["indoor_weekdays"]),
            json.dumps(canonical["outdoor_weekdays"]),
            operation_id,
        ),
    )
    await db.execute(
        "DELETE FROM map_care_rhythm_overrides WHERE household_id = ?",
        (household_id,),
    )
    for override in canonical["map_overrides"]:
        await db.execute_fetchall(
            """INSERT INTO map_care_rhythm_overrides
               (household_id, map_id, weekdays) VALUES (?, ?, ?)
               RETURNING household_id""",
            (
                household_id,
                override["map_id"],
                json.dumps(override["weekdays"]),
            ),
        )


async def apply_care_rhythm(
    db,
    *,
    household_id: int,
    config: dict,
    preview_hash: str,
    today: date | None = None,
) -> dict:
    today = today or date.today()
    canonical = normalize_rhythm_config(config)

    async with database_transaction(db):
        await db.execute_fetchall(
            "SELECT id FROM households WHERE id = ?" + for_update_clause(db),
            (household_id,),
        )
        canonical = await _validate_config_maps(db, household_id, canonical)
        schedules = await fetch_rhythm_schedule_rows(db, household_id, lock=True)
        plan = build_rhythm_preview(
            schedules,
            canonical,
            today=today,
            household_id=household_id,
        )
        if plan["preview_hash"] != preview_hash:
            raise CareRhythmStalePreview

        previous = await _config_snapshot(db, household_id, lock=True)
        operation_rows = await db.execute_fetchall(
            """INSERT INTO care_rhythm_operations
               (household_id, previous_config, applied_config, preview_hash)
               VALUES (?, ?, ?, ?) RETURNING id""",
            (
                household_id,
                json.dumps(previous, sort_keys=True),
                json.dumps(canonical, sort_keys=True),
                preview_hash,
            ),
        )
        operation_id = operation_rows[0]["id"]
        await _write_config(
            db,
            household_id=household_id,
            config=canonical,
            operation_id=operation_id,
        )

    return {
        "operation_id": operation_id,
        "affected_count": 0,
        "preview_hash": preview_hash,
        "summary": plan["summary"],
    }


def _same_date(left, right) -> bool:
    if left is None or right is None:
        return left is right
    return _as_date(left) == _as_date(right)


async def undo_care_rhythm(
    db,
    *,
    household_id: int,
    operation_id: int,
) -> bool:
    async with database_transaction(db):
        await db.execute_fetchall(
            "SELECT id FROM households WHERE id = ?" + for_update_clause(db),
            (household_id,),
        )
        operations = await db.execute_fetchall(
            """SELECT id, previous_config FROM care_rhythm_operations
               WHERE id = ? AND household_id = ? AND undone_at IS NULL"""
            + for_update_clause(db),
            (operation_id, household_id),
        )
        if not operations:
            return False

        current = await _config_snapshot(db, household_id, lock=True)
        if current["last_operation_id"] != operation_id:
            raise CareRhythmUndoConflict

        members = await db.execute_fetchall(
            """SELECT crm.schedule_id, crm.previous_next_due,
                      crm.applied_next_due, crm.previous_rhythm_operation_id,
                      crm.previous_last_done, crm.previous_last_done_by,
                      cs.next_due AS current_next_due,
                      cs.rhythm_operation_id AS current_rhythm_operation_id,
                      cs.last_done AS current_last_done,
                      cs.last_done_by AS current_last_done_by
               FROM care_rhythm_operation_members crm
               JOIN care_schedules cs ON cs.id = crm.schedule_id
               WHERE crm.operation_id = ?""" + for_update_clause(db),
            (operation_id,),
        )
        for member in members:
            if (
                member.get("current_rhythm_operation_id") != operation_id
                or not _same_date(
                    member.get("current_next_due"),
                    member.get("applied_next_due"),
                )
                or _canonical_timestamp(member.get("current_last_done"))
                != _canonical_timestamp(member.get("previous_last_done"))
                or member.get("current_last_done_by")
                != member.get("previous_last_done_by")
            ):
                raise CareRhythmUndoConflict

        for member in members:
            await db.execute(
                """UPDATE care_schedules
                   SET next_due = ?, rhythm_operation_id = ?
                   WHERE id = ?""",
                (
                    member["previous_next_due"],
                    member.get("previous_rhythm_operation_id"),
                    member["schedule_id"],
                ),
            )

        previous = json.loads(operations[0]["previous_config"])
        if previous.get("saved"):
            await _write_config(
                db,
                household_id=household_id,
                config=previous["config"],
                operation_id=previous.get("last_operation_id"),
            )
        else:
            await db.execute(
                "DELETE FROM map_care_rhythm_overrides WHERE household_id = ?",
                (household_id,),
            )
            await db.execute(
                "DELETE FROM household_care_rhythm_preferences WHERE household_id = ?",
                (household_id,),
            )

        await db.execute(
            "UPDATE care_rhythm_operations SET undone_at = CURRENT_TIMESTAMP WHERE id = ?",
            (operation_id,),
        )
    return True
