"""Game creation: round-count sampling + logbook quiz mode.

- `round_count` lets the host pick how many questions after "select all":
  the backend randomly samples that many of the (validated) selected plants.
- `clue_mode='logbook'` builds clues from random plant_photos (logbook) shots,
  falling back to the profile photo, and skips embedding generation entirely
  (quiz answers are taps, not camera scans).
"""
import pytest

from routers import game as game_router
from tests.game_world import seed_game_world as _seed_game_world


@pytest.fixture
def no_embeds(monkeypatch):
    """Record embed calls; game creation must not need a live worker."""
    calls: list[str] = []

    async def fake_embed_url(url: str) -> str | None:
        calls.append(url)
        return None

    monkeypatch.setattr(game_router, "_embed_url", fake_embed_url)
    return calls


async def test_round_count_samples_subset(client, seeded_db, auth_header, no_embeds):
    ids = await _seed_game_world(seeded_db, plant_count=6)

    resp = await client.post(
        "/api/games",
        headers=auth_header,
        json={"map_id": 10, "plant_ids": ids, "clue_mode": "photo", "round_count": 4},
    )
    assert resp.status_code == 201, resp.text

    rounds = await seeded_db.execute_fetchall(
        "SELECT plant_id, round_index FROM game_rounds ORDER BY round_index"
    )
    assert len(rounds) == 4
    assert [r["round_index"] for r in rounds] == [0, 1, 2, 3]
    assert set(r["plant_id"] for r in rounds) <= set(ids)


async def test_round_count_clamped_to_selection_and_cap(client, seeded_db, auth_header, no_embeds):
    ids = await _seed_game_world(seeded_db, plant_count=6)

    # Asking for more rounds than plants just uses every plant once.
    resp = await client.post(
        "/api/games",
        headers=auth_header,
        json={"map_id": 10, "plant_ids": ids, "round_count": 99},
    )
    assert resp.status_code == 201, resp.text
    rounds = await seeded_db.execute_fetchall("SELECT plant_id FROM game_rounds")
    assert len(rounds) == 6


async def test_select_all_large_selection_allowed(client, seeded_db, auth_header, no_embeds):
    # 20 plants selected (over the old max-10 limit) + a round cap → fine now.
    ids = await _seed_game_world(seeded_db, plant_count=20)
    resp = await client.post(
        "/api/games",
        headers=auth_header,
        json={"map_id": 10, "plant_ids": ids, "round_count": 5},
    )
    assert resp.status_code == 201, resp.text
    rounds = await seeded_db.execute_fetchall("SELECT id FROM game_rounds")
    assert len(rounds) == 5


async def test_logbook_mode_uses_logbook_photo_with_fallback(client, seeded_db, auth_header, no_embeds):
    ids = await _seed_game_world(seeded_db, plant_count=3)
    # Only the first plant has logbook photos; the others must fall back to
    # their profile photo.
    await seeded_db.execute(
        "INSERT INTO plant_photos (plant_id, url) VALUES (?, 'https://r2.test/logbook-101.jpg')",
        (ids[0],),
    )
    await seeded_db.commit()

    resp = await client.post(
        "/api/games",
        headers=auth_header,
        json={"map_id": 10, "plant_ids": ids, "clue_mode": "logbook"},
    )
    assert resp.status_code == 201, resp.text

    rounds = await seeded_db.execute_fetchall(
        "SELECT plant_id, clue_photo_url, target_embeddings FROM game_rounds ORDER BY plant_id"
    )
    by_plant = {r["plant_id"]: dict(r) for r in rounds}
    assert by_plant[ids[0]]["clue_photo_url"] == "https://r2.test/logbook-101.jpg"
    assert by_plant[ids[1]]["clue_photo_url"] == f"https://r2.test/profile-{ids[1]}.jpg"

    # Quiz answers are taps, not scans — no embeddings generated at all.
    assert no_embeds == []
    assert all(r["target_embeddings"] is None for r in rounds)

    # The session advertises the mode so clients render the quiz UI.
    session = (await seeded_db.execute_fetchall(
        "SELECT clue_mode FROM game_sessions"))[0]
    assert session["clue_mode"] == "logbook"


async def test_quiz_answer_by_plant_name_awards_points(client, seeded_db, auth_header, no_embeds):
    """A logbook-quiz tap submits the chosen plant *name*; the existing
    species-matching accepts it against plant_name_nl/en."""
    ids = await _seed_game_world(seeded_db, plant_count=3)
    resp = await client.post(
        "/api/games",
        headers=auth_header,
        json={"map_id": 10, "plant_ids": ids, "clue_mode": "logbook"},
    )
    code = resp.json()["join_code"]

    # Start the game (host is auto-joined as a player).
    resp = await client.post(f"/api/games/{code}/start", headers=auth_header)
    assert resp.status_code == 200, resp.text
    state = resp.json()
    correct_name = state["current_clue"]["plant_name_nl"]

    resp = await client.post(
        f"/api/games/{code}/answer",
        headers=auth_header,
        json={"scanned_species": correct_name},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["is_correct"] is True
    assert body["points_awarded"] >= 100
