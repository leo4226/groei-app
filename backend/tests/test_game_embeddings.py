"""Photo-similarity grading in the garden game.

A guest photographing the right plant from the wrong angle should still score,
so the round carries *every* stored embedding of the target plant (owner-
confirmed anchors first, then logbook photos) and grades against the best
match. Name matching stays the primary signal; embeddings are the rescue.
"""
from datetime import datetime

import pytest

from routers import game as game_router
from tests.game_world import (
    create_game_schema,
    embedding_b64,
    embedding_bytes,
    seed_map,
    seed_plants,
)


async def _active_round(db, code: str, target_embeddings: str | None, **kwargs) -> None:
    """One active session on round 0 with the host as player 1."""
    await seed_map(db, 10, "Garden")
    await db.execute(
        """INSERT INTO game_sessions
           (id, join_code, host_account_id, map_id, status, current_round, created_at,
            clue_mode, pacing)
           VALUES (1, ?, 1, 10, 'active', 0, ?, 'photo', 'host')""",
        (code, datetime(2026, 8, 14, 12, 0, 0)),
    )
    await db.execute("INSERT INTO game_session_maps (session_id, map_id) VALUES (1, 10)")
    await db.execute(
        "INSERT INTO game_players (id, session_id, account_id, score) VALUES (1, 1, 1, 0)"
    )
    await db.execute(
        """INSERT INTO game_rounds
           (id, session_id, round_index, plant_id, plant_name_nl, plant_name_en,
            target_species, target_genus, clue_photo_url, started_at, target_embeddings, map_id)
           VALUES (1, 1, 0, 101, ?, ?, ?, ?, 'https://r2.test/plant.jpg', NULL, ?, 10)""",
        (
            kwargs.get("name_nl", "Gatenplant"),
            kwargs.get("name_en", "Swiss cheese plant"),
            kwargs.get("target", "Monstera deliciosa"),
            kwargs.get("genus", "monstera"),
            target_embeddings,
        ),
    )
    await db.commit()


@pytest.mark.asyncio
async def test_create_game_stores_best_effort_reference_embeddings(
    seeded_db, client, auth_header, monkeypatch
):
    """Stored photo vectors are used directly — no worker round-trip needed.

    This is what keeps a game created while the BioCLIP box is asleep from
    silently losing its photo-matching rescue.
    """
    await create_game_schema(seeded_db)
    await seed_map(seeded_db, 10, "Garden")
    await seeded_db.execute(
        "INSERT INTO plant_species (id, common_name_nl, common_name_en, latin_name) "
        "VALUES (7, 'Gatenplant', 'Swiss cheese plant', 'Monstera deliciosa')"
    )
    await seed_plants(seeded_db, 10, [101, 102, 103], species_id=7)

    # Plant 101 has an owner-confirmed anchor, 102 a logbook photo, 103 nothing.
    await seeded_db.execute(
        "INSERT INTO user_confirmed_embeddings (species_id, embedding, source_plant_id) "
        "VALUES (7, ?, 101)",
        (embedding_bytes([1.0, 0.0, 0.0]),),
    )
    await seeded_db.execute(
        "INSERT INTO plant_photos (plant_id, url, taken_at, embedding) "
        "VALUES (102, 'https://r2.test/log-102.jpg', '2026-08-01', ?)",
        (embedding_bytes([0.0, 1.0, 0.0]),),
    )
    await seeded_db.commit()

    embedded_urls: list[str] = []

    async def fake_embed_url(url: str):
        embedded_urls.append(url)
        return None

    monkeypatch.setattr(game_router, "_embed_url", fake_embed_url)

    response = await client.post(
        "/api/games",
        headers=auth_header,
        json={"map_ids": [10], "plant_ids": [101, 102, 103], "clue_mode": "photo"},
    )
    assert response.status_code == 201, response.text

    rounds = await seeded_db.execute_fetchall(
        "SELECT plant_id, target_embeddings, target_genus FROM game_rounds ORDER BY plant_id"
    )
    assert [r["plant_id"] for r in rounds] == [101, 102, 103]
    # 101 and 102 got references from the DB; only 103 fell through to the worker.
    assert rounds[0]["target_embeddings"] is not None
    assert rounds[1]["target_embeddings"] is not None
    assert rounds[2]["target_embeddings"] is None
    assert embedded_urls == ["https://r2.test/profile-103.jpg"]
    # Genus is precomputed at create time so grading never has to re-parse.
    assert rounds[0]["target_genus"] == "monstera"


