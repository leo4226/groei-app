"""Field journal plant discoveries."""

import base64
import json

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
    CREATE TABLE plant_species (
        id INTEGER PRIMARY KEY,
        common_name_nl TEXT NOT NULL,
        common_name_en TEXT,
        latin_name TEXT,
        phenology_json TEXT
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


@pytest.mark.asyncio
async def test_list_discoveries_enriches_species_names_facts_and_location(client, discoveries_db, auth_header):
    await discoveries_db.execute(
        """INSERT INTO plant_species (id, common_name_nl, common_name_en, latin_name, phenology_json)
           VALUES (?, ?, ?, ?, ?)""",
        (
            123,
            "Jakobskruiskruid",
            "Ragwort",
            "Jacobaea vulgaris",
            json.dumps({
                "interesting_facts_nl": "Rupsen van de sint-jacobsvlinder eten deze plant graag.",
                "interesting_facts_en": "Cinnabar moth caterpillars love this plant.",
            }),
        ),
    )
    await discoveries_db.execute(
        """INSERT INTO plant_discoveries
              (account_id, household_id, species_id, common_name, latin_name, thumbnail_url,
               notes, location_lat, location_lon)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            1,
            1,
            123,
            "Jakobskruiskruid",
            "Jacobaea vulgaris",
            "https://cdn.test/discovery.jpg",
            "Near the canal",
            52.3715,
            4.8499,
        ),
    )
    await discoveries_db.commit()

    res = await client.get("/api/discover", headers=auth_header)

    assert res.status_code == 200
    item = res.json()[0]
    assert item["common_name"] == "Jakobskruiskruid"
    assert item["species_common_name_nl"] == "Jakobskruiskruid"
    assert item["species_common_name_en"] == "Ragwort"
    assert item["fun_fact_nl"] == "Rupsen van de sint-jacobsvlinder eten deze plant graag."
    assert item["fun_fact_en"] == "Cinnabar moth caterpillars love this plant."
    assert item["notes"] == "Near the canal"
    assert item["location_lat"] == 52.3715
    assert item["location_lon"] == 4.8499
