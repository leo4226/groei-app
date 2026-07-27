from hashlib import sha256
from urllib.parse import urlparse

import pytest
from icalendar import Calendar

from routers import calendar_subscription


def _raw_token(feed_url: str) -> str:
    filename = urlparse(feed_url).path.rsplit("/", 1)[-1]
    assert filename.endswith(".ics")
    return filename[:-4]


@pytest.mark.asyncio
async def test_subscription_lifecycle_stores_only_hash_and_revokes(
    client, seeded_db, auth_header
):
    await seeded_db.execute(
        "INSERT INTO maps (id, name, map_type, household_id) VALUES (4, 'Garden', 'outdoor', 1)"
    )
    await seeded_db.commit()

    created = await client.post(
        "/api/calendar/subscription",
        headers=auth_header,
        json={
            "environment": "outdoor",
            "map_ids": [4],
            "care_types": ["water", "fertilize"],
            "include_context": False,
            "privacy": True,
        },
    )

    assert created.status_code == 201
    body = created.json()
    raw = _raw_token(body["feed_url"])
    assert body["webcal_url"].startswith("webcal://")
    assert body["config"]["privacy"] is True

    row = (
        await seeded_db.execute_fetchall(
            "SELECT token_hash, config_json, revoked_at FROM calendar_subscriptions WHERE account_id = 1"
        )
    )[0]
    assert raw not in row["token_hash"]
    assert row["token_hash"] == sha256(raw.encode()).hexdigest()
    assert row["revoked_at"] is None

    status = await client.get("/api/calendar/subscription", headers=auth_header)
    assert status.status_code == 200
    assert status.json() == {
        "active": True,
        "config": body["config"],
        "created_at": status.json()["created_at"],
    }
    assert raw not in status.text

    revoked = await client.delete("/api/calendar/subscription", headers=auth_header)
    assert revoked.status_code == 204
    status = await client.get("/api/calendar/subscription", headers=auth_header)
    assert status.json() == {"active": False, "config": None, "created_at": None}


@pytest.mark.asyncio
async def test_updating_active_subscription_preserves_token_hash(
    client, seeded_db, auth_header
):
    created = await client.post(
        "/api/calendar/subscription",
        headers=auth_header,
        json={"environment": "all", "privacy": True},
    )
    assert created.status_code == 201
    before = (
        await seeded_db.execute_fetchall(
            "SELECT token_hash FROM calendar_subscriptions WHERE account_id = 1"
        )
    )[0]["token_hash"]

    updated = await client.patch(
        "/api/calendar/subscription",
        headers=auth_header,
        json={
            "environment": "indoor",
            "care_types": ["water", "rotate"],
            "include_context": True,
            "privacy": False,
        },
    )

    assert updated.status_code == 200
    assert updated.json()["config"] == {
        "environment": "indoor",
        "map_ids": [],
        "care_types": ["rotate", "water"],
        "include_context": True,
        "privacy": False,
    }
    after = (
        await seeded_db.execute_fetchall(
            "SELECT token_hash FROM calendar_subscriptions WHERE account_id = 1"
        )
    )[0]["token_hash"]
    assert after == before


