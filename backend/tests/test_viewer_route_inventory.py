"""Complete mounted unsafe-method policy inventory for viewer authorization (#924)."""
from __future__ import annotations

import base64
from collections import Counter

import pytest
from fastapi.routing import APIRoute

from auth import create_token, get_current_account, require_admin, require_editor
from main import app
from routers import bug_report, chat, game, icons, plant_id
from services.feedback_composer import FeedbackDraft
from tests.game_world import seed_game_world
from tests.test_quiz import _seed_quiz_world


WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
EDITOR_REQUIRED = "editor-or-owner"
VIEWER_READ_ACTION = "viewer-allowed authenticated read-only action"
GUEST_OR_PUBLIC = "public or guest-token action"
PLATFORM_ADMIN = "platform-admin or internal-secret operation"
GAME_ACCOUNT_OR_GUEST = "editor account or valid game guest"


def _policies(category: str, reason: str, *route_keys: tuple[str, str]):
    return tuple((method, path, category, reason) for method, path in route_keys)


# This is deliberately a complete list of every mounted POST/PUT/PATCH/DELETE
# route. It must be updated consciously with its policy when a router changes.
POLICY_ENTRIES = (
    *_policies(
        EDITOR_REQUIRED,
        "Changes household data or starts paid/external work; owners and editors may perform it.",
        ("POST", "/api/auth/change-password"),
        ("POST", "/api/bug-report"),
        ("POST", "/api/bug-report/draft"),
        ("DELETE", "/api/calendar/subscription"),
        ("PATCH", "/api/calendar/subscription"),
        ("POST", "/api/calendar/subscription"),
        ("POST", "/api/care-rhythm/apply"),
        ("POST", "/api/care-rhythm/{operation_id}/undo"),
        ("POST", "/api/care/done"),
        ("POST", "/api/care/garden/complete"),
        ("POST", "/api/care/garden/{operation_id}/undo"),
        ("POST", "/api/care/maps/{map_id}/watering-round/complete"),
        ("POST", "/api/care/moisture-checks/resolve"),
        ("DELETE", "/api/care/schedules/{schedule_id}"),
        ("PATCH", "/api/care/schedules/{schedule_id}"),
        ("POST", "/api/care/skip"),
        ("POST", "/api/care/undo"),
        ("POST", "/api/chat"),
        ("POST", "/api/discover"),
        ("DELETE", "/api/discover/{discovery_id}"),
        ("PATCH", "/api/discover/{discovery_id}"),
        ("PATCH", "/api/discover/{discovery_id}/location"),
        ("POST", "/api/discover/{discovery_id}/share"),
        ("POST", "/api/garden/fertilize-log"),
        ("DELETE", "/api/garden/fertilize-log/latest"),
        ("POST", "/api/garden/grow-here"),
        ("POST", "/api/garden/water-log"),
        ("DELETE", "/api/garden/water-log/latest"),
        ("PATCH", "/api/household"),
        ("PUT", "/api/household/calendar-grouping"),
        ("POST", "/api/household/invite"),
        ("PATCH", "/api/household/members/{member_id}"),
        ("DELETE", "/api/household/members/{user_id}"),
        ("PATCH", "/api/icon-catalog/request/{plant_id}"),
        ("POST", "/api/locations"),
        ("DELETE", "/api/locations/{location_id}"),
        ("PATCH", "/api/locations/{location_id}"),
        ("POST", "/api/maps"),
        ("DELETE", "/api/maps/{map_id}"),
        ("PUT", "/api/maps/{map_id}"),
        ("POST", "/api/maps/{map_id}/underlay"),
        ("PUT", "/api/maps/{slug}/circularity"),
        ("POST", "/api/maps/{slug}/dismiss-recommendation"),
        ("DELETE", "/api/maps/{slug}/dismiss-recommendation/{species_id}"),
        ("PUT", "/api/maps/{slug}/features"),
        ("POST", "/api/objects"),
        ("DELETE", "/api/objects/{object_id}"),
        ("PUT", "/api/objects/{object_id}"),
        ("PUT", "/api/objects/{object_id}/position"),
        ("PATCH", "/api/objects/{object_id}/restore"),
        ("DELETE", "/api/photos/{photo_id}"),
        ("PATCH", "/api/photos/{photo_id}"),
        ("POST", "/api/plants"),
        ("DELETE", "/api/plants/bulk-archive"),
        ("POST", "/api/plants/bulk-archive"),
        ("POST", "/api/plants/identify"),
        ("POST", "/api/plants/identify/commit"),
        ("DELETE", "/api/plants/{plant_id}"),
        ("PUT", "/api/plants/{plant_id}"),
        ("PATCH", "/api/plants/{plant_id}/care-profile"),
        ("PUT", "/api/plants/{plant_id}/care-schedules"),
        ("PUT", "/api/plants/{plant_id}/container"),
        ("POST", "/api/plants/{plant_id}/duplicate"),
        ("PUT", "/api/plants/{plant_id}/ground-zone"),
        ("PATCH", "/api/plants/{plant_id}/lock"),
        ("POST", "/api/plants/{plant_id}/photo"),
        ("PUT", "/api/plants/{plant_id}/photo-reminder"),
        ("POST", "/api/plants/{plant_id}/photos"),
        ("POST", "/api/plants/{plant_id}/placements"),
        ("DELETE", "/api/plants/{plant_id}/placements/{placement_id}"),
        ("PATCH", "/api/plants/{plant_id}/placements/{placement_id}"),
        ("PUT", "/api/plants/{plant_id}/position"),
        ("PATCH", "/api/plants/{plant_id}/restore"),
        ("POST", "/api/plants/{plant_id}/retry-species"),
        ("DELETE", "/api/push/subscription"),
        ("POST", "/api/push/subscription"),
        ("POST", "/api/push/test"),
        ("POST", "/api/quiz/guess"),
        ("POST", "/api/quiz/mc"),
        ("POST", "/api/quiz/rounds"),
        ("PUT", "/api/settings/notifications"),
        ("PATCH", "/api/users/{user_id}"),
        ("PATCH", "/api/users/{user_id}/language"),
        ("DELETE", "/api/weather-warnings/{warning_id}/acknowledgment"),
        ("POST", "/api/weather-warnings/{warning_id}/acknowledgment"),
        ("POST", "/api/weed-sightings"),
        ("DELETE", "/api/weed-sightings/{sighting_id}"),
    ),
    *_policies(
        GAME_ACCOUNT_OR_GUEST,
        "Account actors must be current editors; a valid session-scoped game guest keeps its existing permitted action.",
        ("POST", "/api/games"),
        ("DELETE", "/api/games/{code}"),
        ("POST", "/api/games/{code}/answer"),
        ("POST", "/api/games/{code}/join"),
        ("POST", "/api/games/{code}/next"),
        ("POST", "/api/games/{code}/players/{player_id}/award"),
        ("POST", "/api/games/{code}/scan"),
        ("POST", "/api/games/{code}/start"),
    ),
    *_policies(
        VIEWER_READ_ACTION,
        "Authenticated calculation or download only; it does not persist data or spend a paid/external resource.",
        ("POST", "/api/calendar/export.ics"),
        ("POST", "/api/care-rhythm/onboarding-preview"),
        ("POST", "/api/care-rhythm/preview"),
        ("POST", "/api/species/garden-fit/batch"),
        ("POST", "/api/spots/suitability"),
    ),
    *_policies(
        PLATFORM_ADMIN,
        "Protected by the platform-admin dependency, outside household roles.",
        ("POST", "/api/admin-panel/bioclip/sync"),
        ("POST", "/api/admin-panel/jobs"),
        ("POST", "/api/admin-panel/plants/{plant_id}/regenerate-icon"),
        ("POST", "/api/admin-panel/species/merge"),
        ("PATCH", "/api/admin-panel/species/{species_id}"),
        ("POST", "/api/admin-panel/species/{species_id}/regenerate-fact"),
        ("POST", "/api/admin-panel/species/{species_id}/regenerate-thresholds"),
        ("DELETE", "/api/admin/accounts/bulk"),
        ("DELETE", "/api/admin/accounts/{account_id}"),
        ("POST", "/api/admin/backfill-care-schedules"),
        ("POST", "/api/admin/backfill-plant-types"),
        ("POST", "/api/admin/backfill-thresholds"),
        ("POST", "/api/icon-catalog/sync"),
    ),
    ("POST", "/api/auth/register", GUEST_OR_PUBLIC, "Public registration is rate-limited and creates an initial owner account."),
    ("POST", "/api/auth/login", GUEST_OR_PUBLIC, "Public login is rate-limited and verifies credentials."),
    ("POST", "/api/auth/forgot-password", GUEST_OR_PUBLIC, "Public reset request is rate-limited and intentionally avoids account enumeration."),
    ("POST", "/api/auth/reset-password", GUEST_OR_PUBLIC, "A one-time reset token authorizes this password change."),
    ("POST", "/api/games/{code}/join-guest", GUEST_OR_PUBLIC, "A public game code creates a limited, session-scoped guest capability."),
    ("POST", "/api/household/join", GUEST_OR_PUBLIC, "A valid household invite code authorizes joining without an existing account."),
    ("POST", "/api/internal/send-digests", GUEST_OR_PUBLIC, "The digest cron supplies its internal shared secret."),
    ("POST", "/api/internal/watchdog/check", PLATFORM_ADMIN, "The watchdog endpoint validates its own internal shared secret."),
    ("POST", "/api/internal/watchdog/heartbeat", PLATFORM_ADMIN, "The watchdog endpoint validates its own internal shared secret."),
    ("POST", "/api/notifications/snooze", GUEST_OR_PUBLIC, "A signed email capability token authorizes a limited push-snooze action."),
)


