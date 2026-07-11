from datetime import date

import pytest


EXTRA_SCHEMA = """
CREATE TABLE care_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, plant_id INTEGER, care_type TEXT,
    done_by INTEGER, done_at TEXT, notes TEXT, skipped BOOLEAN DEFAULT FALSE
);
CREATE TABLE garden_care_operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, household_id INTEGER, care_type TEXT,
    map_id INTEGER, completed_at DATE, completed_by INTEGER, created_at TEXT, undone_at TEXT
);
CREATE TABLE garden_care_operation_members (
    operation_id INTEGER, schedule_id INTEGER, previous_next_due DATE,
    previous_last_done TEXT, previous_last_done_by INTEGER, care_log_id INTEGER,
    PRIMARY KEY (operation_id, schedule_id)
);
"""


@pytest.mark.asyncio
async def test_complete_and_undo_garden_care_only_changes_outdoor_schedules(client, seeded_db, auth_header):
    db = seeded_db
    await db.executescript(EXTRA_SCHEMA)
    await db.executescript("""
        INSERT INTO users (id, name, household_id) VALUES (1, 'Leon', 1);
        INSERT INTO maps (id, name, map_type, household_id) VALUES
          (1, 'Garden', 'outdoor', 1), (2, 'House', 'indoor', 1), (3, 'Side garden', 'outdoor', 1);
        INSERT INTO plants (id, name, household_id, map_id, is_active) VALUES
          (1, 'Rose', 1, 1, 1), (2, 'Basil', 1, 1, 1), (3, 'Monstera', 1, 2, 1), (4, 'Lavender', 1, 3, 1);
        INSERT INTO care_schedules (id, plant_id, care_type, interval_days, next_due, is_active) VALUES
          (10, 1, 'water', 7, '2026-07-01', 1),
          (11, 2, 'water', 5, '2026-07-02', 1),
          (12, 3, 'water', 7, '2026-07-03', 1),
          (13, 4, 'water', 7, '2026-07-04', 1);
    """)
    await db.commit()

    result = await client.post(
        '/api/care/garden/complete',
        json={'care_type': 'water', 'completed_at': '2026-07-10', 'user_id': 1, 'map_id': 1},
        headers=auth_header,
    )
    assert result.status_code == 200
    body = result.json()
    assert body['affected_count'] == 2

    schedules = await db.execute_fetchall('SELECT id, next_due, last_done FROM care_schedules ORDER BY id')
    assert schedules[0]['next_due'] == '2026-07-17'
    assert schedules[1]['next_due'] == '2026-07-15'
    assert schedules[2]['next_due'] == '2026-07-03'
    assert schedules[2]['last_done'] is None
    assert schedules[3]['next_due'] == '2026-07-04'
    assert schedules[3]['last_done'] is None

    undo = await client.post(f"/api/care/garden/{body['operation_id']}/undo", headers=auth_header)
    assert undo.status_code == 200
    restored = await db.execute_fetchall('SELECT id, next_due, last_done FROM care_schedules ORDER BY id')
    assert [row['next_due'] for row in restored] == ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04']
    assert all(row['last_done'] is None for row in restored)
    logs = await db.execute_fetchall('SELECT id FROM care_log')
    assert logs == []
