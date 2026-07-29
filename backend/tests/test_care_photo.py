"""PR 2 of the photo journal: care-log photos + photo-reminder schedule."""
import pytest
import pytest_asyncio

import routers.plant_photos as pp

EXTRA_SCHEMA = """
    CREATE TABLE care_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, plant_id INTEGER,
        care_type TEXT, done_by INTEGER, done_at TEXT, notes TEXT,
        skipped BOOLEAN DEFAULT FALSE
    );
"""

# Mirrors test_plant_photos.py's plant_photos DDL + FakeStorage (per plan doc).
PHOTOS_SCHEMA = """
    CREATE TABLE plant_photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plant_id INTEGER NOT NULL,
        household_id INTEGER NOT NULL,
        r2_key TEXT NOT NULL,
        url TEXT NOT NULL,
        note TEXT,
        taken_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        care_log_id INTEGER,
        bioclip_species_id INTEGER,
        bioclip_confidence REAL,
        species_mismatch BOOLEAN DEFAULT FALSE,
        embedding BLOB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
"""


class FakeStorage:
    def __init__(self):
        self.puts = []
        self.deletes = []

    def put(self, key, data, content_type):
        self.puts.append((key, len(data), content_type))
        return f"https://cdn.test/{key}"

    def delete(self, key):
        self.deletes.append(key)


@pytest_asyncio.fixture
async def photo_db(seeded_db, monkeypatch):
    db = seeded_db
    await db.executescript(EXTRA_SCHEMA + PHOTOS_SCHEMA)
    await db.execute("INSERT INTO plants (id, name, household_id) VALUES (1, 'Monstera', 1)")
    await db.commit()
    fake = FakeStorage()
    monkeypatch.setattr(pp, "build_storage_from_env", lambda: fake)
    return db, fake


JPEG = b"\xff\xd8\xff\xe0fakejpegbytes"


def _upload(client, plant_id, headers=None, **form):
    return client.post(
        f"/api/plants/{plant_id}/photos",
        files={"file": ("p.jpg", JPEG, "image/jpeg")},
        data=form, headers=headers or {},
    )


@pytest_asyncio.fixture
async def care_db(seeded_db):
    db = seeded_db
    await db.executescript(EXTRA_SCHEMA)
    await db.executescript("""
        INSERT INTO plants (id, name, household_id) VALUES (1, 'Monstera', 1);
        INSERT INTO users (id, name, household_id) VALUES (1, 'Test', 1);
        INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due, is_active)
        VALUES (1, 'water', 7, '2026-06-10', 1);
    """)
    await db.commit()
    return db


@pytest.mark.asyncio
async def test_care_done_returns_care_log_id(client, care_db, auth_header):
    res = await client.post(
        "/api/care/done",
        json={"plant_id": 1, "care_type": "water", "user_id": 1},
        headers=auth_header,
    )
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body.get("care_log_id"), int)

    rows = await care_db.execute_fetchall(
        "SELECT id FROM care_log WHERE plant_id = 1"
    )
    assert rows[0]["id"] == body["care_log_id"]


@pytest.mark.asyncio
async def test_care_done_targets_the_requested_schedule(client, care_db, auth_header):
    await care_db.execute(
        """INSERT INTO care_schedules
           (plant_id, care_type, interval_days, next_due, is_active)
           VALUES (1, 'water', 10, '2026-06-11', 1)"""
    )
    await care_db.commit()
    schedules = await care_db.execute_fetchall(
        "SELECT id FROM care_schedules WHERE plant_id = 1 ORDER BY id"
    )

    response = await client.post(
        "/api/care/done",
        json={
            "plant_id": 1,
            "care_type": "water",
            "user_id": 1,
            "schedule_id": schedules[1]["id"],
        },
        headers=auth_header,
    )

    assert response.status_code == 200
    states = await care_db.execute_fetchall(
        "SELECT id, last_done FROM care_schedules WHERE plant_id = 1 ORDER BY id"
    )
    assert states[0]["last_done"] is None
    assert states[1]["last_done"] is not None


@pytest.mark.asyncio
async def test_care_done_and_skip_require_auth(client, care_db):
    for path in ("/api/care/done", "/api/care/skip"):
        res = await client.post(
            path, json={"plant_id": 1, "care_type": "water", "user_id": 1}
        )
        assert res.status_code in (401, 403), path