PUBLIC_OR_GUEST_KEYS = {
    (method, path)
    for method, path, category, _reason in POLICY_ENTRIES
    if category == GUEST_OR_PUBLIC
}

INTERNAL_SECRET_KEYS = {
    ("POST", "/api/internal/watchdog/check"),
    ("POST", "/api/internal/watchdog/heartbeat"),
}


def _mounted_write_routes() -> dict[tuple[str, str], object]:
    routes: dict[tuple[str, str], object] = {}
    for app_route in app.routes:
        effective_contexts = getattr(app_route, "effective_route_contexts", None)
        mounted_routes = (
            effective_contexts()
            if callable(effective_contexts)
            else (app_route,) if isinstance(app_route, APIRoute) else ()
        )
        for mounted_route in mounted_routes:
            original_route = getattr(mounted_route, "original_route", mounted_route)
            if not isinstance(original_route, APIRoute):
                continue
            path = getattr(mounted_route, "path", original_route.path)
            methods = getattr(mounted_route, "methods", original_route.methods)
            for method in methods & WRITE_METHODS:
                route_key = (method, path)
                assert route_key not in routes, f"Duplicate mounted write route: {route_key}"
                routes[route_key] = mounted_route
    return routes


def _has_dependency(route: object, dependency: object) -> bool:
    original_route = getattr(route, "original_route", route)
    return any(item.call is dependency for item in original_route.dependant.dependencies)


