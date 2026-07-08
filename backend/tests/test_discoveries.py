"""Field journal plant discoveries."""

import base64

import pytest
import pytest_asyncio


DISCOVERIES_SCHEMA = """
    CREATE TABLE plant_discoveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        household_id INTEGER NOT NULL,
        species_id INTEGER,
        common_name TEXT NOT NULL,
        latin_name TEXT,
        thumbnail_url TEXT,
        notes TEXT,
        location_lat REAL,
        location_lon REAL,
        discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
"""


class FakeStorage:
    def __init__(self):
        self.puts = []

    def put(self, key: str, data: bytes, content_type: str) -> str:
        self.puts.append((key, data, content_type))
        return f"https://cdn.test/{key}"


@pytest_asyncio.fixture
async def discoveries_db(seeded_db):
    db = seeded_db
    await db.executescript(DISCOVERIES_SCHEMA)
    await db.commit()
    return db


@pytest.mark.asyncio
async def test_save_discovery_uploads_captured_photo_data(client, discoveries_db, auth_header, monkeypatch):
    from routers import discoveries

    storage = FakeStorage()
    monkeypatch.setattr(discoveries, "_get_storage", lambda: storage)
    payload = base64.b64encode(b"fake jpg").decode("ascii")

    res = await client.post(
        "/api/discover",
        headers=auth_header,
        json={
            "species_id": 123,
            "common_name": "Dandelion",
            "latin_name": "Taraxacum officinale",
            "thumbnail_data": f"data:image/jpeg;base64,{payload}",
        },
    )

    assert res.status_code == 201
    body = res.json()
    assert body["thumbnail_url"].startswith("https://cdn.test/field-journal/")
    assert storage.puts == [
        (storage.puts[0][0], b"fake jpg", "image/jpeg"),
    ]

    list_res = await client.get("/api/discover", headers=auth_header)
    assert list_res.status_code == 200
    assert list_res.json()[0]["thumbnail_url"] == body["thumbnail_url"]
