"""Viewer write protection for the #922 map and shared-reference route inventory."""

from collections.abc import Iterable

import pytest
import pytest_asyncio
from fastapi.routing import APIRoute

from auth import create_token, require_editor
from main import app
import routers.locations as locations_router
import routers.maps as maps_router
import routers.objects as objects_router
import routers.weed_sightings as weed_sightings_router


WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
ISSUE_ROUTERS = (
    maps_router.router,
    objects_router.router,
    locations_router.router,
    weed_sightings_router.router,
)
PROTECTED_WRITE_ROUTES = {
    ("PUT", "/api/maps/{slug}/circularity"),
    ("PUT", "/api/maps/{slug}/features"),
    ("POST", "/api/maps/{slug}/dismiss-recommendation"),
    ("DELETE", "/api/maps/{slug}/dismiss-recommendation/{species_id}"),
    ("POST", "/api/maps"),
    ("PUT", "/api/maps/{map_id}"),
    ("POST", "/api/maps/{map_id}/underlay"),
    ("DELETE", "/api/maps/{map_id}"),
    ("POST", "/api/objects"),
    ("PUT", "/api/objects/{object_id}"),
    ("PUT", "/api/objects/{object_id}/position"),
    ("DELETE", "/api/objects/{object_id}"),
    ("PATCH", "/api/objects/{object_id}/restore"),
    ("POST", "/api/locations"),
    ("PATCH", "/api/locations/{location_id}"),
    ("DELETE", "/api/locations/{location_id}"),
    ("POST", "/api/weed-sightings"),
    ("DELETE", "/api/weed-sightings/{sighting_id}"),
}


EXTRA_SCHEMA = """
CREATE TABLE objects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    object_type TEXT NOT NULL,
    shape TEXT NOT NULL,
    diameter_cm INTEGER,
    width_cm INTEGER,
    depth_cm INTEGER,
    material TEXT,
    color TEXT,
    map_id INTEGER,
    map_x REAL,
    map_y REAL,
    rotation REAL DEFAULT 0,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    category TEXT DEFAULT 'container',
    label TEXT,
    preset TEXT
);
CREATE TABLE weed_species (
    id INTEGER PRIMARY KEY,
    common_name_nl TEXT,
    slug TEXT,
    latin_name TEXT,
    removal_json TEXT
);
CREATE TABLE weed_sightings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    weed_id INTEGER NOT NULL,
    map_id INTEGER NOT NULL,
    map_x REAL NOT NULL,
    map_y REAL NOT NULL,
    notes TEXT,
    sighted_at TEXT NOT NULL,
    photo_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
"""


class FakeStorage:
    def __init__(self):
        self.puts = []
        self.deletes = []

    def put(self, key, data, content_type):
        self.puts.append((key, data, content_type))
        return f"https://cdn.test/{key}"

    def delete(self, key):
        self.deletes.append(key)


def _scoped_write_routes() -> dict[tuple[str, str], APIRoute]:
    routes = {}
    for router in ISSUE_ROUTERS:
        for route in router.routes:
            if not isinstance(route, APIRoute):
                continue
            for method in route.methods & WRITE_METHODS:
                key = (method, f"/api{route.path}")
                assert key not in routes, f"Duplicate scoped route: {key}"
                routes[key] = route
    return routes


def _mounted_api_write_routes() -> dict[tuple[str, str], list[object]]:
    routes = {}
    for app_route in app.routes:
        # FastAPI 0.141+ keeps included routers lazy. Older supported versions
        # expose their mounted APIRoute objects directly in app.routes.
        effective_route_contexts = getattr(app_route, "effective_route_contexts", None)
        if callable(effective_route_contexts):
            mounted_routes = effective_route_contexts()
        elif isinstance(app_route, APIRoute):
            mounted_routes = (app_route,)
        else:
            continue

        for mounted_route in mounted_routes:
            original_route = getattr(mounted_route, "original_route", mounted_route)
            if not isinstance(original_route, APIRoute):
                continue

            path = getattr(mounted_route, "path", original_route.path)
            methods = getattr(mounted_route, "methods", original_route.methods)
            if path != "/api" and not path.startswith("/api/"):
                continue
            for method in methods & WRITE_METHODS:
                routes.setdefault((method, path), []).append(mounted_route)
    return routes


