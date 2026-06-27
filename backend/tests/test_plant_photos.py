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
    CREATE TABLE plant_species (id INTEGER PRIMARY KEY, common_name_nl TEXT, common_name_en TEXT, phenology_json TEXT);
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


@pytest.mark.asyncio
async def test_patch_note(client, photo_db, auth_header):
    photo = (await _upload(client, 1, headers=auth_header, note="old")).json()
    res = await client.patch(
        f"/api/photos/{photo['id']}", json={"note": "new"}, headers=auth_header
    )
    assert res.status_code == 200
    assert res.json()["note"] == "new"


@pytest.mark.asyncio
async def test_delete_removes_r2_object_and_repoints_thumbnail(client, photo_db, auth_header):
    db, fake = photo_db
    first = (await _upload(client, 1, headers=auth_header,
                           taken_at="2026-01-01T10:00:00")).json()
    second = (await _upload(client, 1, headers=auth_header,
                            taken_at="2026-03-01T10:00:00")).json()

    res = await client.delete(f"/api/photos/{second['id']}", headers=auth_header)
    assert res.status_code == 200

    # R2 object of the deleted photo was removed
    assert len(fake.deletes) == 1
    assert fake.deletes[0].startswith("photos/1/1/")

    # thumbnail re-points at the remaining (older) photo
    rows = await db.execute_fetchall("SELECT photo_path FROM plants WHERE id = 1")
    assert rows[0]["photo_path"] == first["url"]


@pytest.mark.asyncio
async def test_delete_last_photo_clears_thumbnail(client, photo_db, auth_header):
    db, _ = photo_db
    photo = (await _upload(client, 1, headers=auth_header)).json()
    await client.delete(f"/api/photos/{photo['id']}", headers=auth_header)
    rows = await db.execute_fetchall("SELECT photo_path FROM plants WHERE id = 1")
    assert rows[0]["photo_path"] is None


@pytest.mark.asyncio
async def test_patch_and_delete_reject_foreign_photo(client, photo_db, auth_header):
    db, _ = photo_db
    await db.execute(
        """INSERT INTO plant_photos (plant_id, household_id, r2_key, url)
           VALUES (2, 2, 'photos/2/2/x.jpg', 'https://cdn.test/photos/2/2/x.jpg')"""
    )
    await db.commit()
    rows = await db.execute_fetchall(
        "SELECT id FROM plant_photos WHERE household_id = 2"
    )
    foreign_id = rows[0]["id"]
    assert (await client.patch(f"/api/photos/{foreign_id}", json={"note": "x"},
                               headers=auth_header)).status_code == 404
    assert (await client.delete(f"/api/photos/{foreign_id}",
                                headers=auth_header)).status_code == 404


@pytest.mark.asyncio
async def test_legacy_endpoint_creates_journal_entry(client, photo_db, auth_header):
    db, _ = photo_db
    res = await client.post(
        "/api/plants/1/photo",
        files={"file": ("p.jpg", JPEG, "image/jpeg")},
        headers=auth_header,
    )
    assert res.status_code == 200
    rows = await db.execute_fetchall(
        "SELECT COUNT(*) n FROM plant_photos WHERE plant_id = 1"
    )
    assert rows[0]["n"] == 1


@pytest.mark.asyncio
async def test_upload_rejects_invalid_taken_at(client, photo_db, auth_header):
    res = await _upload(client, 1, headers=auth_header, taken_at="not-a-date")
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_patch_rejects_invalid_taken_at(client, photo_db, auth_header):
    photo = (await _upload(client, 1, headers=auth_header)).json()
    res = await client.patch(
        f"/api/photos/{photo['id']}", json={"taken_at": "garbage"}, headers=auth_header
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_taken_at_serialises_with_t_separator(client, photo_db, auth_header):
    """Safari's Date() rejects space-separated timestamps — API must emit ISO-T."""
    res = await _upload(client, 1, headers=auth_header)
    assert "T" in res.json()["taken_at"]
    listed = (await client.get("/api/plants/1/photos", headers=auth_header)).json()
    assert "T" in listed[0]["taken_at"]


@pytest.mark.asyncio
async def test_legacy_endpoint_rejects_foreign_plant(client, photo_db, auth_header):
    res = await client.post(
        "/api/plants/2/photo",
        files={"file": ("p.jpg", JPEG, "image/jpeg")},
        headers=auth_header,
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_upload_schedules_bioclip_check(client, photo_db, auth_header, monkeypatch):
    """The background task runs the check on its OWN connection (the request's
    pooled connection is already released when background tasks run in prod)."""
    from contextlib import asynccontextmanager

    db, _ = photo_db
    calls = []

    async def fake_check(image_bytes, plant_species_id):
        calls.append(plant_species_id)
        return {"bioclip_species_id": 3, "bioclip_confidence": 0.8,
                "species_mismatch": True, "embedding": b"emb"}

    @asynccontextmanager
    async def fake_get_db():
        yield db

    monkeypatch.setattr(pp, "check_photo", fake_check)
    monkeypatch.setattr(pp, "_get_db", fake_get_db)

    res = await _upload(client, 1, headers=auth_header)
    assert res.status_code == 200
    # Background tasks complete before ASGITransport returns the response.
    assert calls == [None]  # plant 1 has no species_id in the fixture

    rows = await db.execute_fetchall(
        "SELECT species_mismatch, bioclip_confidence FROM plant_photos WHERE id = ?",
        (res.json()["id"],),
    )
    assert rows[0]["species_mismatch"] in (1, True)
    assert rows[0]["bioclip_confidence"] == 0.8


@pytest.mark.asyncio
async def test_upload_succeeds_when_check_returns_none(client, photo_db, auth_header, monkeypatch):
    from contextlib import asynccontextmanager

    db, _ = photo_db

    async def fake_check(image_bytes, plant_species_id):
        return None  # worker offline

    @asynccontextmanager
    async def fake_get_db():
        yield db

    monkeypatch.setattr(pp, "check_photo", fake_check)
    monkeypatch.setattr(pp, "_get_db", fake_get_db)

    res = await _upload(client, 1, headers=auth_header)
    assert res.status_code == 200
    rows = await db.execute_fetchall(
        "SELECT species_mismatch FROM plant_photos WHERE id = ?", (res.json()["id"],)
    )
    assert not rows[0]["species_mismatch"]
