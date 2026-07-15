"""Shared, household-scoped Calendar grouping preferences."""
import json

from fastapi import HTTPException

from care_types import CARE_TYPES, normalize_care_type
from services.db_transactions import database_transaction, for_update_clause


GROUPABLE_CARE_TYPES = tuple(
    care_type
    for care_type, definition in CARE_TYPES.items()
    if not definition.get("is_weather_triggered")
)
RECOMMENDED_CARE_TYPES = {
    "outdoor": ("water", "fertilize", "prune"),
    "indoor": ("water", "fertilize", "rotate", "pest_check", "dust"),
}


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


def _stored_care_types(values: list) -> list[str]:
    selected = {normalize_care_type(value) for value in values if isinstance(value, str)}
    return [care_type for care_type in GROUPABLE_CARE_TYPES if care_type in selected]


def _validated_care_types(values: list[str]) -> list[str]:
    selected: set[str] = set()
    for value in values:
        care_type = normalize_care_type(value)
        if care_type not in GROUPABLE_CARE_TYPES:
            raise HTTPException(
                status_code=422,
                detail={"code": "unsupported_calendar_grouping_care_type"},
            )
        selected.add(care_type)
    return [care_type for care_type in GROUPABLE_CARE_TYPES if care_type in selected]


async def household_maps(db, household_id: int) -> list[dict]:
    rows = await db.execute_fetchall(
        """SELECT id, name, COALESCE(map_type, 'outdoor') AS map_type
           FROM maps WHERE household_id = ? ORDER BY name, id""",
        (household_id,),
    )
    recurring_rows = await db.execute_fetchall(
        """SELECT p.map_id, cs.care_type
           FROM care_schedules cs
           JOIN plants p ON p.id = cs.plant_id
           WHERE p.household_id = ? AND p.is_active = 1 AND cs.is_active = 1
             AND p.map_id IS NOT NULL
           GROUP BY p.map_id, cs.care_type""",
        (household_id,),
    )
    recurring_by_map: dict[int, set[str]] = {}
    for row in recurring_rows:
        care_type = normalize_care_type(row["care_type"])
        if care_type in GROUPABLE_CARE_TYPES:
            recurring_by_map.setdefault(row["map_id"], set()).add(care_type)

    maps: list[dict] = []
    for row in rows:
        map_type = "indoor" if row.get("map_type") == "indoor" else "outdoor"
        recurring = recurring_by_map.get(row["id"], set())
        maps.append({
            "id": row["id"],
            "name": row["name"],
            "map_type": map_type,
            "recurring_care_types": [
                care_type for care_type in GROUPABLE_CARE_TYPES if care_type in recurring
            ],
            "recommended_care_types": list(RECOMMENDED_CARE_TYPES[map_type]),
        })
    return maps


async def outdoor_maps(db, household_id: int) -> list[dict]:
    """Legacy response projection retained while older clients age out."""
    maps = await household_maps(db, household_id)
    return [
        {"id": item["id"], "name": item["name"]}
        for item in maps if item["map_type"] == "outdoor"
    ]


def _legacy_projection(selected_by_map: dict[int, list[str]]) -> tuple[list[str], list[int]]:
    selected = [(map_id, care_types) for map_id, care_types in selected_by_map.items() if care_types]
    if not selected:
        return [], []
    first_types = selected[0][1]
    if any(care_types != first_types for _, care_types in selected[1:]):
        # Different per-map sets cannot be represented by the old Cartesian shape.
        # Empty is a safe projection: an old backend will not over-group events.
        return [], []
    return list(first_types), [map_id for map_id, _ in selected]


def _response(maps: list[dict], selected_by_map: dict[int, list[str]]) -> dict:
    rules = [
        {"map_id": item["id"], "care_types": selected_by_map.get(item["id"], [])}
        for item in maps
    ]
    care_types, map_ids = _legacy_projection(selected_by_map)
    return {
        "rules": rules,
        "maps": maps,
        "care_types": care_types,
        "map_ids": map_ids,
        "outdoor_maps": [
            {"id": item["id"], "name": item["name"]}
            for item in maps if item["map_type"] == "outdoor"
        ],
    }