def _issue_write_routes(scoped_routes: dict[tuple[str, str], APIRoute]) -> dict[tuple[str, str], object]:
    mounted_api_routes = _mounted_api_write_routes()
    mounted_routes = {}
    for key, scoped_route in scoped_routes.items():
        matches = mounted_api_routes.get(key, [])
        assert len(matches) == 1, f"Expected one mounted route for {key}, found {len(matches)}"
        mounted_route = matches[0]
        original_route = getattr(mounted_route, "original_route", None)
        if original_route is None:
            assert mounted_route.endpoint is scoped_route.endpoint, f"Mounted route changed for {key}"
        else:
            assert original_route is scoped_route, f"Mounted route changed for {key}"
        mounted_routes[key] = mounted_route
    return mounted_routes


def _has_editor_guard(route: APIRoute) -> bool:
    return any(dependency.call is require_editor for dependency in route.dependant.dependencies)


def _header() -> dict[str, str]:
    token = create_token(account_id=1, household_id=1)
    return {"Authorization": f"Bearer {token}"}


async def _set_role(db, role: str) -> None:
    await db.execute("UPDATE accounts SET role = ? WHERE id = 1", (role,))
    await db.commit()


async def _fetch_one(db, query: str, params: Iterable = ()) -> dict:
    rows = await db.execute_fetchall(query, tuple(params))
    return dict(rows[0])


@pytest_asyncio.fixture
async def map_reference_db(seeded_db, monkeypatch):
    db = seeded_db
    for column in (
        "slug TEXT",
        "svg_file TEXT",
        "viewbox TEXT",
        "scale_info TEXT",
        "sort_order INTEGER DEFAULT 0",
        "canvas_data TEXT",
        "lat REAL",
        "lon REAL",
        "bearing REAL DEFAULT 0",
        "thumbnail_file TEXT",
        "streek_slug TEXT",
        "streek_source TEXT DEFAULT 'auto'",
        "is_public BOOLEAN DEFAULT FALSE",
        "photos_public BOOLEAN DEFAULT FALSE",
        "place_name TEXT",
        "country_code TEXT",
    ):
        await db.execute(f"ALTER TABLE maps ADD COLUMN {column}")
    await db.executescript(EXTRA_SCHEMA)
    await db.executescript("""
        INSERT INTO maps (
            id, name, map_type, household_id, slug, svg_file, viewbox,
            scale_info, sort_order, canvas_data, bearing, streek_source,
            is_public, photos_public
        ) VALUES
            (1, 'Garden', 'outdoor', 1, 'garden', 'https://cdn.test/maps/garden.svg',
             '0 0 680 680', '{"px_per_meter": 46}', 1, '{}', 0, 'auto', FALSE, FALSE),
            (2, 'Neighbour garden', 'outdoor', 2, 'neighbour-garden',
             'https://cdn.test/maps/neighbour.svg', '0 0 680 680',
             '{"px_per_meter": 46}', 2, '{}', 0, 'auto', FALSE, FALSE);
        INSERT INTO objects (id, name, object_type, shape, map_id, map_x, map_y)
        VALUES
            (1, 'Original pot', 'pot', 'round', 1, 10, 20),
            (2, 'Neighbour pot', 'pot', 'round', 2, 30, 40);
        INSERT INTO locations (id, name, icon, sort_order, household_id)
        VALUES (1, 'Original location', 'house', 0, 1);
        INSERT INTO weed_species (id, common_name_nl, slug, latin_name, removal_json)
        VALUES (1, 'Brandnetel', 'brandnetel', 'Urtica dioica', '{}');
        INSERT INTO weed_sightings (id, weed_id, map_id, map_x, map_y, notes, sighted_at)
        VALUES (1, 1, 1, 11, 22, 'Original sighting', '2026-08-16');
    """)
    await db.commit()

    storage = FakeStorage()
    monkeypatch.setattr(maps_router, "build_storage_from_env", lambda: storage)
    monkeypatch.setattr(weed_sightings_router, "_get_storage", lambda: storage)
    return db, storage


def test_issue_922_write_inventory_is_complete_and_every_route_requires_an_editor():
    scoped_routes = _scoped_write_routes()
    routes = _issue_write_routes(scoped_routes)

    assert set(scoped_routes) == PROTECTED_WRITE_ROUTES
    assert set(routes) == PROTECTED_WRITE_ROUTES
    unguarded_scoped_routes = sorted(
        route_key for route_key, route in scoped_routes.items() if not _has_editor_guard(route)
    )
    unguarded_mounted_routes = sorted(
        route_key for route_key, route in routes.items() if not _has_editor_guard(route)
    )
    assert unguarded_scoped_routes == []
    assert unguarded_mounted_routes == []


