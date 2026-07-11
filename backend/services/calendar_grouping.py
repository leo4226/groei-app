"""Shared, household-scoped Calendar grouping preferences."""
import json

from fastapi import HTTPException


GROUPABLE_CARE_TYPES = ("water", "fertilize", "prune")


def _decode_list(value: str | list | None) -> list:
    if isinstance(value, list):
        return value
    if not value:
        return []
    try:
        decoded = json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return []
    return decoded if isinstance(decoded, list) else []


async def outdoor_maps(db, household_id: int) -> list[dict]:
    rows = await db.execute_fetchall(
        """SELECT id, name FROM maps
           WHERE household_id = ? AND COALESCE(map_type, 'outdoor') <> 'indoor'
           ORDER BY name, id""",
        (household_id,),
    )
    return [dict(row) for row in rows]


async def get_calendar_grouping_preferences(db, household_id: int) -> dict:
    maps = await outdoor_maps(db, household_id)
    rows = await db.execute_fetchall(
        """SELECT care_types, map_ids
           FROM household_calendar_grouping_preferences
           WHERE household_id = ?""",
        (household_id,),
    )
    if not rows:
        return {
            "care_types": list(GROUPABLE_CARE_TYPES),
            "map_ids": [item["id"] for item in maps],
            "outdoor_maps": maps,
        }

    stored = dict(rows[0])
    selected_types = set(_decode_list(stored.get("care_types")))
    selected_map_ids = set(_decode_list(stored.get("map_ids")))
    return {
        "care_types": [care_type for care_type in GROUPABLE_CARE_TYPES if care_type in selected_types],
        "map_ids": [item["id"] for item in maps if item["id"] in selected_map_ids],
        "outdoor_maps": maps,
    }


async def save_calendar_grouping_preferences(
    db, *, household_id: int, care_types: list[str], map_ids: list[int],
) -> dict:
    maps = await outdoor_maps(db, household_id)
    valid_map_ids = {item["id"] for item in maps}
    unknown_map_ids = set(map_ids) - valid_map_ids
    if unknown_map_ids:
        raise HTTPException(status_code=422, detail="Grouping maps must be outdoor maps in your household")

    normalized_types = [care_type for care_type in GROUPABLE_CARE_TYPES if care_type in set(care_types)]
    normalized_map_ids = [item["id"] for item in maps if item["id"] in set(map_ids)]
    await db.execute(
        """INSERT INTO household_calendar_grouping_preferences
           (household_id, care_types, map_ids)
           VALUES (?, ?, ?)
           ON CONFLICT (household_id) DO UPDATE SET
             care_types = EXCLUDED.care_types,
             map_ids = EXCLUDED.map_ids
           RETURNING household_id""",
        (household_id, json.dumps(normalized_types), json.dumps(normalized_map_ids)),
    )
    await db.commit()
    return {
        "care_types": normalized_types,
        "map_ids": normalized_map_ids,
        "outdoor_maps": maps,
    }
