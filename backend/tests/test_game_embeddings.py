import base64
import struct
from datetime import datetime

import pytest

from routers import game as game_router


def _embedding_b64(values: list[float]) -> str:
    padded = values + [0.0] * (512 - len(values))
    return base64.b64encode(struct.pack("512f", *padded)).decode()


async def _create_game_schema(db) -> None:
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


@pytest.mark.asyncio
async def test_create_game_stores_best_effort_reference_embeddings(
    seeded_db,
    client,
    auth_header,
    monkeypatch,
):
    await _create_game_schema(seeded_db)
    await seeded_db.execute(
        "INSERT INTO maps (id, name, map_type, household_id) VALUES (10, 'Garden', 'outdoor', 1)"
    )
    await seeded_db.execute(
        "INSERT INTO plant_species (id, common_name_nl, common_name_en, latin_name) VALUES (7, 'Gatenplant', 'Swiss cheese plant', 'Monstera deliciosa')"
    )
    for plant_id, photo_path in [
        (101, "https://r2.test/plant-101.jpg"),
        (102, "https://r2.test/plant-102.jpg"),
        (103, None),
    ]:
        await seeded_db.execute(
            """INSERT INTO plants (id, name, map_id, photo_path, is_active, species_id)
               VALUES (?, 'Plant', 10, ?, 1, 7)""",
            (plant_id, photo_path),
        )
    await seeded_db.commit()

    embedded_urls: list[str] = []

    async def fake_embed_url(url: str) -> str | None:
        embedded_urls.append(url)
        return f"embedded:{url}" if url else None

    monkeypatch.setattr(game_router, "_embed_url", fake_embed_url)

    response = await client.post(
        "/api/games",
        headers=auth_header,
        json={"map_id": 10, "plant_ids": [101, 102, 103], "clue_mode": "photo"},
    )

    assert response.status_code == 201
    rounds = await seeded_db.execute_fetchall(
        "SELECT plant_id, target_embedding FROM game_rounds ORDER BY round_index"
    )
    assert [row["plant_id"] for row in rounds] == [101, 102, 103]
    assert rounds[0]["target_embedding"] == "embedded:https://r2.test/plant-101.jpg"
    assert rounds[1]["target_embedding"] == "embedded:https://r2.test/plant-102.jpg"
    assert rounds[2]["target_embedding"] is None
    assert embedded_urls == [
        "https://r2.test/plant-101.jpg",
        "https://r2.test/plant-102.jpg",
        "",
    ]


@pytest.mark.asyncio
async def test_answer_accepts_embedding_match_when_species_name_does_not_match(
    seeded_db,
    client,
    auth_header,
    monkeypatch,
):
    await _create_game_schema(seeded_db)
    target_embedding = _embedding_b64([1.0, 0.0, 0.0])
    scan_embedding = _embedding_b64([0.99, 0.01, 0.0])
    monkeypatch.setattr(game_router, "_EMBED_THRESHOLD", 0.82)

    async def fake_embed_bytes(image_bytes: bytes) -> str:
        assert image_bytes == b"scan image"
        return scan_embedding

    monkeypatch.setattr(game_router, "_embed_bytes", fake_embed_bytes)

    await seeded_db.execute(
        """INSERT INTO game_sessions
           (id, join_code, host_account_id, map_id, status, current_round, created_at, clue_mode)
           VALUES (1, 'ABC123', 1, 10, 'active', 0, ?, 'photo')""",
        (datetime(2026, 6, 26, 12, 0, 0),),
    )
    await seeded_db.execute(
        "INSERT INTO game_players (id, session_id, account_id, score) VALUES (1, 1, 1, 0)"
    )
    await seeded_db.execute(
        """INSERT INTO game_rounds
           (id, session_id, round_index, plant_id, plant_name_nl, plant_name_en,
            target_species, clue_photo_url, started_at, target_embedding)
           VALUES (1, 1, 0, 101, 'Gatenplant', 'Swiss cheese plant',
                   'Monstera deliciosa', 'https://r2.test/plant.jpg', NULL, ?)""",
        (target_embedding,),
    )
    await seeded_db.commit()

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
    assert response.json() == {"is_correct": True, "points_awarded": 100}
    players = await seeded_db.execute_fetchall("SELECT score FROM game_players WHERE id = 1")
    assert players[0]["score"] == 100
    answers = await seeded_db.execute_fetchall(
        "SELECT scanned_species, is_correct, points_awarded FROM game_answers"
    )
    assert answers == [
        {"scanned_species": "Ficus lyrata", "is_correct": 1, "points_awarded": 100}
    ]


@pytest.mark.asyncio
async def test_answer_keeps_species_name_fallback_without_embedding(
    seeded_db,
    client,
    auth_header,
    monkeypatch,
):
    await _create_game_schema(seeded_db)

    async def fail_if_called(_image_bytes: bytes) -> str:
        raise AssertionError("Embedding worker should not be called without a reference embedding")

    monkeypatch.setattr(game_router, "_embed_bytes", fail_if_called)
    await seeded_db.execute(
        """INSERT INTO game_sessions
           (id, join_code, host_account_id, map_id, status, current_round, created_at, clue_mode)
           VALUES (1, 'OLD123', 1, 10, 'active', 0, ?, 'photo')""",
        (datetime(2026, 6, 26, 12, 0, 0),),
    )
    await seeded_db.execute(
        "INSERT INTO game_players (id, session_id, account_id, score) VALUES (1, 1, 1, 0)"
    )
    await seeded_db.execute(
        """INSERT INTO game_rounds
           (id, session_id, round_index, plant_id, plant_name_nl, plant_name_en,
            target_species, clue_photo_url, started_at, target_embedding)
           VALUES (1, 1, 0, 101, 'Gatenplant', 'Swiss cheese plant',
                   'Monstera deliciosa', NULL, NULL, NULL)"""
    )
    await seeded_db.commit()

    response = await client.post(
        "/api/games/OLD123/answer",
        headers=auth_header,
        json={"scanned_species": "monstera deliciosa", "confidence": 0.9},
    )

    assert response.status_code == 200
    assert response.json() == {"is_correct": True, "points_awarded": 100}
