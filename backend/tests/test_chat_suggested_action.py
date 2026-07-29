import pytest

from routers import chat as chat_router


async def _seed_plant(db, plant_id=101, household_id=1, is_active=1):
    await db.execute(
        "INSERT INTO plants (id, name, household_id, is_active) VALUES (?, 'Basilicum', ?, ?)",
        (plant_id, household_id, is_active),
    )
    await db.commit()


async def _seed_schedule(
    db,
    plant_id=101,
    care_type="water",
    schedule_id=None,
    is_active=1,
    is_ephemeral=0,
    next_due="2026-07-01",
):
    if schedule_id is not None:
        await db.execute(
            """INSERT INTO care_schedules
               (id, plant_id, care_type, is_active, is_ephemeral, next_due)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (schedule_id, plant_id, care_type, is_active, is_ephemeral, next_due),
        )
    else:
        await db.execute(
            """INSERT INTO care_schedules
               (plant_id, care_type, is_active, is_ephemeral, next_due)
               VALUES (?, ?, ?, ?, ?)""",
            (plant_id, care_type, is_active, is_ephemeral, next_due),
        )
    await db.commit()


async def _seed_map(db, map_id=10, household_id=1, slug="balcony"):
    await db.execute("ALTER TABLE maps ADD COLUMN slug TEXT")
    await db.execute(
        "INSERT INTO maps (id, name, map_type, household_id, slug) VALUES (?, 'Balcony', 'outdoor', ?, ?)",
        (map_id, household_id, slug),
    )
    await db.commit()


@pytest.mark.asyncio
async def test_navigate_to_plant_in_household_is_accepted(seeded_db):
    await _seed_plant(seeded_db)
    action = await chat_router._validate_suggested_action(
        {"type": "navigate", "label": "Open Basilicum", "payload": {"target": "plant", "id": 101}},
        seeded_db,
        household_id=1,
    )
    assert action is not None
    assert action.type == "navigate"
    assert action.requires_confirmation is False
    assert action.payload == {"target": "plant", "id": 101}


@pytest.mark.asyncio
async def test_navigate_to_plant_in_other_household_is_dropped(seeded_db):
    await _seed_plant(seeded_db, household_id=2)
    action = await chat_router._validate_suggested_action(
        {"type": "navigate", "label": "Open Basilicum", "payload": {"target": "plant", "id": 101}},
        seeded_db,
        household_id=1,
    )
    assert action is None


@pytest.mark.asyncio
async def test_navigate_to_inactive_plant_is_dropped(seeded_db):
    await _seed_plant(seeded_db, is_active=0)
    action = await chat_router._validate_suggested_action(
        {"type": "navigate", "label": "Open Basilicum", "payload": {"target": "plant", "id": 101}},
        seeded_db,
        household_id=1,
    )
    assert action is None


@pytest.mark.asyncio
async def test_navigate_to_map_by_slug_is_accepted(seeded_db):
    await _seed_map(seeded_db)
    action = await chat_router._validate_suggested_action(
        {"type": "navigate", "label": "Open Balcony", "payload": {"target": "map", "slug": "balcony"}},
        seeded_db,
        household_id=1,
    )
    assert action is not None
    assert action.payload == {"target": "map", "slug": "balcony"}


@pytest.mark.asyncio
async def test_navigate_to_calendar_needs_no_id(seeded_db):
    action = await chat_router._validate_suggested_action(
        {"type": "navigate", "label": "Open calendar", "payload": {"target": "calendar"}},
        seeded_db,
        household_id=1,
    )
    assert action is not None
    assert action.payload == {"target": "calendar"}


@pytest.mark.asyncio
async def test_navigate_plant_without_id_is_dropped(seeded_db):
    action = await chat_router._validate_suggested_action(
        {"type": "navigate", "label": "Open plant", "payload": {"target": "plant"}},
        seeded_db,
        household_id=1,
    )
    assert action is None


@pytest.mark.asyncio
async def test_mark_care_done_with_valid_schedule_is_accepted(seeded_db):
    await _seed_plant(seeded_db)
    await _seed_schedule(seeded_db, schedule_id=456)
    action = await chat_router._validate_suggested_action(
        {
            "type": "mark_care_done",
            "label": "Markeer Basilicum als water gegeven",
            "payload": {"plant_id": 101, "schedule_id": 456, "care_type": "water"},
        },
        seeded_db,
        household_id=1,
    )
    assert action is not None
    assert action.type == "mark_care_done"
    assert action.requires_confirmation is True
    assert action.payload == {"plant_id": 101, "schedule_id": 456, "care_type": "water"}


@pytest.mark.asyncio
async def test_mark_care_done_resolves_schedule_id_when_omitted(seeded_db):
    await _seed_plant(seeded_db)
    await _seed_schedule(seeded_db, schedule_id=456)
    action = await chat_router._validate_suggested_action(
        {
            "type": "mark_care_done",
            "label": "Markeer Basilicum als water gegeven",
            "payload": {"plant_id": 101, "care_type": "water"},
        },
        seeded_db,
        household_id=1,
    )
    assert action is not None
    assert action.payload["schedule_id"] == 456


@pytest.mark.asyncio
async def test_mark_care_done_rejects_informational_weather_actions(seeded_db):
    await _seed_plant(seeded_db)
    await _seed_schedule(
        seeded_db,
        care_type="heat_protect",
        schedule_id=456,
    )

    action = await chat_router._validate_suggested_action(
        {
            "type": "mark_care_done",
            "label": "Markeer hittebescherming als gedaan",
            "payload": {
                "plant_id": 101,
                "schedule_id": 456,
                "care_type": "heat_protect",
            },
        },
        seeded_db,
        household_id=1,
    )

    assert action is None


@pytest.mark.asyncio
async def test_mark_care_done_rejects_ephemeral_schedule(seeded_db):
    await _seed_plant(seeded_db)
    await _seed_schedule(seeded_db, schedule_id=456, is_ephemeral=1)

    action = await chat_router._validate_suggested_action(
        {
            "type": "mark_care_done",
            "label": "Markeer water als gedaan",
            "payload": {
                "plant_id": 101,
                "schedule_id": 456,
                "care_type": "water",
            },
        },
        seeded_db,
        household_id=1,
    )

    assert action is None


@pytest.mark.asyncio
async def test_mark_care_done_accepts_requested_schedule_among_duplicates(seeded_db):
    await _seed_plant(seeded_db)
    await _seed_schedule(seeded_db, schedule_id=455)
    await _seed_schedule(seeded_db, schedule_id=456)

    action = await chat_router._validate_suggested_action(
        {
            "type": "mark_care_done",
            "label": "Markeer water als gedaan",
            "payload": {
                "plant_id": 101,
                "schedule_id": 456,
                "care_type": "water",
            },
        },
        seeded_db,
        household_id=1,
    )

    assert action is not None
    assert action.payload["schedule_id"] == 456


@pytest.mark.asyncio
async def test_mark_care_done_with_mismatched_schedule_id_is_dropped(seeded_db):
    await _seed_plant(seeded_db)
    await _seed_schedule(seeded_db, schedule_id=456)
    action = await chat_router._validate_suggested_action(
        {
            "type": "mark_care_done",
            "label": "Markeer Basilicum als water gegeven",
            "payload": {"plant_id": 101, "schedule_id": 999, "care_type": "water"},
        },
        seeded_db,
        household_id=1,
    )
    assert action is None


@pytest.mark.asyncio
async def test_mark_care_done_without_active_schedule_is_dropped(seeded_db):
    await _seed_plant(seeded_db)
    action = await chat_router._validate_suggested_action(
        {
            "type": "mark_care_done",
            "label": "Markeer Basilicum als water gegeven",
            "payload": {"plant_id": 101, "care_type": "water"},
        },
        seeded_db,
        household_id=1,
    )
    assert action is None


@pytest.mark.asyncio
async def test_mark_care_done_for_other_household_plant_is_dropped(seeded_db):
    await _seed_plant(seeded_db, household_id=2)
    await _seed_schedule(seeded_db, schedule_id=456)
    action = await chat_router._validate_suggested_action(
        {
            "type": "mark_care_done",
            "label": "Markeer Basilicum als water gegeven",
            "payload": {"plant_id": 101, "care_type": "water"},
        },
        seeded_db,
        household_id=1,
    )
    assert action is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "raw",
    [
        None,
        {},
        {"type": "delete_plant", "label": "x", "payload": {}},
        {"type": "navigate", "label": "", "payload": {"target": "calendar"}},
        {"type": "navigate", "label": "x", "payload": {"target": "spaceship"}},
        {"type": "mark_care_done", "label": "x", "payload": {"plant_id": "not-an-int", "care_type": "water"}},
        "just a string",
    ],
)
async def test_malformed_or_unsupported_actions_are_dropped(seeded_db, raw):
    action = await chat_router._validate_suggested_action(raw, seeded_db, household_id=1)
    assert action is None


async def _make_garden_context_queryable(db):
    """The full /api/chat proxy also builds maps/species context, which the
    other tests in this file don't touch — mirrors test_chat_context.py's setup."""
    await db.execute("ALTER TABLE maps ADD COLUMN slug TEXT")
    await db.execute("ALTER TABLE maps ADD COLUMN sort_order INTEGER DEFAULT 0")
    await db.execute(
        "CREATE TABLE plant_species (id INTEGER PRIMARY KEY, common_name_nl TEXT, common_name_en TEXT, latin_name TEXT)"
    )
    await db.commit()


@pytest.mark.asyncio
async def test_chat_proxy_forwards_a_validated_suggested_action(client, seeded_db, auth_header, monkeypatch):
    await _make_garden_context_queryable(seeded_db)
    await _seed_plant(seeded_db)
    await _seed_schedule(seeded_db, schedule_id=456)
    monkeypatch.setattr(chat_router, "CHATBOT_WORKER_TOKEN", "worker-secret")

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "response": "Basilicum is 2 dagen te laat met water.",
                "suggested_action": {
                    "type": "mark_care_done",
                    "label": "Markeer Basilicum als water gegeven",
                    "payload": {"plant_id": 101, "schedule_id": 456, "care_type": "water"},
                },
            }

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, json, headers):
            assert headers["X-Worker-Token"] == "worker-secret"
            return FakeResponse()

    monkeypatch.setattr(chat_router.httpx, "AsyncClient", FakeAsyncClient)

    response = await client.post(
        "/api/chat",
        json={"message": "Ik heb Basilicum water gegeven", "history": []},
        headers=auth_header,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["response"] == "Basilicum is 2 dagen te laat met water."
    assert body["suggested_action"] == {
        "type": "mark_care_done",
        "label": "Markeer Basilicum als water gegeven",
        "requires_confirmation": True,
        "payload": {"plant_id": 101, "schedule_id": 456, "care_type": "water"},
    }


@pytest.mark.asyncio
async def test_chat_proxy_strips_an_invalid_suggested_action_but_keeps_the_reply(
    client, seeded_db, auth_header, monkeypatch
):
    await _make_garden_context_queryable(seeded_db)

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "response": "Hier is een tip.",
                "suggested_action": {
                    "type": "mark_care_done",
                    "label": "Markeer als gedaan",
                    "payload": {"plant_id": 999, "care_type": "water"},
                },
            }

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, json, headers):
            return FakeResponse()

    monkeypatch.setattr(chat_router.httpx, "AsyncClient", FakeAsyncClient)

    response = await client.post(
        "/api/chat",
        json={"message": "Wat moet ik doen?", "history": []},
        headers=auth_header,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["response"] == "Hier is een tip."
    assert body["suggested_action"] is None