@pytest.mark.asyncio
async def test_viewer_mutations_are_rejected_before_map_storage_or_records_change(
    client, map_reference_db,
):
    db, storage = map_reference_db
    await _set_role(db, "viewer")
    before_object = await _fetch_one(db, "SELECT name FROM objects WHERE id = 1")
    before_location = await _fetch_one(db, "SELECT name FROM locations WHERE id = 1")
    before_sightings = await _fetch_one(db, "SELECT COUNT(*) AS count FROM weed_sightings")

    underlay = await client.post(
        "/api/maps/1/underlay",
        files={"file": ("blocked.png", b"png", "image/png")},
        headers=_header(),
    )
    object_update = await client.put(
        "/api/objects/1", json={"name": "Blocked pot"}, headers=_header(),
    )
    location_update = await client.patch(
        "/api/locations/1", json={"name": "Blocked location"}, headers=_header(),
    )
    sighting_create = await client.post(
        "/api/weed-sightings",
        json={"weed_id": 1, "map_id": 1, "map_x": 1, "map_y": 2, "sighted_at": "2026-08-16"},
        headers=_header(),
    )

    assert [
        underlay.status_code,
        object_update.status_code,
        location_update.status_code,
        sighting_create.status_code,
    ] == [403, 403, 403, 403]
    assert storage.puts == []
    assert await _fetch_one(db, "SELECT name FROM objects WHERE id = 1") == before_object
    assert await _fetch_one(db, "SELECT name FROM locations WHERE id = 1") == before_location
    assert await _fetch_one(db, "SELECT COUNT(*) AS count FROM weed_sightings") == before_sightings


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["owner", "editor"])
async def test_owner_and_editor_can_still_update_a_map_and_create_an_object(
    client, map_reference_db, role,
):
    db, _ = map_reference_db
    await _set_role(db, role)

    map_update = await client.put(
        "/api/maps/1", json={"name": f"{role.title()} garden"}, headers=_header(),
    )
    object_create = await client.post(
        "/api/objects",
        json={"name": f"{role.title()} pot", "object_type": "pot", "shape": "round", "map_id": 1},
        headers=_header(),
    )

    assert map_update.status_code == 200, map_update.text
    assert object_create.status_code == 200, object_create.text
    assert (await _fetch_one(db, "SELECT name FROM maps WHERE id = 1"))["name"] == f"{role.title()} garden"
    assert (await _fetch_one(db, "SELECT name FROM objects WHERE id = ?", (object_create.json()["id"],)))["name"] == f"{role.title()} pot"


@pytest.mark.asyncio
async def test_owner_can_manage_shared_locations_and_sightings(client, map_reference_db):
    db, _ = map_reference_db

    location_create = await client.post(
        "/api/locations", json={"name": "Owner location", "icon": "leaf"}, headers=_header(),
    )
    sighting_create = await client.post(
        "/api/weed-sightings",
        json={"weed_id": 1, "map_id": 1, "map_x": 1, "map_y": 2, "sighted_at": "2026-08-16"},
        headers=_header(),
    )
    sighting_delete = await client.delete(
        f"/api/weed-sightings/{sighting_create.json()['id']}", headers=_header(),
    )

    assert location_create.status_code == 200, location_create.text
    assert sighting_create.status_code == 201, sighting_create.text
    assert sighting_delete.status_code == 204, sighting_delete.text
    assert (await _fetch_one(db, "SELECT name FROM locations WHERE id = ?", (location_create.json()["id"],)))["name"] == "Owner location"
    assert await db.execute_fetchall(
        "SELECT id FROM weed_sightings WHERE id = ?", (sighting_create.json()["id"],)
    ) == []


@pytest.mark.asyncio
async def test_editor_cannot_mutate_another_households_object(client, map_reference_db):
    db, _ = map_reference_db
    await _set_role(db, "editor")
    before = await _fetch_one(db, "SELECT name FROM objects WHERE id = 2")

    response = await client.put(
        "/api/objects/2", json={"name": "Blocked neighbour pot"}, headers=_header(),
    )

    assert response.status_code == 404
    assert await _fetch_one(db, "SELECT name FROM objects WHERE id = 2") == before


@pytest.mark.asyncio
async def test_viewer_read_routes_remain_available(client, map_reference_db):
    db, _ = map_reference_db
    await _set_role(db, "viewer")

    maps = await client.get("/api/maps", headers=_header())
    objects = await client.get("/api/objects", headers=_header())
    locations = await client.get("/api/locations", headers=_header())
    sightings = await client.get("/api/weed-sightings", headers=_header())

    assert [maps.status_code, objects.status_code, locations.status_code, sightings.status_code] == [200, 200, 200, 200]
    assert maps.json()[0]["name"] == "Garden"
    assert objects.json()[0]["name"] == "Original pot"
    assert locations.json()[0]["name"] == "Original location"
    assert sightings.json()[0]["id"] == 1
