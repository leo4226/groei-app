import json
from datetime import date

import pytest

from services.calendar_grouping import save_calendar_grouping_preferences
from services.garden_care import complete_outdoor_care, undo_outdoor_care


GARDEN_OPERATION_SCHEMA = """
CREATE TABLE care_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, plant_id INTEGER, care_type TEXT,
    done_by INTEGER, done_at TEXT, notes TEXT, skipped BOOLEAN DEFAULT FALSE
);
CREATE TABLE garden_care_operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, household_id INTEGER, care_type TEXT,
    map_id INTEGER, completed_at DATE, completed_by INTEGER, created_at TEXT, undone_at TEXT,
    previous_watered_at DATE, previous_watered_by INTEGER, previous_water_amount DOUBLE PRECISION
);
CREATE TABLE garden_care_operation_members (
    operation_id INTEGER, schedule_id INTEGER, previous_next_due DATE,
    previous_last_done TEXT, previous_last_done_by INTEGER,
    care_log_id INTEGER REFERENCES care_log(id),
    applied_next_due DATE, applied_last_done TEXT,
    PRIMARY KEY (operation_id, schedule_id)
);
"""


class _SqliteTransaction:
    def __init__(self, db):
        self.db = db

    async def __aenter__(self):
        await self.db.execute('BEGIN')
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        if exc_type is None:
            await self.db.commit()
        else:
            await self.db.rollback()


class _NativeTransactionDb:
    """Exercise the asyncpg-style transaction path against the SQLite fixture."""

    def __init__(self, db, *, fail_schedule_update=False, fail_undo_finalize=False):
        self.db = db
        self.fail_schedule_update = fail_schedule_update
        self.fail_undo_finalize = fail_undo_finalize
        self.queries = []

    def transaction(self):
        return _SqliteTransaction(self.db)

    async def execute(self, query, parameters=()):
        self.queries.append(query)
        if self.fail_schedule_update and 'UPDATE care_schedules' in query:
            raise RuntimeError('injected schedule update failure')
        if self.fail_undo_finalize and 'SET undone_at = CURRENT_TIMESTAMP' in query:
            raise RuntimeError('injected undo finalize failure')
        return await self.db.execute(query, parameters)

    async def execute_fetchall(self, query, parameters=()):
        self.queries.append(query)
        return await self.db.execute_fetchall(query.replace(' FOR UPDATE', ''), parameters)

    def __getattr__(self, name):
        if name in {'commit', 'rollback'}:
            raise AttributeError(name)
        return getattr(self.db, name)


async def _seed_grouping_maps(db):
    await db.executescript("""
        INSERT INTO households (id, name) VALUES (2, 'Other Household');
        INSERT INTO maps (id, name, map_type, household_id) VALUES
          (1, 'Back garden', 'outdoor', 1),
          (2, 'Living room', 'indoor', 1),
          (3, 'Other garden', 'outdoor', 2);
        INSERT INTO plants (id, name, household_id, map_id, is_active) VALUES
          (101, 'Rose', 1, 1, 1),
          (102, 'Monstera', 1, 2, 1);
        INSERT INTO care_schedules
          (id, plant_id, care_type, interval_days, next_due, is_active)
        VALUES
          (201, 101, 'water', 7, '2026-07-15', 1),
          (202, 101, 'frost_protect', 1, '2026-07-15', 1),
          (203, 102, 'rotate', 7, '2026-07-15', 1),
          (204, 102, 'dust', 30, '2026-07-15', 0);
    """)
    await db.commit()


