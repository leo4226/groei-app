import datetime as dt

import pytest

from routers import chat as chat_router


@pytest.mark.asyncio
async def test_chat_proxy_sends_bounded_structured_garden_context(
    client,
    seeded_db,
    auth_header,
    monkeypatch,
):
    await seeded_db.execute("ALTER TABLE maps ADD COLUMN slug TEXT")
    await seeded_db.execute("ALTER TABLE maps ADD COLUMN sort_order INTEGER DEFAULT 0")
    await seeded_db.execute(
        "CREATE TABLE plant_species (id INTEGER PRIMARY KEY, common_name_nl TEXT, common_name_en TEXT, latin_name TEXT)"
    )
    await seeded_db.execute(
        "INSERT INTO users (id, name, household_id, language) VALUES (1, 'Leon', 1, 'en')"
    )
    await seeded_db.execute(
        "INSERT INTO maps (id, name, slug, map_type, household_id, sort_order) VALUES (10, 'Balcony', 'balcony', 'outdoor', 1, 1)"
    )
    await seeded_db.execute(
        "INSERT INTO locations (id, name, household_id) VALUES (3, 'Back left', 1)"
    )
    await seeded_db.execute(
        "INSERT INTO plant_species (id, common_name_nl, common_name_en, latin_name) VALUES (7, 'Basilicum', 'Basil', 'Ocimum basilicum')"
    )
    await seeded_db.execute(
        """INSERT INTO plants
           (id, name, species_id, location_id, map_id, is_active, household_id,
            sun_requirement, plant_type, phase, care_profile)
           VALUES
           (101, 'Kitchen basil', 7, 3, 10, 1, 1, 'full_sun', 'herb', 'established', ?)
        """,
        ('{"water":{"active":true,"interval_days":2}}',),
    )
    await seeded_db.execute(
        "INSERT INTO care_schedules (plant_id, care_type, next_due, is_active, last_done) VALUES (101, 'water', ?, 1, ?)",
        ((dt.date.today() - dt.timedelta(days=1)).isoformat(), (dt.date.today() - dt.timedelta(days=4)).isoformat()),
    )
    await seeded_db.commit()

    async def fake_temp_data(db):
        return {"days": [], "avg_max_7day": 22.0, "assessment": "warm"}

    async def fake_rain_data(db):
        return {"days": [], "total_7day_mm": 2.0, "total_14day_mm": 4.0, "assessment": "very_dry"}

    monkeypatch.setattr(chat_router, "get_temp_data", fake_temp_data)
    monkeypatch.setattr(chat_router, "get_rain_data", fake_rain_data)

    async def fake_biodiversity_packet(db, household_id, map_slug=None):
        return {"maps": [{"name": "Balcony", "score": 55, "pollinator_gaps": ["jul"]}]}, "bio"

    monkeypatch.setattr(chat_router, "_fetch_biodiversity_packet", fake_biodiversity_packet)

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"response": "Water Kitchen basil today."}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, json, headers):
            captured["url"] = url
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(chat_router.httpx, "AsyncClient", FakeAsyncClient)

    response = await client.post(
        "/api/chat",
        json={
            "message": "What should I do?",
            "history": [],
            "page_context": {
                "route": "/map/balcony",
                "map_slug": "balcony",
                "selected_plant_id": 101,
                "selected_object_id": 88,
                "clicked_map_x": 12.5,
                "clicked_map_y": 34.5,
                "ground_zone_id": "zone-1",
                "ground_zone_name": "Back border",
                "ground_zone_type": "soil",
                "light_bucket": "full",
                "direct_sun_hours": 5.25,
                "sky_view_factor": 0.8,
            },
            "active_user_id": 1,
        },
        headers=auth_header,
    )

    assert response.status_code == 200
    assert response.json() == {"response": "Water Kitchen basil today.", "suggested_action": None}
    payload = captured["json"]
    assert payload["language"] == "en"
    assert payload["garden_context"]["schema_version"] == "garden-context-v1"
    assert payload["garden_context"]["language"] == "en"
    assert payload["garden_context"]["weather"]["rain"]["assessment"] == "very_dry"
    assert payload["garden_context"]["plants"][0]["name"] == "Kitchen basil"
    assert payload["garden_context"]["plants"][0]["active_warnings"][0]["care_type"] == "water"
    assert payload["garden_context"]["plants"][0]["care_overview"]["water"]["status"] == "overdue"
    assert payload["garden_context"]["current_page"]["selected_plant_id"] == 101
    assert payload["garden_context"]["current_page"]["selected_object_id"] == 88
    assert payload["garden_context"]["current_page"]["light_bucket"] == "full"
    assert payload["garden_context"]["context_summary"] == {
        "total_plants": 1,
        "included_plants": 1,
        "truncated": False,
        "current_map_only": False,
        "focused_plant_id": 101,
        "focused_map_slug": "balcony",
    }