async def get_calendar_grouping_preferences(db, household_id: int) -> dict:
    maps = await household_maps(db, household_id)
    valid_map_ids = {item["id"] for item in maps}
    rule_rows = await db.execute_fetchall(
        """SELECT map_id, care_type
           FROM household_calendar_grouping_rules
           WHERE household_id = ? ORDER BY map_id, care_type""",
        (household_id,),
    )
    if rule_rows:
        selected_sets: dict[int, set[str]] = {}
        for row in rule_rows:
            care_type = normalize_care_type(row["care_type"])
            if row["map_id"] in valid_map_ids and care_type in GROUPABLE_CARE_TYPES:
                selected_sets.setdefault(row["map_id"], set()).add(care_type)
        selected_by_map = {
            map_id: [
                care_type for care_type in GROUPABLE_CARE_TYPES
                if care_type in care_types
            ]
            for map_id, care_types in selected_sets.items()
        }
        return _response(maps, selected_by_map)

    legacy_rows = await db.execute_fetchall(
        """SELECT care_types, map_ids
           FROM household_calendar_grouping_preferences
           WHERE household_id = ?""",
        (household_id,),
    )
    if legacy_rows:
        stored = dict(legacy_rows[0])
        legacy_types = _stored_care_types(_decode_list(stored.get("care_types")))
        legacy_map_ids = set(_decode_list(stored.get("map_ids")))
    else:
        legacy_types = list(RECOMMENDED_CARE_TYPES["outdoor"])
        legacy_map_ids = {
            item["id"] for item in maps if item["map_type"] == "outdoor"
        }
    selected_by_map = {
        item["id"]: list(legacy_types)
        for item in maps
        if item["map_type"] == "outdoor" and item["id"] in legacy_map_ids
    }
    return _response(maps, selected_by_map)


async def save_calendar_grouping_preferences(
    db,
    *,
    household_id: int,
    rules: list[dict] | None = None,
    care_types: list[str] | None = None,
    map_ids: list[int] | None = None,
) -> dict:
    maps = await household_maps(db, household_id)
    maps_by_id = {item["id"]: item for item in maps}

    if rules is None:
        normalized_types = _validated_care_types(care_types or [])
        legacy_map_ids = map_ids or []
        valid_legacy_ids = {
            item["id"] for item in maps if item["map_type"] == "outdoor"
        }
        if set(legacy_map_ids) - valid_legacy_ids:
            raise HTTPException(
                status_code=422,
                detail={"code": "invalid_calendar_grouping_map"},
            )
        rules = [
            {"map_id": map_id, "care_types": normalized_types}
            for map_id in legacy_map_ids
        ]

    selected_by_map: dict[int, list[str]] = {}
    for rule in rules:
        map_id = rule["map_id"]
        if map_id in selected_by_map:
            raise HTTPException(
                status_code=422,
                detail={"code": "duplicate_calendar_grouping_map"},
            )
        if map_id not in maps_by_id:
            raise HTTPException(
                status_code=422,
                detail={"code": "invalid_calendar_grouping_map"},
            )
        selected_by_map[map_id] = _validated_care_types(rule.get("care_types", []))

    legacy_types, legacy_map_ids = _legacy_projection(selected_by_map)
    async with database_transaction(db):
        # Serialize replacement for all members of one household. Without this
        # lock, concurrent DELETE + INSERT requests can interleave into a union.
        await db.execute_fetchall(
            "SELECT id FROM households WHERE id = ?" + for_update_clause(db),
            (household_id,),
        )
        await db.execute(
            "DELETE FROM household_calendar_grouping_rules WHERE household_id = ?",
            (household_id,),
        )
        for map_id, selected_types in selected_by_map.items():
            for care_type in selected_types:
                await db.execute_fetchall(
                    """INSERT INTO household_calendar_grouping_rules
                       (household_id, map_id, care_type) VALUES (?, ?, ?)
                       ON CONFLICT (household_id, map_id, care_type) DO NOTHING
                       RETURNING household_id""",
                    (household_id, map_id, care_type),
                )
        await db.execute_fetchall(
            """INSERT INTO household_calendar_grouping_preferences
               (household_id, care_types, map_ids) VALUES (?, ?, ?)
               ON CONFLICT (household_id) DO UPDATE SET
                 care_types = EXCLUDED.care_types,
                 map_ids = EXCLUDED.map_ids
               RETURNING household_id""",
            (household_id, json.dumps(legacy_types), json.dumps(legacy_map_ids)),
        )

    return _response(maps, selected_by_map)
