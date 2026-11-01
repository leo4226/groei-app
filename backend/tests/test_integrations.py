"""Integration tokens + the read-only household snapshot (LAveren)."""
from datetime import date, datetime, timedelta, timezone
from hashlib import sha256

import pytest
import pytest_asyncio

from services import integration_snapshot
from services.local_time import local_today


EXTRA_SCHEMA = """
    ALTER TABLE maps ADD COLUMN slug TEXT;
    ALTER TABLE maps ADD COLUMN lat REAL;
    ALTER TABLE maps ADD COLUMN lon REAL;
    ALTER TABLE maps ADD COLUMN viewbox TEXT;
    ALTER TABLE maps ADD COLUMN canvas_data TEXT;
    CREATE TABLE plant_species (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        latin_name TEXT,
        common_name_nl TEXT,
        common_name_en TEXT
    );
    CREATE TABLE care_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, plant_id INTEGER,
        care_type TEXT, done_by INTEGER, done_at TIMESTAMP, notes TEXT,
        skipped BOOLEAN DEFAULT FALSE
    );
    CREATE TABLE plant_photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plant_id INTEGER NOT NULL,
        household_id INTEGER NOT NULL,
        r2_key TEXT NOT NULL,
        url TEXT NOT NULL,
        note TEXT,
        taken_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
"""


@pytest.fixture(autouse=True)
def _empty_snapshot_cache():
    integration_snapshot.clear_cache()
    yield
    integration_snapshot.clear_cache()


FORECAST = {
    "available": True,
    "stale": False,
    "source_timestamp": "2026-11-01T09:00:00+00:00",
    "location": {"lat": 52.3715, "lon": 4.8499},
    "current": {"temperature_2m": 6.5, "relative_humidity_2m": 80, "weather_code": 61},
    "daily": {
        "time": ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"],
        "weather_code": [61, 3, 0, 71],
        "temperature_2m_min": [3.0, -1.5, 2.0, -4.0],
        "temperature_2m_max": [9.0, 7.0, 8.0, 2.0],
        "precipitation_sum": [4.2, 0.0, 0.0, 1.0],
    },
}


@pytest.fixture(autouse=True)
def _offline_weather_and_biodiversity(monkeypatch):
    """No network, and a fixed biodiversity profile (the reduced test schema
    lacks the ecology tables compute_for_map reads)."""
    from services import garden_biodiversity
    from services.garden_biodiversity import GardenBiodiversity

    calls = []

    async def fake_forecast(lat, lon, **_kwargs):
        calls.append((lat, lon))
        return FORECAST

    async def fake_biodiversity(db, map_id):
        return GardenBiodiversity(
            score=62, species_count=12, native_count=7, invasive_count=0,
            pollinator_coverage_months=[False] * 3 + [True] * 7 + [False] * 2,
            streek_name="Laagveengebied", drachtplant_count=5,
        )

    monkeypatch.setattr(integration_snapshot.weather_forecast, "get_map_forecast", fake_forecast)
    monkeypatch.setattr(garden_biodiversity, "compute_for_map", fake_biodiversity)
    return calls