def _viewer_header() -> dict[str, str]:
    return {"Authorization": f"Bearer {create_token(account_id=1, household_id=1)}"}


async def _set_role(db, role: str) -> None:
    await db.execute("UPDATE accounts SET role = ? WHERE id = 1", (role,))
    await db.commit()


def test_complete_mounted_write_route_inventory_has_one_policy_and_correct_dependency():
    mounted_routes = _mounted_write_routes()
    policy_keys = [(method, path) for method, path, _category, _reason in POLICY_ENTRIES]
    duplicate_policies = [key for key, count in Counter(policy_keys).items() if count != 1]

    assert duplicate_policies == []
    assert set(policy_keys) == set(mounted_routes)

    game_mutation_actor = getattr(game, "game_mutation_actor", None)
    for method, path, category, reason in POLICY_ENTRIES:
        assert reason, (method, path)
        route = mounted_routes[(method, path)]
        if category == EDITOR_REQUIRED:
            assert _has_dependency(route, require_editor), (method, path)
        elif category == GAME_ACCOUNT_OR_GUEST:
            assert game_mutation_actor is not None
            assert _has_dependency(route, game_mutation_actor), (method, path)
        elif category == VIEWER_READ_ACTION:
            assert _has_dependency(route, get_current_account), (method, path)
            assert not _has_dependency(route, require_editor), (method, path)
        elif category == PLATFORM_ADMIN:
            if (method, path) not in INTERNAL_SECRET_KEYS:
                assert _has_dependency(route, require_admin), (method, path)
        else:
            assert (method, path) in PUBLIC_OR_GUEST_KEYS
            assert not _has_dependency(route, require_editor), (method, path)


@pytest.mark.asyncio
async def test_viewer_is_rejected_before_identification_chat_and_feedback_work(client, seeded_db, monkeypatch):
    await _set_role(seeded_db, "viewer")
    calls: list[str] = []

    async def unexpected(name: str, *_args, **_kwargs):
        calls.append(name)
        raise AssertionError(f"viewer reached {name}")

    async def blocked_identify(*args, **kwargs):
        return await unexpected("identify", *args, **kwargs)

    async def blocked_enrich(*args, **kwargs):
        return await unexpected("identify-commit", *args, **kwargs)

    async def blocked_context(*args, **kwargs):
        return await unexpected("chat", *args, **kwargs)

    async def blocked_draft(*args, **kwargs):
        return await unexpected("feedback", *args, **kwargs)

    monkeypatch.setattr(plant_id, "_bioclip_identify", blocked_identify)
    monkeypatch.setattr(plant_id, "_enrich_species_if_missing", blocked_enrich)
    monkeypatch.setattr(chat, "_build_garden_context", blocked_context)
    monkeypatch.setattr(bug_report, "compose_draft", blocked_draft)

    identify = await client.post(
        "/api/plants/identify",
        files={"image": ("blocked.jpg", b"image", "image/jpeg")},
        headers=_viewer_header(),
    )
    commit = await client.post(
        "/api/plants/identify/commit",
        json={"scientific_name": "Blocked species", "photo_base64": base64.b64encode(b"image").decode()},
        headers=_viewer_header(),
    )
    chat_response = await client.post(
        "/api/chat", json={"message": "Blocked"}, headers=_viewer_header()
    )
    draft = await client.post(
        "/api/bug-report/draft", json={"report": "Blocked"}, headers=_viewer_header()
    )

    assert [response.status_code for response in (identify, commit, chat_response, draft)] == [403] * 4
    assert calls == []