@pytest.mark.asyncio
async def test_answer_accepts_embedding_match_when_species_name_does_not_match(
    seeded_db, client, auth_header, monkeypatch
):
    await create_game_schema(seeded_db)
    monkeypatch.setattr(game_router, "_EMBED_THRESHOLD", 0.82)

    async def fake_embed_bytes(image_bytes: bytes) -> bytes:
        assert image_bytes == b"scan image"
        return embedding_bytes([0.99, 0.01, 0.0])

    monkeypatch.setattr(game_router, "_embed_bytes", fake_embed_bytes)

    # Two references: the scan resembles the second one only.
    references = f'["{embedding_b64([0.0, 0.0, 1.0])}", "{embedding_b64([1.0, 0.0, 0.0])}"]'
    await _active_round(seeded_db, "ABC123", references)

    response = await client.post(
        "/api/games/ABC123/answer",
        headers=auth_header,
        json={
            "scanned_species": "Ficus lyrata",
            "candidates": ["Ficus elastica"],
            "confidence": 0.12,
            "image_data_url": "data:image/jpeg;base64,c2NhbiBpbWFnZQ==",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["is_correct"] is True
    assert body["match_kind"] == "photo"
    # First finder in the round takes the full rank bonus.
    assert body["points_awarded"] == 150
    assert body["finish_rank"] == 1

    players = await seeded_db.execute_fetchall("SELECT score FROM game_players WHERE id = 1")
    assert players[0]["score"] == 150


@pytest.mark.asyncio
async def test_photo_match_rejects_an_unrelated_plant(
    seeded_db, client, auth_header, monkeypatch
):
    """The forgiving threshold must still say no to a genuinely wrong plant."""
    await create_game_schema(seeded_db)

    async def fake_embed_bytes(_image_bytes: bytes) -> bytes:
        return embedding_bytes([0.0, 0.0, 1.0])

    monkeypatch.setattr(game_router, "_embed_bytes", fake_embed_bytes)
    await _active_round(seeded_db, "NOPE12", f'["{embedding_b64([1.0, 0.0, 0.0])}"]')

    response = await client.post(
        "/api/games/NOPE12/answer",
        headers=auth_header,
        json={
            "scanned_species": "Ficus lyrata",
            "image_data_url": "data:image/jpeg;base64,c2NhbiBpbWFnZQ==",
        },
    )

    assert response.status_code == 200
    assert response.json()["is_correct"] is False


@pytest.mark.asyncio
async def test_answer_keeps_species_name_fallback_without_embedding(
    seeded_db, client, auth_header, monkeypatch
):
    await create_game_schema(seeded_db)

    async def fail_if_called(_image_bytes: bytes):
        raise AssertionError("No image was submitted; the worker must not be called")

    monkeypatch.setattr(game_router, "_embed_bytes", fail_if_called)
    await _active_round(seeded_db, "OLD123", None)

    response = await client.post(
        "/api/games/OLD123/answer",
        headers=auth_header,
        json={"scanned_species": "monstera deliciosa", "confidence": 0.9},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["is_correct"] is True
    assert body["match_kind"] == "exact"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "scanned,expected_kind",
    [
        # Author citation on the end — PlantNet does this constantly.
        ("Monstera deliciosa Liebm.", "exact"),
        # Genus right, species wrong: the most common near-miss in the field.
        ("Monstera adansonii", "genus"),
        # A cultivar epithet reduces to the bare genus.
        ("Monstera 'Thai Constellation'", "genus"),
        # The common name the app itself shows for this plant.
        ("Gatenplant", "common"),
        # A different genus entirely is still wrong.
        ("Ficus lyrata", None),
    ],
)
async def test_forgiving_name_grading(
    seeded_db, client, auth_header, monkeypatch, scanned, expected_kind
):
    """Standing at the right plant should score even when the ID is imprecise."""
    await create_game_schema(seeded_db)

    async def no_embed(_image_bytes: bytes):
        return None

    monkeypatch.setattr(game_router, "_embed_bytes", no_embed)
    await _active_round(seeded_db, "FORGIV", None)

    response = await client.post(
        "/api/games/FORGIV/answer",
        headers=auth_header,
        json={"scanned_species": scanned},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["is_correct"] is (expected_kind is not None)
    assert body["match_kind"] == expected_kind
