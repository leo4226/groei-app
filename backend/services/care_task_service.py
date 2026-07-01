"""Care task generation service.

Mirror of `alert_service`: takes raw care-schedule rows, produces classified
CareTask lists for the dashboard. Pure compute (no DB) once rows are fetched,
plus a small query helper so the canonical SELECT lives in one place.

Public API:
    fetch_household_schedule_rows(db, household_id) -> list[row]
    classify_care_tasks(rows, today=None) -> (overdue, due_today, upcoming)
"""
from datetime import date, datetime

from models import CareTask


_SCHEDULE_SELECT_SQL = """
    SELECT
        cs.id as schedule_id,
        cs.plant_id,
        p.name as plant_name,
        p.photo_path as plant_photo,
        l.name as location,
        m.name as map_name,
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
"""


async def fetch_household_schedule_rows(db, household_id: int) -> list:
    """Fetch all active care schedules for a household with plant+location+map context."""
    cursor = await db.execute(_SCHEDULE_SELECT_SQL, (household_id,))
    return await cursor.fetchall()


def _row_get(row, key: str, default=None):
    if hasattr(row, "get"):
        return row.get(key, default)
    try:
        return row[key]
    except (KeyError, TypeError):
        return default


def _date_to_iso(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value)
    return text[:10] if len(text) >= 10 else text


def _row_to_task(row, days_overdue: int) -> CareTask:
    last_done_at = _row_get(row, "last_done_at")
    is_ephemeral = _row_get(row, "is_ephemeral")
    return CareTask(
        plant_id=_row_get(row, "plant_id"),
        plant_name=_row_get(row, "plant_name"),
        plant_photo=_row_get(row, "plant_photo"),
        location=_row_get(row, "location"),
        map_name=_row_get(row, "map_name"),
        map_type=_row_get(row, "map_type"),
        care_type=_row_get(row, "care_type"),
        next_due=_date_to_iso(_row_get(row, "next_due")),
        days_overdue=days_overdue,
        last_done_by=_row_get(row, "last_done_by_name"),
        last_done_at=_date_to_iso(last_done_at),
        schedule_id=_row_get(row, "schedule_id"),
        is_ephemeral=bool(is_ephemeral) if is_ephemeral is not None else False,
    )


def classify_care_tasks(rows, today: date | None = None) -> tuple[list[CareTask], list[CareTask], list[CareTask]]:
    """Partition schedule rows into overdue / due_today / upcoming (next 7 days) CareTask lists.

    Overdue is sorted most-overdue first; the other two preserve query order
    (which is `next_due ASC`).
    """
    today = today or date.today()
    overdue: list[CareTask] = []
    due_today: list[CareTask] = []
    upcoming: list[CareTask] = []

    for row in rows:
        due = _row_get(row, "next_due")
        if isinstance(due, datetime):
            due = due.date()
        elif isinstance(due, str):
            due = date.fromisoformat(due[:10])
        days_diff = (due - today).days
        task = _row_to_task(row, days_overdue=-days_diff)

        if days_diff < 0:
            overdue.append(task)
        elif days_diff == 0:
            due_today.append(task)
        elif days_diff <= 7:
            upcoming.append(task)

    overdue.sort(key=lambda t: t.days_overdue, reverse=True)
    return overdue, due_today, upcoming
