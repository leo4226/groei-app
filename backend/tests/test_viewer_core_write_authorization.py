"""Viewer write protection for the #921 plants and care route inventory."""

from collections.abc import Iterable

import pytest
import pytest_asyncio
from fastapi.routing import APIRoute

from auth import create_token, require_editor
from main import app
import routers.plant_photos as plant_photos_router
import routers.plants as plants_router


WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
ISSUE_ROUTE_MODULES = {
    "routers.plants",
    "routers.plant_photos",
    "routers.care",
    "routers.plant_care",
}
PROTECTED_WRITE_ROUTES = {
    ("POST", "/api/plants"),
    ("POST", "/api/plants/{plant_id}/retry-species"),
    ("PUT", "/api/plants/{plant_id}"),
    ("PUT", "/api/plants/{plant_id}/care-schedules"),
    ("POST", "/api/plants/{plant_id}/placements"),
    ("PATCH", "/api/plants/{plant_id}/placements/{placement_id}"),
    ("DELETE", "/api/plants/{plant_id}/placements/{placement_id}"),
    ("PUT", "/api/plants/{plant_id}/position"),
    ("PUT", "/api/plants/{plant_id}/container"),
    ("PUT", "/api/plants/{plant_id}/ground-zone"),
    ("POST", "/api/plants/{plant_id}/duplicate"),
    ("PATCH", "/api/plants/{plant_id}/lock"),
    ("POST", "/api/plants/bulk-archive"),
    ("DELETE", "/api/plants/bulk-archive"),
    ("DELETE", "/api/plants/{plant_id}"),
    ("PATCH", "/api/plants/{plant_id}/restore"),
    ("POST", "/api/plants/{plant_id}/photo"),
    ("POST", "/api/plants/{plant_id}/photos"),
    ("PUT", "/api/plants/{plant_id}/photo-reminder"),
    ("PATCH", "/api/photos/{photo_id}"),
    ("DELETE", "/api/photos/{photo_id}"),
    ("POST", "/api/care/maps/{map_id}/watering-round/complete"),
    ("POST", "/api/care/done"),
    ("POST", "/api/care/skip"),
    ("POST", "/api/care/garden/complete"),
    ("POST", "/api/care/moisture-checks/resolve"),
    ("POST", "/api/care/garden/{operation_id}/undo"),
    ("DELETE", "/api/care/schedules/{schedule_id}"),
    ("POST", "/api/care/undo"),
    ("PATCH", "/api/care/schedules/{schedule_id}"),
    ("POST", "/api/garden/grow-here"),
    ("POST", "/api/garden/water-log"),
    ("DELETE", "/api/garden/water-log/latest"),
    ("POST", "/api/garden/fertilize-log"),
    ("DELETE", "/api/garden/fertilize-log/latest"),
}


EXTRA_SCHEMA = """
CREATE TABLE plant_species (
    id INTEGER PRIMARY KEY,
    care_thresholds TEXT,
    phenology_json TEXT,
    common_name_nl TEXT,
    common_name_en TEXT
);
CREATE TABLE care_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plant_id INTEGER,
    care_type TEXT,
    done_by INTEGER,
    done_at TEXT,
    notes TEXT,
    skipped BOOLEAN DEFAULT FALSE
);
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
"""


class FakeStorage:
    def __init__(self):
        self.puts = []

    def put(self, key, data, content_type):
        self.puts.append((key, data, content_type))
        return f"https://cdn.test/{key}"

    def delete(self, key):
        return None


def _issue_write_routes() -> dict[tuple[str, str], APIRoute]:
    routes = {}
    # FastAPI flattens included routers into app.routes. Inspecting this table
    # verifies the live /api mount instead of router metadata that is discarded.
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        if route.path != "/api" and not route.path.startswith("/api/"):
            continue
        if route.endpoint.__module__ not in ISSUE_ROUTE_MODULES:
            continue
        for method in route.methods & WRITE_METHODS:
            routes[(method, route.path)] = route
    return routes


def _has_editor_guard(route: APIRoute) -> bool:
    return any(dependency.call is require_editor for dependency in route.dependant.dependencies)


def _viewer_header() -> dict[str, str]:
    token = create_token(account_id=1, household_id=1)
    return {"Authorization": f"Bearer {token}"}


async def _set_role(db, role: str) -> None:
    await db.execute("UPDATE accounts SET role = ? WHERE id = 1", (role,))
    await db.commit()


async def _fetch_one(db, query: str, params: Iterable = ()) -> dict:
    rows = await db.execute_fetchall(query, tuple(params))
    return dict(rows[0])


