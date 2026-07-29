"""Durable completion-history projection for GET /api/calendar/events."""
from datetime import date

import pytest
import pytest_asyncio


HISTORY_SCHEMA = """
CREATE TABLE care_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plant_id INTEGER NOT NULL,
    care_type TEXT NOT NULL,
    done_by INTEGER,
    done_at TIMESTAMP NOT NULL,
    notes TEXT,
    skipped BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE garden_care_operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id INTEGER NOT NULL,
    care_type TEXT NOT NULL,
    map_id INTEGER,
    completed_at DATE NOT NULL,
    completed_by INTEGER,
    created_at TIMESTAMP,
    undone_at TIMESTAMP
);
CREATE TABLE garden_care_operation_members (
    operation_id INTEGER NOT NULL,
    schedule_id INTEGER NOT NULL,
    previous_next_due DATE NOT NULL,
    previous_last_done TIMESTAMP,
    previous_last_done_by INTEGER,
    care_log_id INTEGER,
    applied_next_due DATE,
    applied_last_done TIMESTAMP,
    PRIMARY KEY (operation_id, schedule_id)
);
"""


@pytest_asyncio.fixture
async def history_db(seeded_db):
    await seeded_db.executescript(HISTORY_SCHEMA)
    return seeded_db


@pytest.mark.asyncio
async def test_calendar_history_returns_successful_logs_on_actual_completion_date(
    client, history_db, auth_header,
):
    await history_db.executescript("""
        INSERT INTO maps (id, name, map_type, household_id) VALUES
          (51, 'Garden', 'outdoor', 1),
          (52, 'House', 'indoor', 1);
        INSERT INTO plants (id, name, household_id, map_id, is_active) VALUES
          (501, 'Archived rose', 1, 51, 0),
          (502, 'Monstera', 1, 52, 1),
          (503, 'Skipped mint', 1, 51, 1),
          (504, 'Late fern', 1, 51, 1);
        INSERT INTO care_log (id, plant_id, care_type, done_at, skipped) VALUES
          (601, 501, 'water', '2026-07-09 22:30:00', FALSE),
          (602, 502, 'prune', '2026-07-10 19:15:00', FALSE),
          (603, 503, 'water', '2026-07-10 20:00:00', TRUE),
          (604, 504, 'water', '2026-07-10 22:30:00', FALSE);
    """)
    await history_db.commit()

    response = await client.get(
        '/api/calendar/events',
        params={
            'from': '2026-07-10',
            'to': '2026-07-10',
            'include_history': 'true',
        },
        headers=auth_header,
    )

    assert response.status_code == 200
    completed = [event for event in response.json() if event['status'] == 'completed']
    assert [(event['id'], event['date'], event['plant_id']) for event in completed] == [
        ('care-log:601', '2026-07-10', 501),
        ('care-log:602', '2026-07-10', 502),
    ]
    assert completed[0]['plant_name'] == 'Archived rose'
    assert completed[0]['map_name'] == 'Garden'

    indoor = await client.get(
        '/api/calendar/events',
        params={
            'from': '2026-07-10',
            'to': '2026-07-10',
            'env': 'huis',
            'include_history': 'true',
        },
        headers=auth_header,
    )
    assert indoor.status_code == 200
    assert [
        event['plant_id'] for event in indoor.json()
        if event['status'] == 'completed'
    ] == [502]


@pytest.mark.asyncio
async def test_calendar_history_collapses_group_members_and_hides_undone_operation(
    client, history_db, auth_header,
):
    await history_db.executescript("""
        INSERT INTO maps (id, name, map_type, household_id)
          VALUES (61, 'Front garden', 'outdoor', 1);
        INSERT INTO plants (id, name, household_id, map_id, is_active) VALUES
          (611, 'Rose', 1, 61, 1),
          (612, 'Mint', 1, 61, 1),
          (613, 'Lavender', 1, 61, 1);
        INSERT INTO care_schedules
          (id, plant_id, care_type, interval_days, next_due, is_active) VALUES
          (621, 611, 'water', 7, '2026-07-17', 1),
          (622, 612, 'water', 7, '2026-07-17', 1),
          (623, 613, 'prune', 30, '2026-08-09', 1);
        INSERT INTO care_log (id, plant_id, care_type, done_at, skipped) VALUES
          (631, 611, 'water', '2026-07-10 09:00:00', FALSE),
          (632, 612, 'water', '2026-07-10 09:00:00', FALSE),
          (633, 613, 'prune', '2026-07-10 10:00:00', FALSE);
        INSERT INTO garden_care_operations
          (id, household_id, care_type, map_id, completed_at, undone_at) VALUES
          (641, 1, 'water', 61, '2026-07-10', NULL),
          (642, 1, 'prune', 61, '2026-07-10', '2026-07-10 10:05:00');
        INSERT INTO garden_care_operation_members
          (operation_id, schedule_id, previous_next_due, care_log_id) VALUES
          (641, 621, '2026-07-01', 631),
          (641, 622, '2026-07-02', 632),
          (642, 623, '2026-07-03', 633);
    """)
    await history_db.commit()

    response = await client.get(
        '/api/calendar/events',
        params={
            'from': '2026-07-10',
            'to': '2026-07-10',
            'include_history': 'true',
        },
        headers=auth_header,
    )

    assert response.status_code == 200
    completed = [event for event in response.json() if event['status'] == 'completed']
    assert len(completed) == 1
    assert completed[0] == {
        **completed[0],
        'id': 'garden-operation:641',
        'date': '2026-07-10',
        'type': 'water',
        'plant_id': None,
        'map_id': 61,
        'map_name': 'Front garden',
        'grouped': True,
        'group_count': 2,
        'status': 'completed',
    }
