import datetime as dt

from services.care_task_service import classify_care_tasks


def _schedule_row(schedule_id: int, plant_id: int, plant_name: str, care_type: str, next_due: dt.date):
    return {
        "schedule_id": schedule_id,
        "plant_id": plant_id,
        "plant_name": plant_name,
        "plant_photo": None,
        "location": "Buitenbak",
        "map_name": "Balkon",
        "map_type": "outdoor",
        "care_type": care_type,
        "next_due": next_due.isoformat(),
        "last_done_by_name": "Leon",
        "last_done_at": (next_due - dt.timedelta(days=3)).isoformat(),
        "is_ephemeral": 0,
    }


def test_classify_care_tasks_keeps_canonical_overdue_due_today_and_upcoming_buckets():
    today = dt.date(2026, 7, 1)

    overdue, due_today, upcoming = classify_care_tasks(
        [
            _schedule_row(1, 101, "Basilicum", "water", today - dt.timedelta(days=2)),
            _schedule_row(2, 102, "Lavendel", "prune", today),
            _schedule_row(3, 103, "Munt", "fertilize", today + dt.timedelta(days=7)),
            _schedule_row(4, 104, "Aloë", "rotate", today + dt.timedelta(days=8)),
        ],
        today=today,
    )

    assert [task.plant_name for task in overdue] == ["Basilicum"]
    assert overdue[0].days_overdue == 2
    assert overdue[0].next_due == "2026-06-29"
    assert overdue[0].map_name == "Balkon"
    assert overdue[0].last_done_by == "Leon"

    assert [task.plant_name for task in due_today] == ["Lavendel"]
    assert due_today[0].days_overdue == 0

    assert [task.plant_name for task in upcoming] == ["Munt"]
    assert upcoming[0].days_overdue == -7


def test_classify_care_tasks_handles_empty_schedule_rows():
    assert classify_care_tasks([], today=dt.date(2026, 7, 1)) == ([], [], [])
