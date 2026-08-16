"""Viewer write protection for the #923 household, account, and planning routes."""
import asyncio
from collections.abc import Iterable
from datetime import date

import pytest
import pytest_asyncio
from fastapi.routing import APIRoute

from auth import create_token, get_current_account, hash_password, require_editor
from main import app
import routers.auth as auth_router
import routers.calendar_subscription as calendar_subscription_router
import routers.care_rhythm as care_rhythm_router
import routers.discoveries as discoveries_router
import routers.household as household_router
import routers.notifications as notifications_router
import routers.users as users_router
import routers.warnings as warnings_router
from services.warnings import canonical_weather_warning_id_for_fields


WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
ISSUE_ROUTERS = (
    auth_router.router,
    household_router.router,
    users_router.router,
    notifications_router.router,
    calendar_subscription_router.router,
    care_rhythm_router.router,
    warnings_router.router,
    discoveries_router.router,
)
PROTECTED_WRITE_ROUTES = {
    ("POST", "/api/auth/change-password"),
    ("POST", "/api/household/invite"),
    ("PUT", "/api/household/calendar-grouping"),
    ("PATCH", "/api/household/members/{member_id}"),
    ("DELETE", "/api/household/members/{user_id}"),
    ("PATCH", "/api/household"),
    ("PATCH", "/api/users/{user_id}/language"),
    ("PATCH", "/api/users/{user_id}"),
    ("PUT", "/api/settings/notifications"),
    ("POST", "/api/push/subscription"),
    ("DELETE", "/api/push/subscription"),
    ("POST", "/api/push/test"),
    ("PATCH", "/api/calendar/subscription"),
    ("POST", "/api/calendar/subscription"),
    ("DELETE", "/api/calendar/subscription"),
    ("POST", "/api/care-rhythm/apply"),
    ("POST", "/api/care-rhythm/{operation_id}/undo"),
    ("POST", "/api/weather-warnings/{warning_id}/acknowledgment"),
    ("DELETE", "/api/weather-warnings/{warning_id}/acknowledgment"),
    ("PATCH", "/api/plants/{plant_id}/care-profile"),
    ("POST", "/api/discover"),
    ("PATCH", "/api/discover/{discovery_id}"),
    ("PATCH", "/api/discover/{discovery_id}/location"),
    ("POST", "/api/discover/{discovery_id}/share"),
    ("DELETE", "/api/discover/{discovery_id}"),
}

# These write-method routes have deliberately different authorization models or
# are read-only previews/snapshots. They are inventory entries, not omissions.
EXEMPT_WRITE_ROUTES = {
    ("POST", "/api/auth/register"),
    ("POST", "/api/auth/login"),
    ("POST", "/api/auth/forgot-password"),
    ("POST", "/api/auth/reset-password"),
    ("POST", "/api/household/join"),
    ("POST", "/api/internal/send-digests"),
    ("POST", "/api/notifications/snooze"),
    ("POST", "/api/calendar/export.ics"),
    ("POST", "/api/care-rhythm/preview"),
    ("POST", "/api/care-rhythm/onboarding-preview"),
}

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
    place_name TEXT,
    country_code TEXT,
    share_token TEXT,
    discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