@pytest.mark.asyncio
async def test_subscription_rejects_map_outside_household(
    client, seeded_db, auth_header
):
    response = await client.post(
        "/api/calendar/subscription",
        headers=auth_header,
        json={
            "environment": "all",
            "map_ids": [999],
            "care_types": ["water"],
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == {"code": "invalid_calendar_subscription_map"}


def _calendar_events():
    base = {
        "id": "schedule:10:water:0",
        "date": "2026-07-20",
        "type": "water",
        "plant_id": 1,
        "plant_name": "Tomato",

        "map_id": 4,
        "map_name": "Garden",
        "group_member_event_ids": None,
        "group_members": None,
        "weather_triggered": False,
        "reason_nl": None,
        "reason_en": None,
        "action_nl": None,
        "action_en": None,
    }
    return [
        base,
        {
            **base,
            "id": "schedule:14:water:0",
            "plant_id": 2,
            "plant_name": "Pepper",
        },
        {**base, "id": "schedule:11:fertilize:0", "type": "fertilize"},
        {**base, "id": "schedule:12:water:0", "map_id": 5, "map_name": "Balcony"},
        {
            **base,
            "id": "schedule:13:heat_protect:0",
            "type": "heat_protect",
            "weather_triggered": True,
        },
    ]


@pytest.mark.asyncio
async def test_public_feed_filters_context_supports_etag_and_rejects_revoked_token(
    client, seeded_db, auth_header, monkeypatch
):
    await seeded_db.execute(
        "INSERT INTO maps (id, name, map_type, household_id) VALUES (4, 'Garden', 'outdoor', 1)"
    )
    await seeded_db.commit()

    async def fake_events(**kwargs):
        assert kwargs["env"] == "tuin"
        assert kwargs["group_outdoor"] is True
        assert kwargs["pin_overdue"] is True
        return _calendar_events()

    monkeypatch.setattr(calendar_subscription, "list_calendar_events", fake_events)
    created = await client.post(
        "/api/calendar/subscription",
        headers=auth_header,
        json={
            "environment": "outdoor",
            "map_ids": [4],
            "care_types": ["water"],
            "include_context": False,
        },
    )
    feed_path = urlparse(created.json()["feed_url"]).path

    feed = await client.get(feed_path)
    assert feed.status_code == 200
    assert feed.headers["content-type"].startswith("text/calendar")
    assert feed.headers["cache-control"] == "private, max-age=300"
    assert feed.headers["x-content-type-options"] == "nosniff"
    parsed = Calendar.from_ical(feed.content)
    events = [item for item in parsed.walk() if item.name == "VEVENT"]
    assert len(events) == 1
    assert "Water geven" in str(events[0]["SUMMARY"])
    assert "2 planten" in str(events[0]["SUMMARY"])
    assert "Fertilize" not in feed.text
    assert "Heat" not in feed.text
    assert "Balcony" not in feed.text

    cached = await client.get(feed_path, headers={"If-None-Match": feed.headers["etag"]})
    assert cached.status_code == 304
    assert cached.content == b""

    await client.delete("/api/calendar/subscription", headers=auth_header)
    revoked = await client.get(feed_path)
    assert revoked.status_code == 404


@pytest.mark.asyncio
async def test_moving_account_to_another_household_invalidates_old_feed(
    client, seeded_db, auth_header, monkeypatch,
):
    async def fake_events(**kwargs):
        return _calendar_events()

    monkeypatch.setattr(calendar_subscription, "list_calendar_events", fake_events)
    created = await client.post(
        "/api/calendar/subscription",
        headers=auth_header,
        json={"privacy": True},
    )
    feed_path = urlparse(created.json()["feed_url"]).path

    await seeded_db.execute("UPDATE accounts SET household_id = 2 WHERE id = 1")
    await seeded_db.commit()

    assert (await client.get(feed_path)).status_code == 404


def test_subscription_defaults_to_private_event_details():
    assert calendar_subscription.CalendarSubscriptionConfig().privacy is True


def test_external_feed_aggregates_same_map_care_independent_of_calendar_grouping():
    events = [
        {
            "id": "schedule:10:fertilize:2026-07-20",
            "date": "2026-07-20",
            "type": "fertilize",
            "plant_id": 1,
            "plant_name": "Strawberry",
            "map_id": 4,
            "map_name": "Back garden",
        },
        {
            "id": "garden:4:fertilize:2026-07-20",
            "date": "2026-07-20",
            "type": "fertilize",
            "map_id": 4,
            "map_name": "Back garden",
            "grouped": True,
            "group_count": 2,
            "group_member_event_ids": [
                "schedule:11:fertilize:2026-07-20",
                "schedule:12:fertilize:2026-07-20",
            ],
            "group_members": [
                {"plant_id": 2, "plant_name": "Raspberry"},
                {"plant_id": 3, "plant_name": "Blueberry"},
            ],
        },
        {
            "id": "schedule:13:water:2026-07-20",
            "date": "2026-07-20",
            "type": "water",
            "plant_id": 4,
            "plant_name": "Tomato",
            "map_id": 4,
            "map_name": "Back garden",
        },
        {
            "id": "schedule:14:fertilize:2026-07-20",
            "date": "2026-07-20",
            "type": "fertilize",
            "plant_id": 5,
            "plant_name": "Mint",
            "map_id": 5,
            "map_name": "Kitchen",
        },
    ]

    aggregated = calendar_subscription._aggregate_external_events(events)

    assert len(aggregated) == 3
    back_garden_fertilize = next(
        event for event in aggregated
        if event["type"] == "fertilize" and event["map_id"] == 4
    )
    assert back_garden_fertilize["group_count"] == 3
    assert back_garden_fertilize["plant_names"] == [
        "Strawberry", "Raspberry", "Blueberry",
    ]
    assert back_garden_fertilize["group_member_event_ids"] == [
        "schedule:10:fertilize:2026-07-20",
        "schedule:11:fertilize:2026-07-20",
        "schedule:12:fertilize:2026-07-20",
    ]
    assert back_garden_fertilize["external_uid_key"] == (
        "2026-07-20|fertilize|map:4"
    )


@pytest.mark.asyncio
async def test_authenticated_snapshot_is_english_private_and_needs_no_token(
    client, seeded_db, auth_header, monkeypatch
):
    await seeded_db.execute("UPDATE accounts SET language = 'en' WHERE id = 1")
    await seeded_db.commit()

    async def fake_events(**kwargs):
        return [_calendar_events()[0]]

    monkeypatch.setattr(calendar_subscription, "list_calendar_events", fake_events)
    response = await client.post(
        "/api/calendar/export.ics",
        headers=auth_header,
        json={"environment": "all", "privacy": True},
    )

    assert response.status_code == 200
    assert response.headers["content-disposition"] == 'attachment; filename="floreren-care.ics"'
    parsed = Calendar.from_ical(response.content)
    event = [item for item in parsed.walk() if item.name == "VEVENT"][0]
    assert "Water" in str(event["SUMMARY"])
    assert "Tomato" not in response.text
    rows = await seeded_db.execute_fetchall("SELECT account_id FROM calendar_subscriptions")
    assert rows == []