@pytest_asyncio.fixture
async def household(seeded_db):
    db = seeded_db
    await db.executescript(EXTRA_SCHEMA)
    today = local_today()
    await db.executescript(
        f"""
        INSERT INTO households (id, name) VALUES (2, 'Other');
        INSERT INTO accounts (id, household_id, email, name, password_hash, role)
            VALUES (2, 2, 'other@example.com', 'Other', 'x', 'owner');
        INSERT INTO users (id, name, household_id, account_id) VALUES (10, 'Lisbeth', 1, 1);
        INSERT INTO maps (id, name, map_type, household_id, slug, lat, lon, viewbox, canvas_data)
            VALUES (4, 'Tuin', 'outdoor', 1, 'tuin', 52.3715, 4.8499, '0 0 460 230',
                    '{{"zones":[{{"type":"lawn","x":0,"y":0,"width":460,"height":230}},{{"type":"bogus","x":"<script>","y":1,"width":10,"height":10}}]}}'),
                   (5, 'Kamer', 'indoor', 1, 'kamer', NULL, NULL, '0 0 300 200', NULL),
                   (9, 'Elsewhere', 'outdoor', 2, 'x', NULL, NULL, '0 0 10 10', NULL);
        INSERT INTO plant_species (id, latin_name, common_name_nl, common_name_en)
            VALUES (1, 'Ficus carica', 'Vijg', 'Fig'), (2, 'Mentha', 'Munt', NULL);
        INSERT INTO plants (id, name, household_id, map_id, map_x, map_y, species_id, photo_path, is_active)
            VALUES (1, 'Vijg', 1, 4, 100, 50, 1, 'https://img.example/fig.jpg', 1),
                   (2, 'Munt', 1, 4, 200, 80, 2, NULL, 1),
                   (3, 'Weg', 1, 4, 10, 10, NULL, NULL, 0),
                   (8, 'Not ours', 2, 9, 1, 1, NULL, NULL, 1);
        INSERT INTO care_schedules (id, plant_id, care_type, next_due, is_active, interval_days)
            VALUES (1, 1, 'water', '{(today - timedelta(days=2)).isoformat()}', 1, 7),
                   (2, 2, 'water', '{today.isoformat()}', 1, 7),
                   (3, 1, 'fertilize', '{(today + timedelta(days=3)).isoformat()}', 1, 30),
                   (4, 1, 'prune', '{(today + timedelta(days=30)).isoformat()}', 1, 90),
                   (5, 3, 'water', '{today.isoformat()}', 1, 7),
                   (6, 8, 'water', '{today.isoformat()}', 1, 7);
        INSERT INTO care_log (plant_id, care_type, done_by, done_at)
            VALUES (1, 'water', 10, '2026-10-30T08:00:00'),
                   (8, 'water', NULL, '2026-10-31T08:00:00');
        INSERT INTO plant_photos (plant_id, household_id, r2_key, url, taken_at)
            VALUES (1, 1, 'k1', 'https://img.example/p1.jpg', '2026-10-29T10:00:00'),
                   (8, 2, 'k2', 'https://img.example/theirs.jpg', '2026-10-31T10:00:00');
        """
    )
    await db.commit()
    return db


