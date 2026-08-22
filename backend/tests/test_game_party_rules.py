"""Party rules: a limit on wrong scans, a forfeit, and the Latin name as clue.

Three rules a garden party needs and a solo hunt does not. The one with teeth
is the attempt limit — without it a guest can walk the border photographing
every plant until something sticks, which is an inventory, not a hunt.
"""
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


async def _world(db):
    await create_game_schema(db)
    await seed_map(db, 10, "Garden", "outdoor")
    await seed_plants(db, 10, [101, 102, 103])


async def _create(client, auth_header, **over) -> str:
    body = {"map_ids": [10], "plant_ids": [101, 102, 103], "clue_mode": "name"}
    body.update(over)
    resp = await client.post("/api/games", headers=auth_header, json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()["join_code"]


async def _guest(client, code, name="Lisbeth") -> dict:
    token = (await client.post(
        f"/api/games/{code}/join-guest", json={"name": name})).json()["guest_token"]
    return {"Authorization": f"Bearer {token}"}


# ── Wrong-scan limit ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_a_third_wrong_guess_is_refused(client, seeded_db, auth_header, no_embeds):
    await _world(seeded_db)
    code = await _create(client, auth_header)
    guest = await _guest(client, code)
    await client.post(f"/api/games/{code}/start", headers=auth_header)

    async def guess(name):
        return await client.post(
            f"/api/games/{code}/answer", headers=guest,
            json={"scanned_species": name})

    first = await guess("Iets anders")
    assert first.json()["is_correct"] is False
    assert first.json()["attempts_left"] == 1
    assert first.json()["locked"] is False

    second = await guess("Nog iets anders")
    assert second.json()["attempts_left"] == 0
    assert second.json()["locked"] is True

    # The third is refused outright — and as a normal result, not an error:
    # the player did nothing wrong by asking, and the client has to render it.
    third = await guess("Wanhoop")
    assert third.status_code == 200
    assert third.json()["locked"] is True
    assert third.json()["attempts_left"] == 0


@pytest.mark.asyncio
async def test_the_right_plant_still_scores_on_the_last_attempt(
    client, seeded_db, auth_header, no_embeds
):
    """Two wrong guesses must not poison a correct third one."""
    await _world(seeded_db)
    code = await _create(client, auth_header)
    guest = await _guest(client, code)
    await client.post(f"/api/games/{code}/start", headers=auth_header)

    state = (await client.get(f"/api/games/{code}", headers=guest)).json()
    target = state["current_clue"]["plant_name_nl"]

    await client.post(f"/api/games/{code}/answer", headers=guest,
                      json={"scanned_species": "Mis"})
    resp = await client.post(f"/api/games/{code}/answer", headers=guest,
                             json={"scanned_species": target})

    body = resp.json()
    assert body["is_correct"] is True
    assert body["points_awarded"] > 0
    # One wrong guess happened, but a correct answer is never a lockout.
    assert body["locked"] is False


@pytest.mark.asyncio
async def test_the_lockout_survives_a_reload(client, seeded_db, auth_header, no_embeds):
    """The count lives in the answer row, not in the scan response — otherwise
    closing the PWA and reopening it hands the attempts back."""
    await _world(seeded_db)
    code = await _create(client, auth_header)
    guest = await _guest(client, code)
    await client.post(f"/api/games/{code}/start", headers=auth_header)

    for name in ("Mis", "Mis nog eens"):
        await client.post(f"/api/games/{code}/answer", headers=guest,
                          json={"scanned_species": name})

    state = (await client.get(f"/api/games/{code}", headers=guest)).json()
    assert state["my_answer"]["locked"] is True
    assert state["my_answer"]["attempts_left"] == 0
    assert state["session"]["max_wrong_attempts"] == 2


@pytest.mark.asyncio
async def test_the_host_can_still_wave_a_locked_out_player_through(
    client, seeded_db, auth_header, no_embeds
):
    """The override exists for the guest whose phone will not focus, and a
    locked-out player is exactly who most needs it."""
    await _world(seeded_db)
    code = await _create(client, auth_header)
    guest = await _guest(client, code)
    await client.post(f"/api/games/{code}/start", headers=auth_header)
    state = (await client.get(f"/api/games/{code}", headers=guest)).json()
    player_id = state["my_player_id"]

    for name in ("Mis", "Mis nog eens"):
        await client.post(f"/api/games/{code}/answer", headers=guest,
                          json={"scanned_species": name})

    resp = await client.post(
        f"/api/games/{code}/players/{player_id}/award", headers=auth_header)

    assert resp.status_code == 200, resp.text
    assert resp.json()["is_correct"] is True
    assert resp.json()["points_awarded"] > 0


@pytest.mark.asyncio
async def test_each_round_gets_its_own_attempts(
    client, seeded_db, auth_header, no_embeds
):
    """The limit is per plant, not per game — locking someone out of the whole
    hunt on round one would end their party."""
    await _world(seeded_db)
    code = await _create(client, auth_header)
    guest = await _guest(client, code)
    await client.post(f"/api/games/{code}/start", headers=auth_header)

    for name in ("Mis", "Mis nog eens"):
        await client.post(f"/api/games/{code}/answer", headers=guest,
                          json={"scanned_species": name})
    await client.post(f"/api/games/{code}/next", headers=auth_header)

    resp = await client.post(f"/api/games/{code}/answer", headers=guest,
                             json={"scanned_species": "Nieuwe ronde"})

    assert resp.json()["locked"] is False
    assert resp.json()["attempts_left"] == 1


# ── Forfeit ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_the_host_sets_the_forfeit_in_their_own_words(
    client, seeded_db, auth_header, no_embeds
):
    await _world(seeded_db)
    code = await _create(client, auth_header, forfeit="  shotje Hierbas  ")

    state = (await client.get(f"/api/games/{code}", headers=auth_header)).json()

    assert state["session"]["forfeit"] == "shotje Hierbas", "trimmed, not mangled"


