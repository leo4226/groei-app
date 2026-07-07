"""Field observations backed by the existing weed catalog/sighting tables."""

import pytest
import pytest_asyncio


FIELD_OBSERVATION_SCHEMA = """
    CREATE TABLE weed_species (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        common_name_nl TEXT NOT NULL,
        latin_name TEXT NOT NULL,
        family TEXT,
        common_names TEXT,
        appearance_json TEXT,
        habitat_json TEXT,
        removal_json TEXT,
        edible INTEGER DEFAULT 0,
        edible_note TEXT,
        interesting TEXT,
        native_to_nl INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE weed_sightings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        weed_id INTEGER NOT NULL,
        map_id INTEGER NOT NULL,
        map_x REAL NOT NULL,
        map_y REAL NOT NULL,
        notes TEXT,
        sighted_at TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        photo_url TEXT
    );
"""


@pytest_asyncio.fixture
async def field_observation_db(seeded_db):
    db = seeded_db
    await db.executescript(FIELD_OBSERVATION_SCHEMA)
    await db.execute(
        "INSERT INTO maps (id, name, map_type, household_id) VALUES (7, 'Park', 'outdoor', 1)"
    )
    await db.execute(
        """
        INSERT INTO weed_species (
            id, slug, common_name_nl, latin_name, family, common_names,
            appearance_json, habitat_json, removal_json, edible, edible_note,
            interesting, native_to_nl
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            1,
            "paardenbloem",
            "Paardenbloem",
            "Taraxacum officinale",
            "Asteraceae",
            '["Dandelion"]',
            '{"flower_color":"geel","growth_form":"rozet"}',
            '{"places":["park","gazon"],"bloom_months":[3,4,5],"sun_preference":"zon"}',
            '{"removal_difficulty":"makkelijk","removal_tip":"Steek de penwortel uit"}',
            1,
            "Jonge bladeren zijn eetbaar.",
            "Paardenbloemen zijn waardevol voor vroege bestuivers.",
            1,
        ),
    )
    await db.execute(
        """
        INSERT INTO weed_sightings (
            id, weed_id, map_id, map_x, map_y, notes, sighted_at, photo_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            11,
            1,
            7,
            12.5,
            34.5,
            "Bij de vijver",
            "2026-07-07T09:30:00",
            "https://cdn.test/field-observations/11.jpg",
        ),
    )
    await db.commit()
    return db


@pytest.mark.asyncio
async def test_list_field_observations_uses_existing_catalog_schema(client, field_observation_db):
    res = await client.get("/api/weed-sightings")

    assert res.status_code == 200
    body = res.json()
    assert body == [
        {
            "id": 11,
            "weed_id": 1,
            "weed_name": "Paardenbloem",
            "weed_slug": "paardenbloem",
            "latin_name": "Taraxacum officinale",
            "removal_difficulty": "makkelijk",
            "map_id": 7,
            "map_x": 12.5,
            "map_y": 34.5,
            "notes": "Bij de vijver",
            "sighted_at": "2026-07-07T09:30:00",
            "photo_url": "https://cdn.test/field-observations/11.jpg",
            "created_at": body[0]["created_at"],
        }
    ]


@pytest.mark.asyncio
async def test_detail_field_observation_returns_photo_and_field_guide_data(client, field_observation_db):
    res = await client.get("/api/weed-sightings/11")

    assert res.status_code == 200
    body = res.json()
    assert body["photo_url"] == "https://cdn.test/field-observations/11.jpg"
    assert body["removal_json"] == {
        "removal_difficulty": "makkelijk",
        "removal_tip": "Steek de penwortel uit",
    }
    assert body["fun_fact_nl"] == "Paardenbloemen zijn waardevol voor vroege bestuivers."
    assert body["ecology_data"] == {
        "appearance": {"flower_color": "geel", "growth_form": "rozet"},
        "habitat": {"places": ["park", "gazon"], "bloom_months": [3, 4, 5], "sun_preference": "zon"},
        "native_to_nl": True,
        "edible": True,
        "edible_note": "Jonge bladeren zijn eetbaar.",
    }
    assert body["flowering_months"] == [3, 4, 5]
    assert body["native_status"] == "native"