@pytest_asyncio.fixture
async def core_write_db(seeded_db, monkeypatch):
    db = seeded_db
    await db.executescript(EXTRA_SCHEMA)
    await db.executescript("""
        INSERT INTO plant_species
          (id, care_thresholds, phenology_json, common_name_nl, common_name_en)
        VALUES (1, '{"water_interval_days": 7}', '{}', 'Test plant', 'Test plant');
        INSERT INTO plants (id, name, household_id, species_id, is_active)
        VALUES (1, 'Original plant', 1, 1, TRUE);
        INSERT INTO users (id, name, household_id) VALUES (1, 'Test', 1);
        INSERT INTO care_schedules
          (id, plant_id, care_type, interval_days, next_due, is_active)
        VALUES (1, 1, 'water', 7, '2026-08-01', TRUE);
        INSERT INTO plant_photos
          (id, plant_id, household_id, r2_key, url, note)
        VALUES (1, 1, 1, 'photos/1/1/original.jpg',
                'https://cdn.test/photos/1/1/original.jpg', 'original note');
    """)
    await db.commit()

    storage = FakeStorage()
    monkeypatch.setattr(plant_photos_router, "build_storage_from_env", lambda: storage)

    async def no_photo_check(*args, **kwargs):
        return None

    async def existing_species(*args, **kwargs):
        return 1

    monkeypatch.setattr(plant_photos_router, "_run_photo_check", no_photo_check)
    monkeypatch.setattr(plants_router, "get_or_create_species", existing_species)
    return db, storage


def test_issue_921_write_inventory_is_complete_and_every_route_requires_an_editor():
    routes = _issue_write_routes()

    assert set(routes) == PROTECTED_WRITE_ROUTES
    unguarded = sorted(route_key for route_key, route in routes.items() if not _has_editor_guard(route))
    assert unguarded == []


@pytest.mark.asyncio
async def test_viewer_create_is_rejected_before_a_plant_can_be_written(client, core_write_db):
    db, _ = core_write_db
    await _set_role(db, "viewer")
    before = await _fetch_one(db, "SELECT COUNT(*) AS count FROM plants")

    response = await client.post(
        "/api/plants",
        json={"name": "Blocked plant", "icon_key": "test-plant"},
        headers=_viewer_header(),
    )

    after = await _fetch_one(db, "SELECT COUNT(*) AS count FROM plants")
    assert response.status_code == 403
    assert after == before


@pytest.mark.asyncio
async def test_viewer_update_archive_and_care_completion_leave_existing_records_unchanged(
    client, core_write_db,
):
    db, _ = core_write_db
    await _set_role(db, "viewer")
    before_plant = await _fetch_one(
        db, "SELECT name, is_active FROM plants WHERE id = 1",
    )
    before_schedule = await _fetch_one(
        db, "SELECT next_due, last_done, last_done_by FROM care_schedules WHERE id = 1",
    )

    update = await client.put(
        "/api/plants/1", json={"name": "Blocked update"}, headers=_viewer_header(),
    )
    archive = await client.delete("/api/plants/1", headers=_viewer_header())
    care = await client.post(
        "/api/care/done",
        json={"plant_id": 1, "care_type": "water", "user_id": 1},
        headers=_viewer_header(),
    )

    assert [update.status_code, archive.status_code, care.status_code] == [403, 403, 403]
    assert await _fetch_one(db, "SELECT name, is_active FROM plants WHERE id = 1") == before_plant
    assert (
        await _fetch_one(
            db, "SELECT next_due, last_done, last_done_by FROM care_schedules WHERE id = 1",
        )
        == before_schedule
    )
    assert await db.execute_fetchall("SELECT id FROM care_log") == []


@pytest.mark.asyncio
async def test_viewer_photo_upload_and_metadata_update_are_rejected_before_storage_or_db_changes(
    client, core_write_db,
):
    db, storage = core_write_db
    await _set_role(db, "viewer")
    before_photo = await _fetch_one(db, "SELECT note FROM plant_photos WHERE id = 1")

    upload = await client.post(
        "/api/plants/1/photos",
        files={"file": ("blocked.jpg", b"jpeg", "image/jpeg")},
        headers=_viewer_header(),
    )
    metadata = await client.patch(
        "/api/photos/1", json={"note": "blocked note"}, headers=_viewer_header(),
    )

    assert [upload.status_code, metadata.status_code] == [403, 403]
    assert storage.puts == []
    assert await _fetch_one(db, "SELECT note FROM plant_photos WHERE id = 1") == before_photo
    assert (await _fetch_one(db, "SELECT COUNT(*) AS count FROM plant_photos"))["count"] == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["owner", "editor"])
async def test_owner_and_editor_can_still_update_a_plant_and_complete_care(
    client, core_write_db, role,
):
    db, _ = core_write_db
    await _set_role(db, role)
    header = _viewer_header()

    update = await client.patch("/api/plants/1/lock?locked=true", headers=header)
    care = await client.post(
        "/api/care/done",
        json={"plant_id": 1, "care_type": "water", "user_id": 1},
        headers=header,
    )

    assert update.status_code == 200
    assert care.status_code == 200
    assert (await _fetch_one(db, "SELECT is_locked FROM plants WHERE id = 1"))["is_locked"] == 1
    assert (await _fetch_one(db, "SELECT COUNT(*) AS count FROM care_log"))["count"] == 1


@pytest.mark.asyncio
async def test_viewer_read_routes_remain_available(client, core_write_db):
    db, _ = core_write_db
    await _set_role(db, "viewer")

    plant = await client.get("/api/plants/1", headers=_viewer_header())
    care_log = await client.get("/api/care/log", headers=_viewer_header())

    assert plant.status_code == 200
    assert plant.json()["name"] == "Original plant"
    assert care_log.status_code == 200