@pytest.mark.asyncio
async def test_care_done_rejects_foreign_plant(client, care_db, auth_header):
    await care_db.executescript("""
        INSERT INTO households (id, name) VALUES (2, 'Other');
        INSERT INTO plants (id, name, household_id) VALUES (9, 'Foreign', 2);
        INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due, is_active)
        VALUES (9, 'water', 7, '2026-06-10', 1);
    """)
    await care_db.commit()
    res = await client.post(
        "/api/care/done",
        json={"plant_id": 9, "care_type": "water", "user_id": 1},
        headers=auth_header,
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_upload_with_care_log_id_links_photo(client, photo_db, auth_header):
    db, _ = photo_db
    await db.execute(
        "INSERT INTO care_log (plant_id, care_type, done_by) VALUES (1, 'water', 1)"
    )
    await db.commit()
    log_id = (await db.execute_fetchall("SELECT id FROM care_log"))[0]["id"]

    res = await _upload(client, 1, headers=auth_header, care_log_id=str(log_id))
    assert res.status_code == 200
    assert res.json()["care_log_id"] == log_id


@pytest.mark.asyncio
async def test_photo_reminder_rejects_nonpositive_interval(client, photo_db, auth_header):
    res = await client.put(
        "/api/plants/1/photo-reminder",
        json={"enabled": True, "interval_days": 0},
        headers=auth_header,
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_photo_reminder_toggle_creates_and_deactivates_schedule(
    client, photo_db, auth_header, monkeypatch
):
    db, _ = photo_db
    executed_sql: list[str] = []
    original_execute = db.execute

    async def capture_execute(sql, params=()):
        executed_sql.append(" ".join(sql.split()))
        return await original_execute(sql, params)

    monkeypatch.setattr(db, "execute", capture_execute)

    res = await client.put(
        "/api/plants/1/photo-reminder",
        json={"enabled": True, "interval_days": 30},
        headers=auth_header,
    )
    assert res.status_code == 200
    rows = await db.execute_fetchall(
        "SELECT interval_days, is_active FROM care_schedules WHERE plant_id = 1 AND care_type = 'photo'"
    )
    assert rows[0]["interval_days"] == 30 and rows[0]["is_active"] == 1
    insert_sql = next(sql for sql in executed_sql if sql.startswith("INSERT INTO care_schedules"))
    assert "VALUES (?, 'photo', ?, ?, TRUE)" in insert_sql

    res = await client.put(
        "/api/plants/1/photo-reminder", json={"enabled": False}, headers=auth_header
    )
    assert res.status_code == 200
    rows = await db.execute_fetchall(
        "SELECT is_active FROM care_schedules WHERE plant_id = 1 AND care_type = 'photo'"
    )
    assert rows[0]["is_active"] == 0
    deactivate_sql = next(sql for sql in executed_sql if "SET is_active" in sql)
    assert "SET is_active = FALSE" in deactivate_sql


@pytest.mark.asyncio
async def test_photo_reminder_rejects_foreign_plant(client, photo_db, auth_header):
    db, _ = photo_db
    await db.executescript("""
        INSERT INTO households (id, name) VALUES (2, 'Other');
        INSERT INTO plants (id, name, household_id) VALUES (2, 'Foreign', 2);
    """)
    await db.commit()
    res = await client.put(
        "/api/plants/2/photo-reminder", json={"enabled": True}, headers=auth_header
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_photo_upload_completes_photo_schedule(client, photo_db, auth_header):
    db, _ = photo_db
    await db.execute(
        """INSERT INTO care_schedules (plant_id, care_type, interval_days, next_due, is_active)
           VALUES (1, 'photo', 30, '2026-06-10', 1)"""
    )
    await db.commit()
    res = await _upload(client, 1, headers=auth_header)
    assert res.status_code == 200
    rows = await db.execute_fetchall(
        "SELECT next_due, last_done FROM care_schedules WHERE plant_id = 1 AND care_type = 'photo'"
    )
    assert rows[0]["last_done"] is not None
    assert str(rows[0]["next_due"]) > "2026-06-10"