@pytest.mark.asyncio
async def test_a_blank_forfeit_is_stored_as_nothing(
    client, seeded_db, auth_header, no_embeds
):
    """`''` would render an empty penalty line under the scoreboard."""
    await _world(seeded_db)
    code = await _create(client, auth_header, forfeit="   ")

    state = (await client.get(f"/api/games/{code}", headers=auth_header)).json()

    assert state["session"]["forfeit"] is None


@pytest.mark.asyncio
async def test_an_overlong_forfeit_is_cut_to_a_caption(
    client, seeded_db, auth_header, no_embeds
):
    await _world(seeded_db)
    code = await _create(client, auth_header, forfeit="x" * 500)

    state = (await client.get(f"/api/games/{code}", headers=auth_header)).json()

    assert len(state["session"]["forfeit"]) == game_router.MAX_FORFEIT_LEN


# ── Latin name in the clue ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_a_name_clue_carries_the_latin_name(
    client, seeded_db, auth_header, no_embeds
):
    """A guest who knows "Monstera deliciosa" but neither common name can play."""
    await _world(seeded_db)
    await seeded_db.execute(
        "INSERT INTO plant_species (id, common_name_nl, common_name_en, latin_name) "
        "VALUES (7, 'Gatenplant', 'Swiss cheese plant', 'Monstera deliciosa')")
    await seeded_db.execute("UPDATE plants SET species_id = 7")
    await seeded_db.commit()
    code = await _create(client, auth_header, clue_mode="name")
    await client.post(f"/api/games/{code}/start", headers=auth_header)

    state = (await client.get(f"/api/games/{code}", headers=auth_header)).json()

    assert state["current_clue"]["target_species"] == "Monstera deliciosa"


