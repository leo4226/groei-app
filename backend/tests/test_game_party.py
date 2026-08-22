"""Party mode: account-free guests, multi-map hunts, and race pacing.

These are the paths that make the game runnable at an actual garden party,
where nobody is going to create a Floreren account to earn a drink.
"""
from datetime import datetime, timedelta

import pytest

from routers import game as game_router
from tests.game_world import create_game_schema, seed_map, seed_plants


@pytest.fixture
def no_embeds(monkeypatch):
    async def fake_embed_url(_url: str):
        return None

    async def fake_embed_bytes(_image_bytes: bytes):
        return None

    monkeypatch.setattr(game_router, "_embed_url", fake_embed_url)
    monkeypatch.setattr(game_router, "_embed_bytes", fake_embed_bytes)


async def _world(db, *, indoor: bool = False) -> dict[str, list[int]]:
    """One outdoor map, optionally an indoor one, each with three plants."""
    await create_game_schema(db)
    await seed_map(db, 10, "Garden", "outdoor")
    out = await seed_plants(db, 10, [101, 102, 103])
    result = {"outdoor": out}
    if indoor:
        await seed_map(db, 11, "Living room", "indoor")
        result["indoor"] = await seed_plants(db, 11, [201, 202, 203])
    return result


async def _create(client, auth_header, **overrides) -> str:
    body = {"map_ids": [10], "plant_ids": [101, 102, 103], "clue_mode": "name"}
    body.update(overrides)
    resp = await client.post("/api/games", headers=auth_header, json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()["join_code"]


# ── Guests ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_guest_joins_with_only_a_name_and_can_play(
    client, seeded_db, auth_header, no_embeds
):
    await _world(seeded_db)
    code = await _create(client, auth_header)

    resp = await client.post(f"/api/games/{code}/join-guest", json={"name": "Lisbeth"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    token = body["guest_token"]
    assert body["state"]["my_player_id"] == body["player_id"]
    # A guest is never the host, whatever they do.
    assert body["state"]["is_host"] is False

    guest_header = {"Authorization": f"Bearer {token}"}
    await client.post(f"/api/games/{code}/start", headers=auth_header)

    state = (await client.get(f"/api/games/{code}", headers=guest_header)).json()
    target = state["current_clue"]["plant_name_nl"]

    resp = await client.post(
        f"/api/games/{code}/answer", headers=guest_header,
        json={"scanned_species": target},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_correct"] is True

    names = [p["player_name"] for p in
             (await client.get(f"/api/games/{code}", headers=auth_header)).json()["players"]]
    assert "Lisbeth" in names


@pytest.mark.asyncio
async def test_guest_token_cannot_reach_the_rest_of_the_app(
    client, seeded_db, auth_header, no_embeds
):
    """The guest token is game-scoped — it must not authenticate account routes."""
    await _world(seeded_db)
    code = await _create(client, auth_header)
    token = (await client.post(
        f"/api/games/{code}/join-guest", json={"name": "Gate crasher"}
    )).json()["guest_token"]
    guest_header = {"Authorization": f"Bearer {token}"}

    # An account-scoped endpoint must reject it cleanly (401), not 500 on the
    # int() cast of a non-numeric `sub`.
    assert (await client.get("/api/plants", headers=guest_header)).status_code == 401
    # And a guest cannot host: no creating, starting or advancing games.
    assert (await client.post(
        "/api/games", headers=guest_header,
        json={"map_ids": [10], "plant_ids": [101, 102, 103]},
    )).status_code == 403
    assert (await client.post(
        f"/api/games/{code}/start", headers=guest_header
    )).status_code == 403
    assert (await client.delete(
        f"/api/games/{code}", headers=guest_header
    )).status_code == 403


@pytest.mark.asyncio
async def test_guest_token_is_bound_to_its_own_game(
    client, seeded_db, auth_header, no_embeds
):
    await _world(seeded_db)
    first = await _create(client, auth_header)
    second = await _create(client, auth_header)

    token = (await client.post(
        f"/api/games/{first}/join-guest", json={"name": "Wanderer"}
    )).json()["guest_token"]
    guest_header = {"Authorization": f"Bearer {token}"}

    # Reading another game's state is harmless, but they are not a player in it
    # and so cannot answer its rounds.
    await client.post(f"/api/games/{second}/start", headers=auth_header)
    resp = await client.post(
        f"/api/games/{second}/answer", headers=guest_header,
        json={"scanned_species": "anything"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_latecomers_can_join_a_running_game(
    client, seeded_db, auth_header, no_embeds
):
    """People drift into a party continuously; a started game must stay open."""
    await _world(seeded_db)
    code = await _create(client, auth_header)
    await client.post(f"/api/games/{code}/start", headers=auth_header)

    resp = await client.post(f"/api/games/{code}/join-guest", json={"name": "Late Leo"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["state"]["session"]["status"] == "active"

    # A finished game is the one case that turns people away.
    for _ in range(5):
        await client.post(f"/api/games/{code}/next", headers=auth_header)
    resp = await client.post(f"/api/games/{code}/join-guest", json={"name": "Too late"})
    assert resp.status_code == 400


# ── Multi-map ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_hunt_can_span_indoor_and_outdoor_maps(
    client, seeded_db, auth_header, no_embeds
):
    world = await _world(seeded_db, indoor=True)
    code = await _create(
        client, auth_header,
        map_ids=[10, 11],
        plant_ids=[*world["outdoor"], *world["indoor"]],
    )

    state = (await client.get(f"/api/games/{code}", headers=auth_header)).json()
    assert {m["name"] for m in state["session"]["maps"]} == {"Garden", "Living room"}

    rounds = await seeded_db.execute_fetchall(
        "SELECT DISTINCT map_id FROM game_rounds ORDER BY map_id"
    )
    assert [r["map_id"] for r in rounds] == [10, 11]


@pytest.mark.asyncio
async def test_indoor_only_game_is_allowed(client, seeded_db, auth_header, no_embeds):
    """The old code rejected every non-outdoor map outright."""
    world = await _world(seeded_db, indoor=True)
    resp = await client.post(
        "/api/games", headers=auth_header,
        json={"map_ids": [11], "plant_ids": world["indoor"], "clue_mode": "name"},
    )
    assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_plants_outside_the_selected_maps_are_rejected(
    client, seeded_db, auth_header, no_embeds
):
    world = await _world(seeded_db, indoor=True)
    # Indoor plants selected but only the outdoor map included → nothing valid.
    resp = await client.post(
        "/api/games", headers=auth_header,
        json={"map_ids": [10], "plant_ids": world["indoor"]},
    )
    assert resp.status_code == 400


# ── Race pacing ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_race_round_expires_and_advances_on_the_next_poll(
    client, seeded_db, auth_header, no_embeds
):
    """Nobody should have to tap 'next' at their own party."""
    await _world(seeded_db)
    code = await _create(client, auth_header, pacing="race", round_seconds=120)

    resp = await client.post(f"/api/games/{code}/start", headers=auth_header)
    state = resp.json()
    assert state["session"]["pacing"] == "race"
    assert state["session"]["current_round"] == 0
    # The countdown is computed server-side so a wrong phone clock can't cheat.
    assert 0 < state["session"]["seconds_remaining"] <= 120

    # Wind the deadline into the past, as if the round had run out.
    await seeded_db.execute(
        "UPDATE game_rounds SET ends_at = ? WHERE round_index = 0",
        (datetime.utcnow() - timedelta(seconds=1),),
    )
    await seeded_db.commit()

    state = (await client.get(f"/api/games/{code}", headers=auth_header)).json()
    assert state["session"]["current_round"] == 1
    assert state["session"]["seconds_remaining"] > 0


@pytest.mark.asyncio
async def test_race_scoring_rewards_finishing_order(
    client, seeded_db, auth_header, no_embeds
):
    await _world(seeded_db)
    code = await _create(client, auth_header, pacing="race")

    guests = []
    for name in ("First", "Second", "Third"):
        body = (await client.post(
            f"/api/games/{code}/join-guest", json={"name": name}
        )).json()
        guests.append({"Authorization": f"Bearer {body['guest_token']}"})

    state = (await client.post(f"/api/games/{code}/start", headers=auth_header)).json()
    target = state["current_clue"]["plant_name_nl"]

    awarded = []
    for header in guests:
        resp = await client.post(
            f"/api/games/{code}/answer", headers=header,
            json={"scanned_species": target},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        awarded.append((
            body["finish_rank"],
            body["points_awarded"] - body["speed_bonus"],
        ))

    # Ranks and the rank component only. All three answered in the same second,
    # so they each earned the same speed bonus on top — subtracting it is what
    # keeps this test about finishing ORDER, which is the thing it names.
    assert awarded == [(1, 150), (2, 140), (3, 130)]


@pytest.mark.asyncio
async def test_host_pacing_does_not_auto_advance(
    client, seeded_db, auth_header, no_embeds
):
    """Host mode must stay under the host's thumb — no surprise round changes."""
    await _world(seeded_db)
    code = await _create(client, auth_header, pacing="host")
    await client.post(f"/api/games/{code}/start", headers=auth_header)

    state = (await client.get(f"/api/games/{code}", headers=auth_header)).json()
    assert state["session"]["current_round"] == 0
    assert state["session"]["seconds_remaining"] is None


# ── Host override ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_host_can_wave_a_stuck_guest_through(
    client, seeded_db, auth_header, no_embeds
):
    await _world(seeded_db)
    code = await _create(client, auth_header)
    joined = (await client.post(
        f"/api/games/{code}/join-guest", json={"name": "Stuck"}
    )).json()
    await client.post(f"/api/games/{code}/start", headers=auth_header)

    resp = await client.post(
        f"/api/games/{code}/players/{joined['player_id']}/award", headers=auth_header
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_correct"] is True

    players = (await client.get(f"/api/games/{code}", headers=auth_header)).json()["players"]
    stuck = next(p for p in players if p["player_name"] == "Stuck")
    assert stuck["score"] > 0
    assert stuck["answered_current_round"] is True


@pytest.mark.asyncio
async def test_guest_cannot_award_points(client, seeded_db, auth_header, no_embeds):
    await _world(seeded_db)
    code = await _create(client, auth_header)
    joined = (await client.post(
        f"/api/games/{code}/join-guest", json={"name": "Cheat"}
    )).json()
    await client.post(f"/api/games/{code}/start", headers=auth_header)

    resp = await client.post(
        f"/api/games/{code}/players/{joined['player_id']}/award",
        headers={"Authorization": f"Bearer {joined['guest_token']}"},
    )
    assert resp.status_code == 403


# ── Preview ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_preview_names_the_game_without_a_token(
    client, seeded_db, auth_header, no_embeds
):
    """The join screen shows whose garden it is before anyone signs in."""
    await _world(seeded_db)
    code = await _create(client, auth_header)

    resp = await client.get(f"/api/games/{code}/preview")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["map_name"] == "Garden"
    assert body["status"] == "waiting"
    assert body["player_count"] == 1

    assert (await client.get("/api/games/ZZZZZZ/preview")).status_code == 404


@pytest.mark.asyncio
async def test_race_round_ends_early_once_everyone_has_found_it(
    client, seeded_db, auth_header, no_embeds
):
    """No reason to make a whole party watch a timer run out."""
    await _world(seeded_db)
    code = await _create(client, auth_header, pacing="race", round_seconds=600)

    guest = (await client.post(
        f"/api/games/{code}/join-guest", json={"name": "Quick"}
    )).json()
    guest_header = {"Authorization": f"Bearer {guest['guest_token']}"}

    state = (await client.post(f"/api/games/{code}/start", headers=auth_header)).json()
    target = state["current_clue"]["plant_name_nl"]
    assert state["session"]["current_round"] == 0

    # The host is a player too, so the round only closes when both have found it.
    await client.post(
        f"/api/games/{code}/answer", headers=guest_header,
        json={"scanned_species": target},
    )
    still = (await client.get(f"/api/games/{code}", headers=auth_header)).json()
    assert still["session"]["current_round"] == 0

    await client.post(
        f"/api/games/{code}/answer", headers=auth_header,
        json={"scanned_species": target},
    )
    moved = (await client.get(f"/api/games/{code}", headers=auth_header)).json()
    assert moved["session"]["current_round"] == 1


# ── Grading transparency ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_the_host_sees_how_each_round_was_accepted(
    client, seeded_db, auth_header, no_embeds
):
    """A hunt won on name matching looks identical, on the scoreboard, to one
    won on photographs — which is how a red climber passed as a Scindapsus and
    left nothing behind to find. The host now gets the route each correct
    answer took; the players do not, because it is a diagnostic about the
    grader and would only take their win away from them.
    """
    await _world(seeded_db)
    code = await _create(client, auth_header)
    guest_token = (await client.post(
        f"/api/games/{code}/join-guest", json={"name": "Lisbeth"}
    )).json()["guest_token"]
    guest_header = {"Authorization": f"Bearer {guest_token}"}
    await client.post(f"/api/games/{code}/start", headers=auth_header)

    state = (await client.get(f"/api/games/{code}", headers=guest_header)).json()
    target = state["current_clue"]["plant_name_nl"]
    resp = await client.post(
        f"/api/games/{code}/answer", headers=guest_header,
        json={"scanned_species": target},
    )
    assert resp.json()["is_correct"] is True

    for _ in range(5):
        await client.post(f"/api/games/{code}/next", headers=auth_header)

    host_state = (await client.get(f"/api/games/{code}", headers=auth_header)).json()
    assert host_state["session"]["status"] == "finished"
    first = host_state["round_stats"][0]
    assert first["answered_count"] == 1
    # These plants have no reference photos, so the name path graded it — which
    # is precisely the thing worth being able to see.
    assert sum(first["match_kinds"].values()) == 1
    assert "photo" not in first["match_kinds"]

    guest_state = (await client.get(f"/api/games/{code}", headers=guest_header)).json()
    assert guest_state["round_stats"][0]["answered_count"] == 1
    assert guest_state["round_stats"][0]["match_kinds"] is None, (
        "only the host sees how the grader reached its verdict")