@pytest.mark.asyncio
async def test_chat_proxy_prefers_requested_language_over_profile(
    client,
    seeded_db,
    auth_header,
    monkeypatch,
):
    await seeded_db.execute("ALTER TABLE maps ADD COLUMN slug TEXT")
    await seeded_db.execute("ALTER TABLE maps ADD COLUMN sort_order INTEGER DEFAULT 0")
    await seeded_db.execute(
        "CREATE TABLE plant_species (id INTEGER PRIMARY KEY, common_name_nl TEXT, common_name_en TEXT, latin_name TEXT)"
    )
    await seeded_db.execute(
        "INSERT INTO users (id, name, household_id, language) VALUES (1, 'Leon', 1, 'nl')"
    )
    await seeded_db.commit()

    async def fake_temp_data(db):
        return {"days": [], "avg_max_7day": 0.0, "assessment": "unknown"}

    async def fake_rain_data(db):
        return {"days": [], "total_7day_mm": 0.0, "total_14day_mm": 0.0, "assessment": "unknown"}

    async def fake_biodiversity_packet(db, household_id, map_slug=None):
        return {"maps": []}, ""

    monkeypatch.setattr(chat_router, "get_temp_data", fake_temp_data)
    monkeypatch.setattr(chat_router, "get_rain_data", fake_rain_data)
    monkeypatch.setattr(chat_router, "_fetch_biodiversity_packet", fake_biodiversity_packet)

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"response": "ok"}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, json, headers):
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(chat_router.httpx, "AsyncClient", FakeAsyncClient)

    response = await client.post(
        "/api/chat",
        json={"message": "hello", "history": [], "language": "en", "active_user_id": 1},
        headers=auth_header,
    )

    assert response.status_code == 200
    assert captured["json"]["language"] == "en"
    assert captured["json"]["garden_context"]["language"] == "en"


@pytest.mark.asyncio
async def test_chat_context_prioritizes_focused_plant_and_marks_truncation(
    client,
    seeded_db,
    auth_header,
    monkeypatch,
):
    monkeypatch.setattr(chat_router, "MAX_CONTEXT_PLANTS", 2)
    await seeded_db.execute("ALTER TABLE maps ADD COLUMN slug TEXT")
    await seeded_db.execute("ALTER TABLE maps ADD COLUMN sort_order INTEGER DEFAULT 0")
    await seeded_db.execute(
        "CREATE TABLE plant_species (id INTEGER PRIMARY KEY, common_name_nl TEXT, common_name_en TEXT, latin_name TEXT)"
    )
    await seeded_db.execute(
        "INSERT INTO users (id, name, household_id, language) VALUES (1, 'Leon', 1, 'en')"
    )
    await seeded_db.execute(
        "INSERT INTO maps (id, name, slug, map_type, household_id, sort_order) VALUES (10, 'Balcony', 'balcony', 'outdoor', 1, 1)"
    )
    await seeded_db.executemany(
        """INSERT INTO plants
           (id, name, map_id, is_active, household_id, sun_requirement, plant_type, phase, care_profile)
           VALUES (?, ?, 10, 1, 1, 'full_sun', 'herb', 'established', ?)
        """,
        [
            (201, "Aloe", '{}'),
            (202, "Focused fern", '{}'),
            (203, "Mint", '{}'),
        ],
    )
    await seeded_db.commit()

    async def fake_temp_data(db):
        return {"days": [], "avg_max_7day": 0.0, "assessment": "unknown"}

    async def fake_rain_data(db):
        return {"days": [], "total_7day_mm": 0.0, "total_14day_mm": 0.0, "assessment": "unknown"}

    async def fake_biodiversity_packet(db, household_id, map_slug=None):
        return {"maps": []}, ""

    monkeypatch.setattr(chat_router, "get_temp_data", fake_temp_data)
    monkeypatch.setattr(chat_router, "get_rain_data", fake_rain_data)
    monkeypatch.setattr(chat_router, "_fetch_biodiversity_packet", fake_biodiversity_packet)

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"response": "ok"}

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, json, headers):
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(chat_router.httpx, "AsyncClient", FakeAsyncClient)

    response = await client.post(
        "/api/chat",
        json={
            "message": "What do you know about this plant?",
            "history": [],
            "page_context": {"route": "/plants/202", "plant_id": 202},
            "active_user_id": 1,
        },
        headers=auth_header,
    )

    assert response.status_code == 200
    garden_context = captured["json"]["garden_context"]
    assert [p["id"] for p in garden_context["plants"]] == [202, 201]
    assert garden_context["context_summary"] == {
        "total_plants": 3,
        "included_plants": 2,
        "truncated": True,
        "current_map_only": False,
        "focused_plant_id": 202,
    }
    assert garden_context["bounds"]["truncated"] is True
    assert "I can see 2 of your 3 plants" in garden_context["response_guidance"]
    assert "I can see 2 of your 3 plants" in captured["json"]["plants_context"]