async def _seed_single_grouped_water(db, client, auth_header):
    await db.execute('PRAGMA foreign_keys = ON')
    await db.executescript(GARDEN_OPERATION_SCHEMA)
    await db.executescript("""
        INSERT INTO users (id, name, household_id) VALUES (1, 'Leon', 1);
        INSERT INTO maps (id, name, map_type, household_id)
        VALUES (1, 'Garden', 'outdoor', 1);
        INSERT INTO plants (id, name, household_id, map_id, is_active)
        VALUES (1, 'Rose', 1, 1, 1);
        INSERT INTO care_schedules
          (id, plant_id, care_type, interval_days, next_due, is_active)
        VALUES (10, 1, 'water', 7, '2026-07-01', 1);
    """)
    await db.commit()
    response = await client.put(
        '/api/household/calendar-grouping',
        json={'rules': [{'map_id': 1, 'care_types': ['water']}]},
        headers=auth_header,
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_calendar_grouping_exposes_legacy_preferences_as_per_map_rules(
    client, seeded_db, auth_header,
):
    db = seeded_db
    await _seed_grouping_maps(db)
    await db.execute(
        """INSERT INTO household_calendar_grouping_preferences
           (household_id, care_types, map_ids) VALUES (?, ?, ?)""",
        (1, json.dumps(["water", "prune"]), json.dumps([1])),
    )
    await db.commit()

    response = await client.get('/api/household/calendar-grouping', headers=auth_header)

    assert response.status_code == 200
    body = response.json()
    assert body['rules'] == [
        {'map_id': 1, 'care_types': ['water', 'prune']},
        {'map_id': 2, 'care_types': []},
    ]
    assert body['care_types'] == ['water', 'prune']
    assert body['map_ids'] == [1]
    assert body['maps'] == [
        {
            'id': 1,
            'name': 'Back garden',
            'map_type': 'outdoor',
            'recurring_care_types': ['water'],
            'recommended_care_types': ['water', 'fertilize', 'prune'],
        },
        {
            'id': 2,
            'name': 'Living room',
            'map_type': 'indoor',
            'recurring_care_types': ['rotate'],
            'recommended_care_types': ['water', 'fertilize', 'rotate', 'pest_check', 'dust'],
        },
    ]


@pytest.mark.asyncio
async def test_calendar_grouping_saves_per_map_rules_atomically(
    client, seeded_db, auth_header,
):
    db = seeded_db
    await _seed_grouping_maps(db)

    saved = await client.put(
        '/api/household/calendar-grouping',
        json={'rules': [
            {'map_id': 1, 'care_types': ['water', 'repot']},
            {'map_id': 2, 'care_types': ['rotate', 'dust']},
        ]},
        headers=auth_header,
    )

    assert saved.status_code == 200
    assert saved.json()['rules'] == [
        {'map_id': 1, 'care_types': ['water', 'repot']},
        {'map_id': 2, 'care_types': ['rotate', 'dust']},
    ]
    stored = await db.execute_fetchall(
        """SELECT map_id, care_type
           FROM household_calendar_grouping_rules
           WHERE household_id = 1 ORDER BY map_id, care_type"""
    )
    assert [(row['map_id'], row['care_type']) for row in stored] == [
        (1, 'repot'), (1, 'water'), (2, 'dust'), (2, 'rotate'),
    ]
    legacy = (await db.execute_fetchall(
        """SELECT care_types, map_ids
           FROM household_calendar_grouping_preferences WHERE household_id = 1"""
    ))[0]
    assert json.loads(legacy['care_types']) == []
    assert json.loads(legacy['map_ids']) == []

    foreign_map = await client.put(
        '/api/household/calendar-grouping',
        json={'rules': [
            {'map_id': 1, 'care_types': ['water']},
            {'map_id': 3, 'care_types': ['water']},
        ]},
        headers=auth_header,
    )
    assert foreign_map.status_code == 422

    weather_type = await client.put(
        '/api/household/calendar-grouping',
        json={'rules': [{'map_id': 1, 'care_types': ['frost_protect']}]},
        headers=auth_header,
    )
    assert weather_type.status_code == 422

    unchanged = await client.get('/api/household/calendar-grouping', headers=auth_header)
    assert unchanged.status_code == 200
    assert unchanged.json()['rules'] == saved.json()['rules']
    schedules = await db.execute_fetchall(
        'SELECT id, next_due, is_active FROM care_schedules ORDER BY id'
    )
    assert [dict(row) for row in schedules] == [
        {'id': 201, 'next_due': '2026-07-15', 'is_active': 1},
        {'id': 202, 'next_due': '2026-07-15', 'is_active': 1},
        {'id': 203, 'next_due': '2026-07-15', 'is_active': 1},
        {'id': 204, 'next_due': '2026-07-15', 'is_active': 0},
    ]


@pytest.mark.asyncio
async def test_calendar_grouping_serializes_household_rule_replacement(seeded_db):
    await _seed_grouping_maps(seeded_db)
    db = _NativeTransactionDb(seeded_db)

    await save_calendar_grouping_preferences(
        db,
        household_id=1,
        rules=[{'map_id': 1, 'care_types': ['water']}],
    )

    lock_index = next(
        index for index, query in enumerate(db.queries)
        if 'SELECT id FROM households' in query and 'FOR UPDATE' in query
    )
    delete_index = next(
        index for index, query in enumerate(db.queries)
        if 'DELETE FROM household_calendar_grouping_rules' in query
    )
    assert lock_index < delete_index


@pytest.mark.asyncio
async def test_calendar_grouping_keeps_legacy_put_payload_compatible(
    client, seeded_db, auth_header,
):
    await _seed_grouping_maps(seeded_db)

    response = await client.put(
        '/api/household/calendar-grouping',
        json={'care_types': ['water', 'fertilize'], 'map_ids': [1]},
        headers=auth_header,
    )

    assert response.status_code == 200
    assert response.json()['rules'] == [
        {'map_id': 1, 'care_types': ['water', 'fertilize']},
        {'map_id': 2, 'care_types': []},
    ]


@pytest.mark.asyncio
async def test_calendar_grouping_accepts_every_completable_scheduled_care_type(
    client, seeded_db, auth_header,
):
    await _seed_grouping_maps(seeded_db)
    care_types = [
        'water', 'fertilize', 'prune', 'repot',
        'mist', 'rotate', 'pest_check', 'dust',
    ]

    response = await client.put(
        '/api/household/calendar-grouping',
        json={'rules': [{'map_id': 1, 'care_types': care_types}]},
        headers=auth_header,
    )

    assert response.status_code == 200
    assert response.json()['rules'][0] == {'map_id': 1, 'care_types': care_types}


@pytest.mark.asyncio
async def test_calendar_grouping_can_group_indoor_map_without_collapsing_outdoor_events(
    client, seeded_db, auth_header,
):
    db = seeded_db
    due = date.today()
    await db.executescript("""
        INSERT INTO maps (id, name, map_type, household_id) VALUES
          (1, 'Garden', 'outdoor', 1), (2, 'Living room', 'indoor', 1);
        INSERT INTO plants (id, name, household_id, map_id, is_active) VALUES
          (301, 'Rose', 1, 1, 1),
          (302, 'Monstera', 1, 2, 1),
          (303, 'Fern', 1, 2, 1);
    """)
    for plant_id in (301, 302, 303):
        await db.execute(
            """INSERT INTO care_schedules
               (plant_id, care_type, interval_days, next_due, is_active)
               VALUES (?, 'water', 7, ?, 1)""",
            (plant_id, due),
        )
    await db.commit()

    saved = await client.put(
        '/api/household/calendar-grouping',
        json={'rules': [{'map_id': 2, 'care_types': ['water']}]},
        headers=auth_header,
    )
    assert saved.status_code == 200

    response = await client.get(
        '/api/calendar/events',
        params={'from': due.isoformat(), 'to': due.isoformat()},
        headers=auth_header,
    )

    assert response.status_code == 200
    events = response.json()
    grouped = [event for event in events if event['grouped']]
    assert len(grouped) == 1
    assert grouped[0]['map_id'] == 2
    assert grouped[0]['map_name'] == 'Living room'
    assert grouped[0]['group_count'] == 2
    assert [event['plant_id'] for event in events if not event['grouped']] == [301]


@pytest.mark.asyncio
async def test_complete_and_undo_grouped_indoor_care_is_map_scoped(
    client, seeded_db, auth_header,
):
    db = seeded_db
    await db.execute('PRAGMA foreign_keys = ON')
    await db.executescript(GARDEN_OPERATION_SCHEMA)
    await db.executescript("""
        INSERT INTO users (id, name, household_id) VALUES (1, 'Leon', 1);
        INSERT INTO maps (id, name, map_type, household_id) VALUES
          (1, 'Garden', 'outdoor', 1), (2, 'Living room', 'indoor', 1);
        INSERT INTO plants (id, name, household_id, map_id, is_active) VALUES
          (1, 'Rose', 1, 1, 1),
          (2, 'Monstera', 1, 2, 1),
          (3, 'Fern', 1, 2, 1);
        INSERT INTO care_schedules
          (id, plant_id, care_type, interval_days, next_due, is_active)
        VALUES
          (10, 1, 'water', 7, '2026-07-01', 1),
          (11, 2, 'water', 7, '2026-07-02', 1),
          (12, 3, 'water', 5, '2026-07-03', 1);
    """)
    await db.commit()

    unconfigured = await client.post(
        '/api/care/garden/complete',
        json={'care_type': 'water', 'completed_at': '2026-07-10', 'user_id': 1, 'map_id': 2},
        headers=auth_header,
    )
    assert unconfigured.status_code == 404

    saved = await client.put(
        '/api/household/calendar-grouping',
        json={'rules': [{'map_id': 2, 'care_types': ['water']}]},
        headers=auth_header,
    )
    assert saved.status_code == 200

    completed = await client.post(
        '/api/care/garden/complete',
        json={'care_type': 'water', 'completed_at': '2026-07-10', 'user_id': 1, 'map_id': 2},
        headers=auth_header,
    )
    assert completed.status_code == 200
    assert completed.json()['affected_count'] == 2

    schedules = await db.execute_fetchall(
        'SELECT id, next_due, last_done FROM care_schedules ORDER BY id'
    )
    assert schedules[0]['next_due'] == '2026-07-01'
    assert schedules[0]['last_done'] is None
    assert schedules[1]['next_due'] == '2026-07-17'
    assert schedules[2]['next_due'] == '2026-07-15'

    undo = await client.post(
        f"/api/care/garden/{completed.json()['operation_id']}/undo",
        headers=auth_header,
    )
    assert undo.status_code == 200
    restored = await db.execute_fetchall(
        'SELECT id, next_due, last_done FROM care_schedules ORDER BY id'
    )
    assert [row['next_due'] for row in restored] == [
        '2026-07-01', '2026-07-02', '2026-07-03',
    ]
    assert all(row['last_done'] is None for row in restored)
    members = await db.execute_fetchall(
        'SELECT care_log_id FROM garden_care_operation_members'
    )
    assert all(member['care_log_id'] is None for member in members)


@pytest.mark.asyncio
async def test_grouped_completion_rolls_back_every_write_on_failure(
    client, seeded_db, auth_header,
):
    db = seeded_db
    await _seed_single_grouped_water(db, client, auth_header)

    failing_db = _NativeTransactionDb(db, fail_schedule_update=True)
    with pytest.raises(RuntimeError, match='injected schedule update failure'):
        await complete_outdoor_care(
            failing_db,
            household_id=1,
            care_type='water',
            completed_at=date(2026, 7, 10),
            user_id=1,
            map_id=1,
        )

    assert await db.execute_fetchall('SELECT id FROM care_log') == []
    assert await db.execute_fetchall('SELECT id FROM garden_care_operations') == []
    assert await db.execute_fetchall('SELECT operation_id FROM garden_care_operation_members') == []
    schedule = (await db.execute_fetchall(
        'SELECT next_due, last_done FROM care_schedules WHERE id = 10'
    ))[0]
    assert schedule['next_due'] == '2026-07-01'
    assert schedule['last_done'] is None


@pytest.mark.asyncio
async def test_grouped_undo_rejects_newer_schedule_changes(
    client, seeded_db, auth_header,
):
    db = seeded_db
    await _seed_single_grouped_water(db, client, auth_header)
    completed = await client.post(
        '/api/care/garden/complete',
        json={'care_type': 'water', 'completed_at': '2026-07-10', 'user_id': 1, 'map_id': 1},
        headers=auth_header,
    )
    assert completed.status_code == 200
    await db.execute(
        "UPDATE care_schedules SET next_due = '2026-07-25' WHERE id = 10"
    )
    await db.commit()

    undo = await client.post(
        f"/api/care/garden/{completed.json()['operation_id']}/undo",
        headers=auth_header,
    )

    assert undo.status_code == 409
    schedule = (await db.execute_fetchall(
        'SELECT next_due, last_done FROM care_schedules WHERE id = 10'
    ))[0]
    assert schedule['next_due'] == '2026-07-25'
    operation = (await db.execute_fetchall(
        'SELECT undone_at FROM garden_care_operations WHERE id = ?',
        (completed.json()['operation_id'],),
    ))[0]
    assert operation['undone_at'] is None


@pytest.mark.asyncio
async def test_grouped_undo_rejects_identical_newer_completion(
    client, seeded_db, auth_header,
):
    db = seeded_db
    await _seed_single_grouped_water(db, client, auth_header)
    payload = {
        'care_type': 'water',
        'completed_at': '2026-07-10',
        'user_id': 1,
        'map_id': 1,
    }
    first = await client.post(
        '/api/care/garden/complete', json=payload, headers=auth_header,
    )
    second = await client.post(
        '/api/care/garden/complete', json=payload, headers=auth_header,
    )
    assert first.status_code == second.status_code == 200

    undo = await client.post(
        f"/api/care/garden/{first.json()['operation_id']}/undo",
        headers=auth_header,
    )

    assert undo.status_code == 409
    operations = await db.execute_fetchall(
        'SELECT id, undone_at FROM garden_care_operations ORDER BY id'
    )
    assert [row['undone_at'] for row in operations] == [None, None]
    assert len(await db.execute_fetchall('SELECT id FROM care_log')) == 2


@pytest.mark.asyncio
async def test_grouped_undo_rolls_back_every_restore_on_failure(
    client, seeded_db, auth_header,
):
    db = seeded_db
    await _seed_single_grouped_water(db, client, auth_header)
    completed = await client.post(
        '/api/care/garden/complete',
        json={'care_type': 'water', 'completed_at': '2026-07-10', 'user_id': 1, 'map_id': 1},
        headers=auth_header,
    )
    operation_id = completed.json()['operation_id']

    failing_db = _NativeTransactionDb(db, fail_undo_finalize=True)
    with pytest.raises(RuntimeError, match='injected undo finalize failure'):
        await undo_outdoor_care(
            failing_db,
            household_id=1,
            operation_id=operation_id,
        )

    schedule = (await db.execute_fetchall(
        'SELECT next_due, last_done FROM care_schedules WHERE id = 10'
    ))[0]
    assert schedule['next_due'] == '2026-07-17'
    assert schedule['last_done'] == '2026-07-10T00:00:00'
    assert len(await db.execute_fetchall('SELECT id FROM care_log')) == 1
    member = (await db.execute_fetchall(
        'SELECT care_log_id FROM garden_care_operation_members'
    ))[0]
    assert member['care_log_id'] is not None
    operation = (await db.execute_fetchall(
        'SELECT undone_at FROM garden_care_operations WHERE id = ?',
        (operation_id,),
    ))[0]
    assert operation['undone_at'] is None
