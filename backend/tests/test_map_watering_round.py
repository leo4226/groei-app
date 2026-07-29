from __future__ import annotations

import pytest


OPERATION_SCHEMA = """
CREATE TABLE care_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plant_id INTEGER,
    care_type TEXT,
    done_by INTEGER,
    done_at TEXT,
    notes TEXT,
    skipped BOOLEAN DEFAULT FALSE
);
CREATE TABLE garden_care_operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id INTEGER,
    care_type TEXT,
    map_id INTEGER,
    completed_at DATE,
    completed_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    undone_at TEXT
);
CREATE TABLE garden_care_operation_members (
    operation_id INTEGER,
    schedule_id INTEGER,
    previous_next_due DATE,
    previous_last_done TEXT,
    previous_last_done_by INTEGER,
    care_log_id INTEGER REFERENCES care_log(id),
    applied_next_due DATE,
    applied_last_done TEXT,
    PRIMARY KEY (operation_id, schedule_id)
);
"""


async def _seed_round(db) -> None:
    await db.execute('PRAGMA foreign_keys = ON')
    await db.executescript(OPERATION_SCHEMA)
    await db.executescript("""
        INSERT INTO households (id, name) VALUES (2, 'Other Household');
        INSERT INTO users (id, name, household_id) VALUES
          (1, 'Leon', 1),
          (2, 'Lisbeth', 1),
          (3, 'Neighbour', 2);
        INSERT INTO maps (id, name, map_type, household_id) VALUES
          (1, 'Back garden', 'outdoor', 1),
          (2, 'Living room', 'indoor', 1),
          (3, 'Neighbour garden', 'outdoor', 2);
        INSERT INTO plants (id, name, household_id, map_id, is_active, icon_key) VALUES
          (101, 'Rose', 1, 1, 1, 'rose'),
          (102, 'Exact mint', 1, 1, 1, 'mint'),
          (103, 'Archived basil', 1, 1, 0, 'basil'),
          (104, 'Monstera', 1, 2, 1, 'monstera'),
          (105, 'Neighbour rose', 2, 3, 1, 'rose'),
          (106, 'Fed fern', 1, 1, 1, 'fern');
        INSERT INTO care_schedules
          (id, plant_id, care_type, interval_days, next_due,
           rhythm_opt_out, is_active)
        VALUES
          (201, 101, 'water', 14, '2026-07-25', 0, 1),
          (202, 102, 'water', 14, '2026-07-26', 1, 1),
          (203, 103, 'water', 7, '2026-07-24', 0, 1),
          (204, 104, 'water', 7, '2026-07-24', 0, 1),
          (205, 105, 'water', 7, '2026-07-24', 0, 1),
          (206, 106, 'fertilize', 30, '2026-07-24', 0, 1),
          (207, 101, 'water', 7, '2026-07-20', 0, 0);
        INSERT INTO garden_care_operations
          (id, household_id, care_type, map_id, completed_at, completed_by, undone_at)
        VALUES
          (301, 1, 'water', 1, '2026-07-20', 1, NULL),
          (302, 1, 'water', 1, '2026-07-18', 2, NULL),
          (303, 1, 'water', 2, '2026-07-19', 1, NULL),
          (304, 1, 'water', 1, '2026-07-17', 1, '2026-07-18 09:00:00'),
          (305, 2, 'water', 3, '2026-07-21', 3, NULL),
          (306, 1, 'water', 1, '2026-07-16', 2, NULL),
          (307, 1, 'water', 1, '2026-07-15', 1, NULL);
        INSERT INTO garden_care_operation_members
          (operation_id, schedule_id, previous_next_due)
        VALUES
          (301, 201, '2026-07-19'),
          (301, 202, '2026-07-19'),
          (302, 201, '2026-07-17'),
          (303, 204, '2026-07-18'),
          (304, 201, '2026-07-16'),
          (305, 205, '2026-07-20'),
          (306, 202, '2026-07-15'),
          (307, 201, '2026-07-14');
    """)
    await db.commit()


