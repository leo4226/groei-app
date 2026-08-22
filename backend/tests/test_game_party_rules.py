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