@pytest.mark.asyncio
async def test_viewer_cannot_request_icons_or_run_quiz_actions(client, seeded_db):
    await seeded_db.execute("ALTER TABLE plants ADD COLUMN icon_requested BOOLEAN DEFAULT FALSE")
    await seeded_db.execute(
        "INSERT INTO plants (id, name, household_id, is_active, icon_requested) VALUES (1, 'Original', 1, TRUE, FALSE)"
    )
    quiz_ids = await _seed_quiz_world(seeded_db, plant_count=4)
    await _set_role(seeded_db, "viewer")

    icon = await client.patch("/api/icon-catalog/request/1", headers=_viewer_header())
    rounds = await client.post("/api/quiz/rounds", json={"count": 1}, headers=_viewer_header())
    guess = await client.post(
        "/api/quiz/guess", json={"plant_id": quiz_ids[0], "guess": "Plant"}, headers=_viewer_header()
    )
    multiple_choice = await client.post(
        "/api/quiz/mc", json={"plant_id": quiz_ids[0], "picked_id": quiz_ids[0]}, headers=_viewer_header()
    )

    assert [response.status_code for response in (icon, rounds, guess, multiple_choice)] == [403] * 4
    row = (await seeded_db.execute_fetchall("SELECT icon_requested FROM plants WHERE id = 1"))[0]
    assert row["icon_requested"] == 0


@pytest.mark.asyncio
async def test_viewer_account_is_rejected_from_game_but_a_valid_guest_can_still_play(client, seeded_db):
    plant_ids = await seed_game_world(seeded_db, plant_count=3)
    owner_header = _viewer_header()
    created = await client.post(
        "/api/games",
        headers=owner_header,
        json={"map_id": 10, "plant_ids": plant_ids, "clue_mode": "name"},
    )
    assert created.status_code == 201, created.text
    code = created.json()["join_code"]

    guest = await client.post(f"/api/games/{code}/join-guest", json={"name": "Guest"})
    assert guest.status_code == 200, guest.text
    guest_header = {"Authorization": f"Bearer {guest.json()['guest_token']}"}

    await _set_role(seeded_db, "viewer")
    viewer_answer = await client.post(
        f"/api/games/{code}/answer",
        headers=_viewer_header(),
        json={"scanned_species": "anything"},
    )

    await _set_role(seeded_db, "owner")
    started = await client.post(f"/api/games/{code}/start", headers=_viewer_header())
    assert started.status_code == 200, started.text
    target = started.json()["current_clue"]["plant_name_nl"]
    guest_answer = await client.post(
        f"/api/games/{code}/answer",
        headers=guest_header,
        json={"scanned_species": target},
    )

    assert viewer_answer.status_code == 403
    assert guest_answer.status_code == 200, guest_answer.text


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ("owner", "editor"))
async def test_owner_and_editor_keep_representative_identify_feedback_quiz_and_icon_access(
    client, seeded_db, monkeypatch, role,
):
    await seeded_db.execute("ALTER TABLE plants ADD COLUMN icon_requested BOOLEAN DEFAULT FALSE")
    await seeded_db.execute(
        "INSERT INTO plants (id, name, household_id, is_active, icon_requested) VALUES (1, 'Original', 1, TRUE, FALSE)"
    )
    await _seed_quiz_world(seeded_db, plant_count=4)
    await _set_role(seeded_db, role)

    async def fake_bioclip(*_args, **_kwargs):
        return plant_id.IdentifyResponse(
            candidates=[], confidence="no_match", low_confidence=False, source="bioclip",
        )

    async def fake_draft(*_args, **_kwargs):
        return FeedbackDraft(kind="bug", title="Test", body="Test body", composed_by="fallback")

    monkeypatch.setattr(plant_id, "_bioclip_identify", fake_bioclip)
    monkeypatch.setattr(bug_report, "compose_draft", fake_draft)

    identify = await client.post(
        "/api/plants/identify",
        files={"image": ("plant.jpg", b"image", "image/jpeg")},
        headers=_viewer_header(),
    )
    feedback = await client.post(
        "/api/bug-report/draft", json={"report": "Test"}, headers=_viewer_header()
    )
    icon = await client.patch("/api/icon-catalog/request/1", headers=_viewer_header())
    quiz = await client.post("/api/quiz/rounds", json={"count": 1}, headers=_viewer_header())

    assert [response.status_code for response in (identify, feedback, icon, quiz)] == [200, 200, 200, 201]
