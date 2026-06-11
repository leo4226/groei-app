"""Photo journal endpoints: upload, list, edit, delete (+ ownership)."""
import pytest
import pytest_asyncio

import routers.plant_photos as pp


EXTRA_SCHEMA = """
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
    CREATE TABLE care_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, plant_id INTEGER,
        care_type TEXT, done_by INTEGER, done_at TEXT, notes TEXT,
        skipped BOOLEAN DEFAULT FALSE
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
    await db.executescript(EXTRA_SCHEMA)
    # plant 1 in caller's household, plant 2 in a foreign household
    await db.executescript("""
        INSERT INTO households (id, name) VALUES (2, 'Other');
        INSERT INTO plants (id, name, household_id) VALUES
            (1, 'Monstera', 1), (2, 'Foreign fern', 2);
    """)
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


@pytest.mark.asyncio
async def test_upload_requires_auth(client, photo_db):
    res = await _upload(client, 1)
    assert res.status_code in (401, 403)


@pytest.mark.asyncio
async def test_upload_rejects_foreign_plant(client, photo_db, auth_header):
    res = await _upload(client, 2, headers=auth_header)
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_upload_creates_row_and_syncs_thumbnail(client, photo_db, auth_header):
    db, fake = photo_db
    res = await _upload(client, 1, headers=auth_header, note="new leaf!")
    assert res.status_code == 200
    body = res.json()
    assert body["plant_id"] == 1
    assert body["note"] == "new leaf!"
    assert body["url"].startswith("https://cdn.test/photos/1/1/")

    # exactly one R2 put, key carries household/plant prefix
    assert len(fake.puts) == 1
    assert fake.puts[0][0].startswith("photos/1/1/")

    # plants.photo_path now points at the newest journal photo
    rows = await db.execute_fetchall("SELECT photo_path FROM plants WHERE id = 1")
    assert rows[0]["photo_path"] == body["url"]


@pytest.mark.asyncio
async def test_upload_rejects_non_image(client, photo_db, auth_header):
    res = await client.post(
        "/api/plants/1/photos",
        files={"file": ("x.txt", b"hello", "text/plain")},
        headers=auth_header,
    )
    assert res.status_code == 415


@pytest.mark.asyncio
async def test_list_returns_newest_first(client, photo_db, auth_header):
    await _upload(client, 1, headers=auth_header, note="first",
                  taken_at="2026-01-01T10:00:00")
    await _upload(client, 1, headers=auth_header, note="second",
                  taken_at="2026-03-01T10:00:00")
    res = await client.get("/api/plants/1/photos", headers=auth_header)
    assert res.status_code == 200
    notes = [p["note"] for p in res.json()]
    assert notes == ["second", "first"]


@pytest.mark.asyncio
async def test_list_rejects_foreign_plant(client, photo_db, auth_header):
    res = await client.get("/api/plants/2/photos", headers=auth_header)
    assert res.status_code == 404