async def _make_token(client, auth_header, name="LAveren", scope="read"):
    response = await client.post(
        "/api/integrations/tokens", headers=auth_header, json={"name": name, "scope": scope},
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_token_lifecycle_stores_only_hash(client, household, auth_header):
    created = await _make_token(client, auth_header)
    raw = created["token"]
    assert raw.startswith("flo_")
    assert created["token_hint"] == raw[-4:]
    assert created["snapshot_url"].endswith("/integrations/snapshot")

    row = (await household.execute_fetchall(
        "SELECT token_hash, scope FROM integration_tokens WHERE id = ?", (created["id"],),
    ))[0]
    assert row["token_hash"] == sha256(raw.encode()).hexdigest()
    assert row["scope"] == "read"

    listed = await client.get("/api/integrations/tokens", headers=auth_header)
    assert listed.status_code == 200
    assert [t["name"] for t in listed.json()] == ["LAveren"]
    assert raw not in listed.text

    revoked = await client.delete(
        f"/api/integrations/tokens/{created['id']}", headers=auth_header,
    )
    assert revoked.status_code == 204
    assert (await client.get("/api/integrations/tokens", headers=auth_header)).json() == []
    snapshot = await client.get(
        "/api/integrations/snapshot", headers={"Authorization": f"Bearer {raw}"},
    )
    assert snapshot.status_code == 401
    assert snapshot.json()["detail"] == {"code": "integration_token_invalid"}


@pytest.mark.asyncio
async def test_token_limit(client, household, auth_header):
    for i in range(5):
        await _make_token(client, auth_header, name=f"t{i}")
    response = await client.post(
        "/api/integrations/tokens", headers=auth_header, json={"name": "one too many"},
    )
    assert response.status_code == 409
    assert response.json()["detail"] == {"code": "integration_token_limit"}


@pytest.mark.asyncio
async def test_cannot_revoke_another_accounts_token(client, household, auth_header):
    from auth import create_token

    created = await _make_token(client, auth_header)
    other = {"Authorization": f"Bearer {create_token(account_id=2, household_id=2)}"}
    response = await client.delete(f"/api/integrations/tokens/{created['id']}", headers=other)
    assert response.status_code == 404
    snapshot = await client.get(
        "/api/integrations/snapshot",
        headers={"Authorization": f"Bearer {created['token']}"},
    )
    assert snapshot.status_code == 200


@pytest.mark.asyncio
async def test_integration_token_is_not_a_login_token(client, household, auth_header):
    raw = (await _make_token(client, auth_header))["token"]
    response = await client.get("/api/plants", headers={"Authorization": f"Bearer {raw}"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_token_is_not_an_integration_token(client, household, auth_header):
    response = await client.get("/api/integrations/snapshot", headers=auth_header)
    assert response.status_code == 401
    assert (await client.get("/api/integrations/snapshot")).status_code == 401


@pytest.mark.asyncio
async def test_password_change_retires_tokens(client, household, auth_header):
    raw = (await _make_token(client, auth_header))["token"]
    await household.execute("UPDATE accounts SET session_version = 1 WHERE id = 1")
    await household.commit()
    response = await client.get(
        "/api/integrations/snapshot", headers={"Authorization": f"Bearer {raw}"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_snapshot_contents_are_scoped_to_household(client, household, auth_header):
    raw = (await _make_token(client, auth_header))["token"]
    response = await client.get(
        "/api/integrations/snapshot?lang=en",
        headers={"Authorization": f"Bearer {raw}"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    today = local_today()

    assert body["schema_version"] == 1
    assert body["language"] == "en"
    assert body["today"] == today.isoformat()
    assert body["household"] == {"name": "Test Household"}
    assert body["counts"] == {
        "plants": 2, "species": 2, "maps": 2, "photos": 1,
        "care_overdue": 1, "care_due_today": 1, "care_upcoming": 1,
    }

    overdue = body["care"]["overdue"][0]
    assert overdue["plant_name"] == "Vijg"
    assert overdue["days_overdue"] == 2
    assert overdue["label"] == "Water" and overdue["icon"] == "💧"
    assert overdue["photo_url"] == "https://img.example/fig.jpg"
    assert overdue["url"] == "https://floreren.app/plants/1"
    assert [c["plant_name"] for c in body["care"]["due_today"]] == ["Munt"]
    assert [c["care_type"] for c in body["care"]["upcoming"]] == ["fertilize"]

    plants = {p["name"]: p for p in body["plants"]}
    assert set(plants) == {"Vijg", "Munt"}
    assert plants["Vijg"]["common_name"] == "Fig"
    # Missing English name stays null; never filled in from Dutch.
    assert plants["Munt"]["common_name"] is None
    assert plants["Munt"]["latin_name"] == "Mentha"
    assert plants["Vijg"]["next_care"]["care_type"] == "water"

    tuin, kamer = body["maps"]
    assert {k: tuin[k] for k in ("id", "name", "type", "plant_count", "url", "thumbnail_url")} == {
        "id": 4, "name": "Tuin", "type": "outdoor", "plant_count": 2,
        "url": "https://floreren.app/map/tuin",
        "thumbnail_url": "https://api.floreren.app/api/integrations/maps/4/thumbnail.svg",
    }
    assert tuin["biodiversity"]["score"] == 62
    assert tuin["biodiversity"]["pollinator_months"] == 7
    # Indoor maps get no biodiversity score.
    assert kamer["type"] == "indoor" and kamer["biodiversity"] is None

    weather = body["weather"]
    assert weather["current"]["temperature_c"] == 6.5
    assert weather["current"]["condition"] == "rain"
    assert [d["condition"] for d in weather["days"]] == ["rain", "cloudy", "clear", "snow"]
    assert weather["frost_risk"] is True  # -1.5 °C tomorrow
    assert weather["heat"] is False
    assert body["token"] == {"scope": "read", "can_log_care": False}
    assert [p["url"] for p in body["recent_photos"]] == ["https://img.example/p1.jpg"]
    assert [a["done_by"] for a in body["recent_activity"]] == ["Lisbeth"]
    assert body["recent_activity"][0]["done_at"] == "2026-10-30T08:00:00Z"


@pytest.mark.asyncio
async def test_snapshot_defaults_to_account_language(client, household, auth_header):
    raw = (await _make_token(client, auth_header))["token"]
    body = (await client.get(
        "/api/integrations/snapshot", headers={"Authorization": f"Bearer {raw}"},
    )).json()
    assert body["language"] == "nl"
    assert body["care"]["upcoming"][0]["label"] == "Mest"


@pytest.mark.asyncio
async def test_snapshot_cache_and_etag(client, household, auth_header, monkeypatch):
    raw = (await _make_token(client, auth_header))["token"]
    headers = {"Authorization": f"Bearer {raw}"}
    first = await client.get("/api/integrations/snapshot", headers=headers)
    etag = first.headers["etag"]

    calls = 0
    original = integration_snapshot.build_snapshot

    async def counting(*args, **kwargs):
        nonlocal calls
        calls += 1
        return await original(*args, **kwargs)

    monkeypatch.setattr(integration_snapshot, "build_snapshot", counting)
    second = await client.get("/api/integrations/snapshot", headers=headers)
    assert second.status_code == 200 and second.content == first.content
    not_modified = await client.get(
        "/api/integrations/snapshot", headers={**headers, "If-None-Match": etag},
    )
    assert not_modified.status_code == 304
    assert calls == 0  # both served from the in-process cache


@pytest.mark.asyncio
async def test_revoking_drops_cached_snapshot(client, household, auth_header):
    created = await _make_token(client, auth_header)
    headers = {"Authorization": f"Bearer {created['token']}"}
    assert (await client.get("/api/integrations/snapshot", headers=headers)).status_code == 200
    await client.delete(f"/api/integrations/tokens/{created['id']}", headers=auth_header)
    assert (await client.get("/api/integrations/snapshot", headers=headers)).status_code == 401


def test_cache_does_not_outlive_its_day():
    integration_snapshot.store(
        "h", "", b"{}", account_id=1, household_id=1, today=date(2026, 11, 1),
        generation=integration_snapshot.cache_generation(),
    )
    assert integration_snapshot.get_cached("h", "", today=date(2026, 11, 1)) is not None
    assert integration_snapshot.get_cached("h", "", today=date(2026, 11, 2)) is None


def test_iso_marks_naive_timestamps_as_utc():
    assert integration_snapshot._iso(datetime(2026, 1, 2, 3, 4, 5)) == "2026-01-02T03:04:05Z"
    assert integration_snapshot._iso(
        datetime(2026, 1, 2, 4, 4, 5, tzinfo=timezone(timedelta(hours=1)))
    ) == "2026-01-02T03:04:05Z"


@pytest.mark.asyncio
async def test_viewer_cannot_make_tokens(client, household, auth_header):
    await household.execute("UPDATE accounts SET role = 'viewer' WHERE id = 1")
    await household.commit()
    response = await client.post(
        "/api/integrations/tokens", headers=auth_header, json={"name": "x"},
    )
    assert response.status_code == 403



@pytest.mark.asyncio
async def test_snapshot_without_located_garden_has_no_weather(
    client, household, auth_header, _offline_weather_and_biodiversity,
):
    await household.execute("UPDATE maps SET lat = NULL, lon = NULL")
    await household.commit()
    raw = (await _make_token(client, auth_header))["token"]
    body = (await client.get(
        "/api/integrations/snapshot", headers={"Authorization": f"Bearer {raw}"},
    )).json()
    assert body["weather"] is None
    assert _offline_weather_and_biodiversity == []


@pytest.mark.asyncio
async def test_weather_outage_does_not_break_the_snapshot(client, household, auth_header, monkeypatch):
    async def down(*_args, **_kwargs):
        raise RuntimeError("open-meteo down")

    monkeypatch.setattr(integration_snapshot.weather_forecast, "get_map_forecast", down)
    raw = (await _make_token(client, auth_header))["token"]
    response = await client.get(
        "/api/integrations/snapshot", headers={"Authorization": f"Bearer {raw}"},
    )
    assert response.status_code == 200
    assert response.json()["weather"] is None


@pytest.mark.asyncio
async def test_map_thumbnail(client, household, auth_header):
    raw = (await _make_token(client, auth_header))["token"]
    headers = {"Authorization": f"Bearer {raw}"}
    response = await client.get("/api/integrations/maps/4/thumbnail.svg", headers=headers)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/svg+xml")
    svg = response.text
    assert svg.startswith("<svg") and 'viewBox="0 0 460 230"' in svg
    assert "#7A9E5A" in svg                     # the lawn
    assert "<script" not in svg                 # canvas junk never reaches markup
    assert 'fill="#C2410C"' in svg              # Vijg: overdue
    assert 'fill="#D97706"' in svg              # Munt: due today
    assert svg.count("<circle") == 2            # archived plant left out

    assert response.headers["etag"]
    again = await client.get(
        "/api/integrations/maps/4/thumbnail.svg",
        headers={**headers, "If-None-Match": response.headers["etag"]},
    )
    assert again.status_code == 304

    other = await client.get("/api/integrations/maps/9/thumbnail.svg", headers=headers)
    assert other.status_code == 404
    assert (await client.get("/api/integrations/maps/4/thumbnail.svg")).status_code == 401


@pytest.mark.asyncio
async def test_read_token_cannot_log_care(client, household, auth_header):
    raw = (await _make_token(client, auth_header))["token"]
    response = await client.post(
        "/api/integrations/care/done",
        headers={"Authorization": f"Bearer {raw}"},
        json={"schedule_id": 1},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == {"code": "integration_token_read_only"}
    assert await household.execute_fetchall("SELECT id FROM care_log WHERE plant_id = 1 AND done_by IS NULL") == []


@pytest.mark.asyncio
async def test_care_token_marks_done_and_refreshes_snapshot(client, household, auth_header):
    created = await _make_token(client, auth_header, scope="care")
    assert created["scope"] == "care"
    headers = {"Authorization": f"Bearer {created['token']}"}

    before = (await client.get("/api/integrations/snapshot", headers=headers)).json()
    assert before["token"] == {"scope": "care", "can_log_care": True}
    assert before["counts"]["care_overdue"] == 1

    response = await client.post(
        "/api/integrations/care/done", headers=headers, json={"schedule_id": 1, "notes": "via LAveren"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["ok"] is True and body["plant_id"] == 1 and body["care_type"] == "water"
    assert body["next_due"] == (local_today() + timedelta(days=7)).isoformat()

    log = await household.execute_fetchall(
        "SELECT done_by, notes FROM care_log WHERE id = ?", (body["care_log_id"],),
    )
    assert log[0]["done_by"] == 10 and log[0]["notes"] == "via LAveren"   # attributed to the account

    after = (await client.get("/api/integrations/snapshot", headers=headers)).json()
    assert after["counts"]["care_overdue"] == 0   # cache was dropped, not served stale


@pytest.mark.asyncio
async def test_care_token_is_scoped_to_its_household(client, household, auth_header):
    raw = (await _make_token(client, auth_header, scope="care"))["token"]
    response = await client.post(
        "/api/integrations/care/done",
        headers={"Authorization": f"Bearer {raw}"},
        json={"schedule_id": 6},   # another household's schedule
    )
    assert response.status_code == 404
    assert response.json()["detail"] == {"code": "care_schedule_not_found"}


@pytest.mark.asyncio
async def test_care_token_stops_writing_when_account_becomes_viewer(client, household, auth_header):
    raw = (await _make_token(client, auth_header, scope="care"))["token"]
    await household.execute("UPDATE accounts SET role = 'viewer' WHERE id = 1")
    await household.commit()
    response = await client.post(
        "/api/integrations/care/done",
        headers={"Authorization": f"Bearer {raw}"},
        json={"schedule_id": 1},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == {"code": "integration_account_read_only"}


@pytest.mark.asyncio
async def test_unknown_scope_is_rejected(client, household, auth_header):
    response = await client.post(
        "/api/integrations/tokens", headers=auth_header, json={"name": "x", "scope": "admin"},
    )
    assert response.status_code == 422