"""


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


def _has_dependency(route: APIRoute, dependency) -> bool:
    return any(item.call is dependency for item in route.dependant.dependencies)


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
async def household_account_planning_db(seeded_db):
    db = seeded_db
    await db.executescript(DISCOVERIES_SCHEMA)
    await db.executescript("""
        INSERT INTO users (id, name, avatar, household_id, language, account_id)
        VALUES (1, 'Test', 'original-avatar', 1, 'nl', 1);
        INSERT INTO notification_preferences
          (account_id, digest_enabled, digest_time, push_enabled)
        VALUES (1, 0, '08:00', 0);
        INSERT INTO push_subscriptions (account_id, endpoint, p256dh, auth)
        VALUES (1, 'https://push.test/original', 'original-key', 'original-auth');
        INSERT INTO calendar_subscriptions
          (account_id, household_id, token_hash, config_json, revoked_at)
        VALUES (1, 1, 'original-token-hash', '{"environment":"all","map_ids":[],"care_types":[],"include_context":false,"privacy":true}', NULL);
        INSERT INTO plant_discoveries
          (id, account_id, household_id, common_name, notes, share_token)
        VALUES (1, 1, 1, 'Original discovery', 'original notes', NULL);
    """)
    await db.execute(
        "UPDATE accounts SET password_hash = ? WHERE id = 1",
        (hash_password("current-password"),),
    )
    await db.commit()
    return db


def test_issue_923_mounted_write_inventory_is_complete_and_protects_every_editor_route():
    scoped_routes = _scoped_write_routes()
    mounted_routes = _issue_write_routes(scoped_routes)

    expected_routes = PROTECTED_WRITE_ROUTES | EXEMPT_WRITE_ROUTES
    assert set(scoped_routes) == expected_routes
    assert set(mounted_routes) == expected_routes

    for route_key in PROTECTED_WRITE_ROUTES:
        assert _has_dependency(scoped_routes[route_key], require_editor), route_key
        assert _has_dependency(mounted_routes[route_key], require_editor), route_key


def test_issue_923_intentional_non_editor_routes_keep_their_existing_auth_models():
    scoped_routes = _scoped_write_routes()
    email_unsubscribe_route = next(
        route
        for route in notifications_router.router.routes
        if isinstance(route, APIRoute) and route.path == "/notifications/unsubscribe"
    )

    for route_key in EXEMPT_WRITE_ROUTES:
        assert not _has_dependency(scoped_routes[route_key], require_editor), route_key

    # Join uses an invite code. The digest and care-push snooze use their own
    # secret/capability credentials. The snapshot still requires a signed-in
    # account but does not persist configuration.
    assert not _has_dependency(scoped_routes[("POST", "/api/household/join")], get_current_account)
    assert not _has_dependency(scoped_routes[("POST", "/api/internal/send-digests")], get_current_account)
    assert not _has_dependency(scoped_routes[("POST", "/api/notifications/snooze")], get_current_account)
    assert _has_dependency(scoped_routes[("POST", "/api/calendar/export.ics")], get_current_account)
    assert not _has_dependency(email_unsubscribe_route, require_editor)
    assert not _has_dependency(email_unsubscribe_route, get_current_account)


@pytest.mark.asyncio
async def test_viewer_mutations_are_rejected_before_account_household_and_planning_state_changes(
    client, household_account_planning_db,
):
    db = household_account_planning_db
    await _set_role(db, "viewer")
    before = {
        "password": await _fetch_one(db, "SELECT password_hash FROM accounts WHERE id = 1"),
        "household": await _fetch_one(db, "SELECT name FROM households WHERE id = 1"),
        "user": await _fetch_one(db, "SELECT name, language FROM users WHERE id = 1"),
        "preferences": await _fetch_one(
            db, "SELECT digest_enabled, digest_time FROM notification_preferences WHERE account_id = 1",
        ),
        "push": await _fetch_one(db, "SELECT endpoint FROM push_subscriptions WHERE id = 1"),
        "subscription": await _fetch_one(
            db, "SELECT revoked_at FROM calendar_subscriptions WHERE account_id = 1",
        ),
        "discovery": await _fetch_one(
            db, "SELECT notes, share_token FROM plant_discoveries WHERE id = 1",
        ),
    }
    warning_id = canonical_weather_warning_id_for_fields(
        1, "heat_protect", date(2026, 7, 30), "warning",
    )

    responses = await asyncio.gather(
        client.post(
            "/api/auth/change-password",
            json={"current_password": "current-password", "new_password": "blocked-password"},
            headers=_header(),
        ),
        client.patch("/api/household", json={"name": "Blocked household"}, headers=_header()),
        client.patch("/api/users/1/language", json={"language": "en"}, headers=_header()),
        client.put(
            "/api/settings/notifications",
            json={"digest_enabled": True, "digest_time": "19:00"},
            headers=_header(),
        ),
        client.post(
            "/api/push/subscription",
            json={"endpoint": "https://push.test/blocked", "keys": {"p256dh": "key", "auth": "auth"}},
            headers=_header(),
        ),
        client.delete("/api/calendar/subscription", headers=_header()),
        client.post(
            "/api/care-rhythm/apply",
            json={
                "config": {"indoor_weekdays": [1], "outdoor_weekdays": [2], "map_overrides": []},
                "preview_hash": "blocked-preview",
            },
            headers=_header(),
        ),
        client.post(
            f"/api/weather-warnings/{warning_id}/acknowledgment",
            json={"care_type": "heat_protect", "forecast_date": "2026-07-30", "severity": "warning"},
            headers=_header(),
        ),
        client.post("/api/discover/1/share", headers=_header()),
    )

    assert [response.status_code for response in responses] == [403] * len(responses)
    assert await _fetch_one(db, "SELECT password_hash FROM accounts WHERE id = 1") == before["password"]
    assert await _fetch_one(db, "SELECT name FROM households WHERE id = 1") == before["household"]
    assert await _fetch_one(db, "SELECT name, language FROM users WHERE id = 1") == before["user"]
    assert (
        await _fetch_one(
            db, "SELECT digest_enabled, digest_time FROM notification_preferences WHERE account_id = 1",
        )
        == before["preferences"]
    )
    assert await _fetch_one(db, "SELECT endpoint FROM push_subscriptions WHERE id = 1") == before["push"]
    assert (
        await _fetch_one(db, "SELECT revoked_at FROM calendar_subscriptions WHERE account_id = 1")
        == before["subscription"]
    )
    assert await _fetch_one(db, "SELECT notes, share_token FROM plant_discoveries WHERE id = 1") == before["discovery"]
    assert await db.execute_fetchall("SELECT * FROM weather_warning_account_state") == []


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["owner", "editor"])
async def test_owner_and_editor_keep_existing_account_household_and_planning_write_access(
    client, household_account_planning_db, role,
):
    db = household_account_planning_db
    await _set_role(db, role)

    profile = await client.patch(
        "/api/users/1", json={"name": f"{role.title()} profile"}, headers=_header(),
    )
    preferences = await client.put(
        "/api/settings/notifications",
        json={"digest_enabled": True, "digest_time": "19:00"},
        headers=_header(),
    )
    subscription = await client.delete("/api/calendar/subscription", headers=_header())

    assert [profile.status_code, preferences.status_code, subscription.status_code] == [200, 200, 204]
    assert (await _fetch_one(db, "SELECT name FROM users WHERE id = 1"))["name"] == f"{role.title()} profile"
    assert (await _fetch_one(db, "SELECT digest_enabled FROM notification_preferences WHERE account_id = 1"))["digest_enabled"] == 1
    assert (await _fetch_one(db, "SELECT revoked_at FROM calendar_subscriptions WHERE account_id = 1"))["revoked_at"] is not None


@pytest.mark.asyncio
async def test_viewer_read_routes_remain_available(client, household_account_planning_db):
    db = household_account_planning_db
    await _set_role(db, "viewer")

    users = await client.get("/api/users", headers=_header())
    members = await client.get("/api/household/members", headers=_header())
    subscription = await client.get("/api/calendar/subscription", headers=_header())
    discoveries = await client.get("/api/discover", headers=_header())

    assert [users.status_code, members.status_code, subscription.status_code, discoveries.status_code] == [200, 200, 200, 200]
    assert users.json()[0]["name"] == "Test"
    assert members.json()[0]["name"] == "Test"
    assert subscription.json()["active"] is True
    assert discoveries.json()[0]["common_name"] == "Original discovery"
