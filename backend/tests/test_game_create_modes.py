"""Game creation: round-count sampling + logbook quiz mode.

- `round_count` lets the host pick how many questions after "select all":
  the backend randomly samples that many of the (validated) selected plants.
- `clue_mode='logbook'` builds clues from random plant_photos (logbook) shots,
  falling back to the profile photo, and skips embedding generation entirely
  (quiz answers are taps, not camera scans).
"""
import pytest

from routers import game as game_router


async def _create_game_schema(db) -> None:
    """Game tables (mirrors test_game_embeddings — cross-test imports don't resolve)."""
    await db.executescript(
        """
        CREATE TABLE game_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            join_code TEXT NOT NULL UNIQUE,
            host_account_id INTEGER NOT NULL,
            map_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'waiting',
            current_round INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP,
            started_at TIMESTAMP,
            finished_at TIMESTAMP,
            clue_mode TEXT NOT NULL DEFAULT 'photo'
        );
        CREATE TABLE game_players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            score INTEGER NOT NULL DEFAULT 0,
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (session_id, account_id)
        );
        CREATE TABLE game_rounds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            round_index INTEGER NOT NULL,
            plant_id INTEGER NOT NULL,
            plant_name_nl TEXT NOT NULL,
            plant_name_en TEXT,
            target_species TEXT NOT NULL,
            clue_photo_url TEXT,
            clue_hint_nl TEXT,
            clue_hint_en TEXT,
            started_at TIMESTAMP,
            target_embedding TEXT,
            UNIQUE (session_id, round_index)
        );
        CREATE TABLE game_answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            round_id INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            scanned_species TEXT NOT NULL,
            is_correct BOOLEAN NOT NULL,
            points_awarded INTEGER NOT NULL DEFAULT 0,
            answered_at TIMESTAMP NOT NULL,
            UNIQUE (round_id, player_id)
        );
        CREATE TABLE plant_species (
            id INTEGER PRIMARY KEY,
            common_name_nl TEXT,
            common_name_en TEXT,
            latin_name TEXT
        );
        """
    )
    await db.commit()


async def _seed_game_world(db, plant_count: int = 6) -> list[int]:
    """Game schema + an outdoor map with N photo-bearing plants. Returns ids."""
    await _create_game_schema(db)
    await db.executescript(
        """
        CREATE TABLE plant_photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plant_id INTEGER NOT NULL,
            household_id INTEGER,
            r2_key TEXT,
            url TEXT,
            note TEXT,
            taken_at TEXT,
            care_log_id INTEGER
        );
        """
    )
    # conftest's minimal maps table has no slug, but _build_state selects it.
    await db.execute("ALTER TABLE maps ADD COLUMN slug TEXT")
    await db.execute(
        "INSERT INTO maps (id, name, map_type, household_id, slug) VALUES (10, 'Garden', 'outdoor', 1, 'garden')"
    )
    ids = list(range(101, 101 + plant_count))
    for plant_id in ids:
        await db.execute(
            """INSERT INTO plants (id, name, map_id, photo_path, is_active)
               VALUES (?, ?, 10, ?, 1)""",
            (plant_id, f"Plant {plant_id}", f"https://r2.test/profile-{plant_id}.jpg"),
        )
    await db.commit()
    return ids


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
        "SELECT plant_id, clue_photo_url, target_embedding FROM game_rounds ORDER BY plant_id"
    )
    by_plant = {r["plant_id"]: dict(r) for r in rounds}
    assert by_plant[ids[0]]["clue_photo_url"] == "https://r2.test/logbook-101.jpg"
    assert by_plant[ids[1]]["clue_photo_url"] == f"https://r2.test/profile-{ids[1]}.jpg"

    # Quiz answers are taps, not scans — no embeddings generated at all.
    assert no_embeds == []
    assert all(r["target_embedding"] is None for r in rounds)

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
