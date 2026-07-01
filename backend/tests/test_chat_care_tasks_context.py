import datetime as dt

import pytest

from routers import chat as chat_router


async def _prepare_chat_db(seeded_db):
    await seeded_db.execute("ALTER TABLE maps ADD COLUMN slug TEXT")
    await seeded_db.execute("ALTER TABLE maps ADD COLUMN sort_order INTEGER DEFAULT 0")
    await seeded_db.execute(
        "CREATE TABLE plant_species (id INTEGER PRIMARY KEY, common_name_nl TEXT, common_name_en TEXT, latin_name TEXT)"
    )
    await seeded_db.execute(
        "INSERT INTO users (id, name, household_id, language) VALUES (1, 'Leon', 1, 'nl')"
    )
    await seeded_db.execute(
        "INSERT INTO maps (id, name, slug, map_type, household_id, sort_order) VALUES (10, 'Balkon', 'balkon', 'outdoor', 1, 1)"
    )
    await seeded_db.execute(
        "INSERT INTO locations (id, name, household_id) VALUES (3, 'Buitenbak', 1)"
    )


def _patch_stekkie_dependencies(monkeypatch, captured):
    async def fake_temp_data(db):
        return {"days": [], "avg_max_7day": 22.0, "assessment": "warm"}

    async def fake_rain_data(db):
        return {"days": [], "total_7day_mm": 12.0, "total_14day_mm": 24.0, "assessment": "normal"}

    async def fake_biodiversity_packet(db, household_id, map_slug=None):
        return {"maps": []}, ""

    monkeypatch.setattr(chat_router, "get_temp_data", fake_temp_data)
    monkeypatch.setattr(chat_router, "get_rain_data", fake_rain_data)
    monkeypatch.setattr(chat_router, "_fetch_biodiversity_packet", fake_biodiversity_packet)

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


@pytest.mark.asyncio
async def test_chat_context_adds_canonical_care_tasks_ordered_by_urgency(
    client,
    seeded_db,
    auth_header,
    monkeypatch,
):
    await _prepare_chat_db(seeded_db)
    today = dt.date.today()
    await seeded_db.executemany(
        """INSERT INTO plants
           (id, name, location_id, map_id, is_active, household_id, care_profile)
           VALUES (?, ?, 3, 10, 1, 1, '{}')
        """,
        [
            (101, "Basilicum"),
            (102, "Lavendel"),
            (103, "Munt"),
        ],
    )
    await seeded_db.executemany(
        """INSERT INTO care_schedules
           (id, plant_id, care_type, next_due, is_active, last_done_by, last_done, is_ephemeral)
           VALUES (?, ?, ?, ?, 1, 1, ?, ?)
        """,
        [
            (201, 101, "water", (today - dt.timedelta(days=2)).isoformat(), (today - dt.timedelta(days=5)).isoformat(), 0),
            (202, 102, "prune", today.isoformat(), (today - dt.timedelta(days=14)).isoformat(), 0),
            (203, 103, "fertilize", (today + dt.timedelta(days=7)).isoformat(), None, 1),
        ],
    )
    await seeded_db.commit()

    captured = {}
    _patch_stekkie_dependencies(monkeypatch, captured)

    response = await client.post(
        "/api/chat",
        json={"message": "Welke planten moet ik vandaag verzorgen?", "history": [], "active_user_id": 1},
        headers=auth_header,
    )

    assert response.status_code == 200
    care_tasks = captured["json"]["garden_context"]["care_tasks"]
    assert [task["plant_name"] for task in care_tasks["overdue"]] == ["Basilicum"]
    assert [task["plant_name"] for task in care_tasks["due_today"]] == ["Lavendel"]
    assert [task["plant_name"] for task in care_tasks["upcoming_7_days"]] == ["Munt"]

    overdue = care_tasks["overdue"][0]
    assert overdue["plant_id"] == 101
    assert overdue["map_name"] == "Balkon"
    assert overdue["location"] == "Buitenbak"
    assert overdue["care_type"] == "water"
    assert overdue["due_bucket"] == "overdue"
    assert overdue["days_overdue"] == 2
    assert overdue["last_done_at"] == (today - dt.timedelta(days=5)).isoformat()
    assert overdue["last_done_by"] == "Leon"
    assert overdue["schedule_id"] == 201
    assert overdue["is_ephemeral"] is False
    assert overdue["reason"] == "Water is 2 dagen te laat"

    due_today = care_tasks["due_today"][0]
    assert due_today["days_until_due"] == 0
    assert due_today["reason"] == "Snoeien is vandaag gepland"

    upcoming = care_tasks["upcoming_7_days"][0]
    assert upcoming["days_until_due"] == 7
    assert upcoming["is_ephemeral"] is True
    assert upcoming["reason"] == "Bemesten staat over 7 dagen gepland"

    guidance = captured["json"]["garden_context"]["response_guidance"]
    assert "care_tasks.overdue vóór due_today vóór upcoming_7_days" in guidance
    assert "precies één geprioriteerde volgende actie" in guidance


@pytest.mark.asyncio
async def test_chat_context_empty_care_tasks_tells_stekkie_not_to_invent_tasks(
    client,
    seeded_db,
    auth_header,
    monkeypatch,
):
    await _prepare_chat_db(seeded_db)
    await seeded_db.commit()

    captured = {}
    _patch_stekkie_dependencies(monkeypatch, captured)

    response = await client.post(
        "/api/chat",
        json={"message": "Moet ik vandaag iets verzorgen?", "history": [], "active_user_id": 1},
        headers=auth_header,
    )

    assert response.status_code == 200
    assert captured["json"]["garden_context"]["care_tasks"] == {
        "overdue": [],
        "due_today": [],
        "upcoming_7_days": [],
    }
    guidance = captured["json"]["garden_context"]["response_guidance"]
    assert "Verzin geen verzorgingstaken" in guidance
    assert "niets gepland staat in Floreren" in guidance
