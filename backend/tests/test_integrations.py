"""Integration tokens + the read-only household snapshot (LAveren)."""
from datetime import date, datetime, timedelta, timezone
from hashlib import sha256

import pytest
import pytest_asyncio

from services import integration_snapshot
from services.local_time import local_today


EXTRA_SCHEMA = """
    ALTER TABLE maps ADD COLUMN slug TEXT;
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
        INSERT INTO maps (id, name, map_type, household_id, slug)
            VALUES (4, 'Tuin', 'outdoor', 1, 'tuin'), (9, 'Elsewhere', 'outdoor', 2, 'x');
        INSERT INTO plant_species (id, latin_name, common_name_nl, common_name_en)
            VALUES (1, 'Ficus carica', 'Vijg', 'Fig'), (2, 'Mentha', 'Munt', NULL);
        INSERT INTO plants (id, name, household_id, map_id, species_id, photo_path, is_active)
            VALUES (1, 'Vijg', 1, 4, 1, 'https://img.example/fig.jpg', 1),
                   (2, 'Munt', 1, 4, 2, NULL, 1),
                   (3, 'Weg', 1, 4, NULL, NULL, 0),
                   (8, 'Not ours', 2, 9, NULL, NULL, 1);
        INSERT INTO care_schedules (id, plant_id, care_type, next_due, is_active)
            VALUES (1, 1, 'water', '{(today - timedelta(days=2)).isoformat()}', 1),
                   (2, 2, 'water', '{today.isoformat()}', 1),
                   (3, 1, 'fertilize', '{(today + timedelta(days=3)).isoformat()}', 1),
                   (4, 1, 'prune', '{(today + timedelta(days=30)).isoformat()}', 1),
                   (5, 3, 'water', '{today.isoformat()}', 1),
                   (6, 8, 'water', '{today.isoformat()}', 1);
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


async def _make_token(client, auth_header, name="LAveren"):
    response = await client.post(
        "/api/integrations/tokens", headers=auth_header, json={"name": name},
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
        "plants": 2, "species": 2, "maps": 1, "photos": 1,
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

    assert body["maps"] == [{
        "id": 4, "name": "Tuin", "type": "outdoor", "plant_count": 2,
        "url": "https://floreren.app/map/tuin",
    }]
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
        "h", "", b"{}", account_id=1, today=date(2026, 11, 1),
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