@pytest.mark.asyncio
async def test_a_photo_clue_never_ships_the_species_name(
    client, seeded_db, auth_header, no_embeds
):
    """In photo mode the species name is the ANSWER. Shipping it in the clue
    payload hands every player the round for free — and a player only has to
    open devtools to read it."""
    await _world(seeded_db)
    await seeded_db.execute(
        "INSERT INTO plant_species (id, common_name_nl, common_name_en, latin_name) "
        "VALUES (7, 'Gatenplant', 'Swiss cheese plant', 'Monstera deliciosa')")
    await seeded_db.execute("UPDATE plants SET species_id = 7")
    await seeded_db.commit()
    code = await _create(client, auth_header, clue_mode="photo")
    await client.post(f"/api/games/{code}/start", headers=auth_header)

    state = (await client.get(f"/api/games/{code}", headers=auth_header)).json()

    assert "target_species" not in state["current_clue"]
    assert "Monstera deliciosa" not in str(state["rounds"])


@pytest.mark.asyncio
async def test_a_locked_scan_never_reaches_the_identifier(
    client, seeded_db, auth_header, monkeypatch
):
    """The refusal has to come BEFORE the identify call, not after.

    Identifying costs a GPU inference on the BioCLIP worker, which serializes
    every request behind one lock, plus a possible PlantNet call against a
    rate-limited quota. At a party a few locked-out guests retrying would queue
    up in front of everyone still legitimately playing.
    """
    await _world(seeded_db)
    code = await _create(client, auth_header)
    guest = await _guest(client, code)
    await client.post(f"/api/games/{code}/start", headers=auth_header)

    for name in ("Mis", "Mis nog eens"):
        await client.post(f"/api/games/{code}/answer", headers=guest,
                          json={"scanned_species": name})

    called = []

    async def loud_embed(_b):
        called.append("embed")
        return None

    monkeypatch.setattr(game_router, "_embed_bytes", loud_embed)

    resp = await client.post(
        f"/api/games/{code}/scan", headers=guest,
        files={"image": ("x.jpg", b"jpegbytes", "image/jpeg")},
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["locked"] is True
    assert called == [], "a locked player's photo must not reach the GPU at all"


# ── Hosting without playing ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_the_host_can_step_out_and_still_run_the_game(
    client, seeded_db, auth_header, no_embeds
):
    """Running the party is not the same as playing it. A host holding the QR
    phone can see the answer behind the peek toggle, so being on the scoreboard
    is neither fair nor interesting — but they keep every host power."""
    await _world(seeded_db)
    code = await _create(client, auth_header)
    guest = await _guest(client, code)

    resp = await client.post(f"/api/games/{code}/leave", headers=auth_header)

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["my_player_id"] is None
    assert [p["player_name"] for p in body["players"]] == ["Lisbeth"]
    assert body["is_host"] is True, "stepping out of the hunt is not resigning as host"

    # Still runs the game.
    assert (await client.post(
        f"/api/games/{code}/start", headers=auth_header)).status_code == 200
    state = (await client.get(f"/api/games/{code}", headers=guest)).json()
    assert state["session"]["status"] == "active"


@pytest.mark.asyncio
async def test_stepping_out_takes_your_answers_with_you(
    client, seeded_db, auth_header, no_embeds
):
    """Leaving the rows behind keeps the host in every round's found-count
    while off the scoreboard, which reads as a bug to everyone still playing."""
    await _world(seeded_db)
    code = await _create(client, auth_header)
    await _guest(client, code)
    await client.post(f"/api/games/{code}/start", headers=auth_header)
    state = (await client.get(f"/api/games/{code}", headers=auth_header)).json()
    await client.post(
        f"/api/games/{code}/answer", headers=auth_header,
        json={"scanned_species": state["current_clue"]["plant_name_nl"]})

    await client.post(f"/api/games/{code}/leave", headers=auth_header)

    for _ in range(5):
        await client.post(f"/api/games/{code}/next", headers=auth_header)
    final = (await client.get(f"/api/games/{code}", headers=auth_header)).json()
    assert all(r["answered_count"] == 0 for r in final["round_stats"])