@pytest.mark.asyncio
async def test_map_watering_round_lists_active_map_water_schedules_and_history(
    client,
    seeded_db,
    auth_header,
):
    await _seed_round(seeded_db)

    response = await client.get(
        '/api/care/maps/1/watering-round',
        headers=auth_header,
    )

    assert response.status_code == 200
    body = response.json()
    assert body['map_id'] == 1
    assert body['map_name'] == 'Back garden'
    assert body['members'] == [
        {
            'schedule_id': 202,
            'plant_id': 102,
            'plant_name': 'Exact mint',
            'plant_icon_variant': 'mint',
            'canonical_date': '2026-07-26',
            'rhythm_opt_out': True,
        },
        {
            'schedule_id': 201,
            'plant_id': 101,
            'plant_name': 'Rose',
            'plant_icon_variant': 'rose',
            'canonical_date': '2026-07-25',
            'rhythm_opt_out': False,
        },
    ]
    assert body['history'] == [
        {
            'operation_id': 301,
            'completed_at': '2026-07-20',
            'completed_by': 1,
            'completed_by_name': 'Leon',
            'affected_count': 2,
            'can_undo': False,
        },
        {
            'operation_id': 302,
            'completed_at': '2026-07-18',
            'completed_by': 2,
            'completed_by_name': 'Lisbeth',
            'affected_count': 1,
            'can_undo': False,
        },
        {
            'operation_id': 306,
            'completed_at': '2026-07-16',
            'completed_by': 2,
            'completed_by_name': 'Lisbeth',
            'affected_count': 1,
            'can_undo': False,
        },
    ]

    foreign = await client.get(
        '/api/care/maps/3/watering-round',
        headers=auth_header,
    )
    assert foreign.status_code == 404


@pytest.mark.asyncio
async def test_map_watering_round_completion_updates_only_selected_map_schedule(
    client,
    seeded_db,
    auth_header,
):
    await _seed_round(seeded_db)
    before = await seeded_db.execute_fetchall(
        "SELECT id, next_due, last_done, last_done_by "
        "FROM care_schedules ORDER BY id"
    )

    response = await client.post(
        '/api/care/maps/1/watering-round/complete',
        json={
            'completed_at': '2026-07-23',
            'user_id': 1,
            'schedule_ids': [202],
        },
        headers=auth_header,
    )

    assert response.status_code == 200
    assert response.json()['affected_count'] == 1
    after = await seeded_db.execute_fetchall(
        "SELECT id, next_due, last_done, last_done_by "
        "FROM care_schedules ORDER BY id"
    )
    assert after[0] == before[0]
    assert after[1] == {
        'id': 202,
        'next_due': '2026-08-06',
        'last_done': '2026-07-23T00:00:00',
        'last_done_by': 1,
    }
    assert after[2:] == before[2:]
    assert await seeded_db.execute_fetchall(
        "SELECT plant_id, care_type, done_by FROM care_log ORDER BY id"
    ) == [{'plant_id': 102, 'care_type': 'water', 'done_by': 1}]
    operation = (await seeded_db.execute_fetchall(
        "SELECT household_id, care_type, map_id, completed_by "
        "FROM garden_care_operations WHERE id = ?",
        (response.json()['operation_id'],),
    ))[0]
    assert operation == {
        'household_id': 1,
        'care_type': 'water',
        'map_id': 1,
        'completed_by': 1,
    }


@pytest.mark.asyncio
async def test_map_watering_round_uses_routine_and_actual_recurrence_anchors(
    client,
    seeded_db,
    auth_header,
):
    await _seed_round(seeded_db)
    await seeded_db.execute(
        """INSERT INTO household_care_rhythm_preferences
           (household_id, indoor_weekdays, outdoor_weekdays)
           VALUES (1, '[]', '[7]')"""
    )
    await seeded_db.execute(
        """UPDATE care_schedules
           SET interval_days = 3, rhythm_opt_out = 0
           WHERE id = 202"""
    )
    await seeded_db.commit()

    response = await client.post(
        '/api/care/maps/1/watering-round/complete',
        json={
            'completed_at': '2026-07-23',
            'user_id': 1,
            'schedule_ids': [201, 202],
        },
        headers=auth_header,
    )

    assert response.status_code == 200
    schedules = await seeded_db.execute_fetchall(
        "SELECT id, next_due FROM care_schedules WHERE id IN (201, 202) ORDER BY id"
    )
    assert schedules == [
        {'id': 201, 'next_due': '2026-08-08'},
        {'id': 202, 'next_due': '2026-07-26'},
    ]


@pytest.mark.asyncio
async def test_map_watering_round_rejects_mixed_map_selection_atomically(
    client,
    seeded_db,
    auth_header,
):
    await _seed_round(seeded_db)
    before_schedules = await seeded_db.execute_fetchall(
        "SELECT id, next_due, last_done FROM care_schedules ORDER BY id"
    )
    before_operations = await seeded_db.execute_fetchall(
        "SELECT id FROM garden_care_operations ORDER BY id"
    )

    response = await client.post(
        '/api/care/maps/1/watering-round/complete',
        json={
            'completed_at': '2026-07-23',
            'user_id': 1,
            'schedule_ids': [201, 204],
        },
        headers=auth_header,
    )

    assert response.status_code == 422
    assert response.json()['detail']['code'] == 'invalid_map_watering_selection'
    assert await seeded_db.execute_fetchall(
        "SELECT id, next_due, last_done FROM care_schedules ORDER BY id"
    ) == before_schedules
    assert await seeded_db.execute_fetchall(
        "SELECT id FROM garden_care_operations ORDER BY id"
    ) == before_operations
    assert await seeded_db.execute_fetchall("SELECT id FROM care_log") == []


