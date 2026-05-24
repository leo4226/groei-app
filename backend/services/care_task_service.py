"""Care task generation service.

Mirror of `alert_service`: takes raw care-schedule rows, produces classified
CareTask lists for the dashboard. Pure compute (no DB) once rows are fetched,
plus a small query helper so the canonical SELECT lives in one place.

Public API:
    fetch_household_schedule_rows(db, household_id) -> list[row]
    classify_care_tasks(rows, today=None) -> (overdue, due_today, upcoming)
"""
from datetime import date

from models import CareTask


_SCHEDULE_SELECT_SQL = """
    SELECT
        cs.id as schedule_id,
        cs.plant_id,
        p.name as plant_name,
        p.photo_path as plant_photo,
        l.name as location,
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


def _row_to_task(row, days_overdue: int) -> CareTask:
    return CareTask(
        plant_id=row["plant_id"],
        plant_name=row["plant_name"],
        plant_photo=row["plant_photo"],
        location=row["location"],
        map_type=row["map_type"],
        care_type=row["care_type"],
        days_overdue=days_overdue,
        last_done_by=row["last_done_by_name"],
        last_done_at=str(row["last_done_at"]) if row["last_done_at"] else None,
        schedule_id=row["schedule_id"],
        is_ephemeral=bool(row["is_ephemeral"]) if row["is_ephemeral"] is not None else False,
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
        due = row["next_due"]
        if isinstance(due, str):
            due = date.fromisoformat(due)
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