@pytest.mark.asyncio
async def test_the_last_player_cannot_leave(client, seeded_db, auth_header, no_embeds):
    """A hunt with nobody in it has no rounds to grade and no scoreboard."""
    await _world(seeded_db)
    code = await _create(client, auth_header)

    resp = await client.post(f"/api/games/{code}/leave", headers=auth_header)

    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_stepping_back_in_is_the_same_door(
    client, seeded_db, auth_header, no_embeds
):
    await _world(seeded_db)
    code = await _create(client, auth_header)
    await _guest(client, code)
    await client.post(f"/api/games/{code}/leave", headers=auth_header)

    resp = await client.post(f"/api/games/{code}/join", headers=auth_header)

    assert resp.json()["my_player_id"] is not None


# ── Speed bonus ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_finding_it_early_is_worth_more_than_finding_it_late(
    client, seeded_db, auth_header, no_embeds
):
    """Rank alone separates first from second by ten points out of a hundred
    and fifty, which nobody can feel. The clock is what makes it a race."""
    from datetime import timedelta
    from routers import game as g

    await _world(seeded_db)
    code = await _create(client, auth_header, pacing="race", round_seconds=60)
    await _guest(client, code)
    await client.post(f"/api/games/{code}/start", headers=auth_header)
    state = (await client.get(f"/api/games/{code}", headers=auth_header)).json()
    target = state["current_clue"]["plant_name_nl"]

    quick = await client.post(
        f"/api/games/{code}/answer", headers=auth_header,
        json={"scanned_species": target})

    assert quick.json()["speed_bonus"] > 0
    assert quick.json()["points_awarded"] == 150 + quick.json()["speed_bonus"]

    # The same find, most of the round later, is worth the base only.
    await seeded_db.execute(
        "UPDATE game_rounds SET started_at = ? WHERE session_id = 1 AND round_index = 0",
        (g._now() - timedelta(seconds=120),))
    await seeded_db.commit()
    guest2 = await _guest(client, code, name="Laatkomer")
    late = await client.post(
        f"/api/games/{code}/answer", headers=guest2,
        json={"scanned_species": target})

    assert late.json()["speed_bonus"] == 0, "the clock ran out; nothing left to win"


@pytest.mark.asyncio
async def test_a_host_paced_round_has_no_clock_to_race(
    client, seeded_db, auth_header, no_embeds
):
    """Timing someone against a round the host ends by hand would score the
    host's attention span, not the player's speed."""
    await _world(seeded_db)
    code = await _create(client, auth_header, pacing="host")
    await _guest(client, code)
    await client.post(f"/api/games/{code}/start", headers=auth_header)
    state = (await client.get(f"/api/games/{code}", headers=auth_header)).json()

    resp = await client.post(
        f"/api/games/{code}/answer", headers=auth_header,
        json={"scanned_species": state["current_clue"]["plant_name_nl"]})

    assert resp.json()["speed_bonus"] == 0
    assert resp.json()["points_awarded"] == 150


# ── Variety and speed ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_a_new_game_avoids_the_plants_the_last_one_used(
    client, seeded_db, auth_header, no_embeds
):
    """`random.sample` has no memory. With eight photo-ready plants and three
    rounds the chance of a repeat next game is 82% — fair dice that still feel
    broken. Six plants, two games: the second must reuse none of the first."""
    await create_game_schema(seeded_db)
    await seed_map(seeded_db, 10, "Garden", "outdoor")
    await seed_plants(seeded_db, 10, [101, 102, 103, 104, 105, 106])
    ids = [101, 102, 103, 104, 105, 106]

    async def play() -> set[str]:
        resp = await client.post("/api/games", headers=auth_header, json={
            "map_ids": [10], "plant_ids": ids, "clue_mode": "name", "round_count": 3})
        code = resp.json()["join_code"]
        state = (await client.get(f"/api/games/{code}", headers=auth_header)).json()
        return {r["plant_name_nl"] for r in state["rounds"]}

    first = await play()
    second = await play()

    assert len(first) == 3 and len(second) == 3
    assert first & second == set(), "the previous hunt's plants should sit this one out"


