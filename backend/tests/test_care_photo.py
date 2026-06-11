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
async def test_photo_reminder_toggle_creates_and_deactivates_schedule(client, photo_db, auth_header):
    db, _ = photo_db
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

    res = await client.put(
        "/api/plants/1/photo-reminder", json={"enabled": False}, headers=auth_header
    )
    assert res.status_code == 200
    rows = await db.execute_fetchall(
        "SELECT is_active FROM care_schedules WHERE plant_id = 1 AND care_type = 'photo'"
    )
    assert rows[0]["is_active"] == 0


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