@pytest.mark.parametrize(
    ('schedule_ids', 'user_id'),
    [
        ([201, 201], 1),
        ([207], 1),
        ([205], 1),
        ([201], 3),
    ],
)
@pytest.mark.asyncio
async def test_map_watering_round_rejects_invalid_selection_without_writes(
    client,
    seeded_db,
    auth_header,
    schedule_ids,
    user_id,
):
    await _seed_round(seeded_db)
    before_schedules = await seeded_db.execute_fetchall(
        "SELECT id, next_due, last_done, last_done_by FROM care_schedules ORDER BY id"
    )
    before_operations = await seeded_db.execute_fetchall(
        "SELECT id FROM garden_care_operations ORDER BY id"
    )

    response = await client.post(
        '/api/care/maps/1/watering-round/complete',
        json={
            'completed_at': '2026-07-23',
            'user_id': user_id,
            'schedule_ids': schedule_ids,
        },
        headers=auth_header,
    )

    assert response.status_code == 422
    assert await seeded_db.execute_fetchall(
        "SELECT id, next_due, last_done, last_done_by FROM care_schedules ORDER BY id"
    ) == before_schedules
    assert await seeded_db.execute_fetchall(
        "SELECT id FROM garden_care_operations ORDER BY id"
    ) == before_operations
    assert await seeded_db.execute_fetchall("SELECT id FROM care_log") == []


@pytest.mark.asyncio
async def test_map_watering_round_complete_rejects_foreign_map_before_selection(
    client, seeded_db, auth_header,
):
    await _seed_round(seeded_db)

    response = await client.post(
        '/api/care/maps/3/watering-round/complete',
        json={
            'completed_at': '2026-07-23',
            'user_id': 1,
            'schedule_ids': [205],
        },
        headers=auth_header,
    )

    assert response.status_code == 404
    assert response.json()['detail']['code'] == 'map_not_found'
    assert await seeded_db.execute_fetchall("SELECT id FROM care_log") == []


@pytest.mark.asyncio
async def test_map_watering_round_late_routine_advances_from_completion_date(
    client,
    seeded_db,
    auth_header,
):
    await _seed_round(seeded_db)
    await seeded_db.execute(
        """INSERT INTO household_care_rhythm_preferences
           (household_id, indoor_weekdays, outdoor_weekdays)
           VALUES (1, '[]', '[7]')"""
    )
    await seeded_db.commit()

    response = await client.post(
        '/api/care/maps/1/watering-round/complete',
        json={
            'completed_at': '2026-07-27',
            'user_id': 1,
            'schedule_ids': [201],
        },
        headers=auth_header,
    )

    assert response.status_code == 200
    schedule = (await seeded_db.execute_fetchall(
        "SELECT next_due, last_done FROM care_schedules WHERE id = 201"
    ))[0]
    assert schedule == {
        'next_due': '2026-08-10',
        'last_done': '2026-07-27T00:00:00',
    }


@pytest.mark.asyncio
async def test_map_watering_round_undo_restores_schedule_and_previous_history(
    client,
    seeded_db,
    auth_header,
):
    await _seed_round(seeded_db)

    completed = await client.post(
        '/api/care/maps/1/watering-round/complete',
        json={
            'completed_at': '2026-07-23',
            'user_id': 1,
            'schedule_ids': [201],
        },
        headers=auth_header,
    )
    assert completed.status_code == 200
    operation_id = completed.json()['operation_id']
    before_undo = await client.get(
        '/api/care/maps/1/watering-round',
        headers=auth_header,
    )
    assert before_undo.status_code == 200
    assert before_undo.json()['history'][0]['operation_id'] == operation_id
    assert before_undo.json()['history'][0]['can_undo'] is True

    undo = await client.post(
        f'/api/care/garden/{operation_id}/undo',
        headers=auth_header,
    )

    assert undo.status_code == 200
    restored = (await seeded_db.execute_fetchall(
        "SELECT next_due, last_done, last_done_by FROM care_schedules WHERE id = 201"
    ))[0]
    assert restored == {
        'next_due': '2026-07-25',
        'last_done': None,
        'last_done_by': None,
    }
    assert await seeded_db.execute_fetchall("SELECT id FROM care_log") == []
    refreshed = await client.get(
        '/api/care/maps/1/watering-round',
        headers=auth_header,
    )
    assert refreshed.status_code == 200
    assert [row['operation_id'] for row in refreshed.json()['history']] == [301, 302, 306]
    assert refreshed.json()['history'][0]['can_undo'] is False