@pytest.mark.asyncio
async def test_a_pool_too_small_to_avoid_repeats_still_starts(
    client, seeded_db, auth_header, no_embeds
):
    """A repeat is a mild disappointment; refusing to start ends the party."""
    await _world(seeded_db)  # exactly three plants
    ids = [101, 102, 103]

    for _ in range(2):
        resp = await client.post("/api/games", headers=auth_header, json={
            "map_ids": [10], "plant_ids": ids, "clue_mode": "name"})
        assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_a_scan_embeds_the_photo_once_not_twice(
    client, seeded_db, auth_header, monkeypatch
):
    """The worker returns an embedding for the photo it just identified. Posting
    the same image back to /embed-image made the GPU do it again — and both
    calls queue behind one lock, so it doubled every guest's wait."""
    await _world(seeded_db)
    code = await _create(client, auth_header)
    await client.post(f"/api/games/{code}/start", headers=auth_header)

    from routers.plant_id import IdentifyResponse

    async def fake_identify(images, db, lang="nl", household_id=None):
        return IdentifyResponse(
            candidates=[], confidence="no_match", low_confidence=True,
            source="bioclip", query_embedding_bytes=b"\x00" * 2048,
        )

    extra_embeds = []

    async def loud_embed(_b):
        extra_embeds.append("embed")
        return None

    monkeypatch.setattr("routers.plant_id._bioclip_identify", fake_identify)
    monkeypatch.setattr(game_router, "_embed_bytes", loud_embed)

    resp = await client.post(
        f"/api/games/{code}/scan", headers=auth_header,
        files={"image": ("x.jpg", b"jpegbytes", "image/jpeg")},
    )

    assert resp.status_code == 200, resp.text
    assert extra_embeds == [], "identify already paid for this embedding"


@pytest.mark.asyncio
async def test_the_second_embed_still_happens_when_identify_gives_nothing(
    client, seeded_db, auth_header, monkeypatch
):
    """The optimisation must not cost us the embedding on the PlantNet path or
    against a worker too old to send one."""
    await _world(seeded_db)
    code = await _create(client, auth_header)
    await client.post(f"/api/games/{code}/start", headers=auth_header)

    async def no_identify(images, db, lang="nl", household_id=None):
        return None

    called = []

    async def counting_embed(_b):
        called.append("embed")
        return None

    monkeypatch.setattr("routers.plant_id._bioclip_identify", no_identify)
    monkeypatch.setattr(game_router, "_embed_bytes", counting_embed)

    await client.post(
        f"/api/games/{code}/scan", headers=auth_header,
        files={"image": ("x.jpg", b"jpegbytes", "image/jpeg")},
    )

    assert called == ["embed"], "no embedding from identify means we must fetch one"


@pytest.mark.asyncio
async def test_missing_references_are_embedded_concurrently(
    client, seeded_db, auth_header, monkeypatch
):
    """Fifteen plants with no stored embedding used to mean fifteen worker
    round-trips one after another while the host watched a spinner."""
    import asyncio as aio

    await _world(seeded_db)
    in_flight = 0
    peak = 0

    async def slow_embed(_url):
        nonlocal in_flight, peak
        in_flight += 1
        peak = max(peak, in_flight)
        await aio.sleep(0.02)
        in_flight -= 1
        return None

    monkeypatch.setattr(game_router, "_embed_url", slow_embed)
    monkeypatch.setattr(game_router, "_embed_bytes", lambda _b: _none())

    resp = await client.post("/api/games", headers=auth_header, json={
        "map_ids": [10], "plant_ids": [101, 102, 103], "clue_mode": "name"})

    assert resp.status_code == 201, resp.text
    assert peak > 1, "the live embeds should overlap, not queue"


async def _none():
    return None
