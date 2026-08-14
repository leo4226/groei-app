"""Shared sqlite schema + seed helpers for the garden-game tests.

The game tables were duplicated verbatim in every game test file, which meant a
migration touched three copies. They live here instead; the schema mirrors
`alembic/versions/0019` through `0072`.
"""

import base64
import struct

GAME_SCHEMA = """
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
    clue_mode TEXT NOT NULL DEFAULT 'photo',
    pacing TEXT NOT NULL DEFAULT 'host',
    round_seconds INTEGER
);
CREATE TABLE game_session_maps (
    session_id INTEGER NOT NULL,
    map_id INTEGER NOT NULL,
    PRIMARY KEY (session_id, map_id)
);
CREATE TABLE game_players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    account_id INTEGER,
    score INTEGER NOT NULL DEFAULT 0,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    display_name TEXT,
    is_guest BOOLEAN NOT NULL DEFAULT FALSE,
    guest_secret TEXT,
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
    target_genus TEXT,
    clue_photo_url TEXT,
    clue_hint_nl TEXT,
    clue_hint_en TEXT,
    started_at TIMESTAMP,
    ends_at TIMESTAMP,
    target_embedding TEXT,
    target_embeddings TEXT,
    map_id INTEGER,
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
    finish_rank INTEGER,
    UNIQUE (round_id, player_id)
);
CREATE TABLE plant_species (
    id INTEGER PRIMARY KEY,
    common_name_nl TEXT,
    common_name_en TEXT,
    latin_name TEXT
);
CREATE TABLE plant_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plant_id INTEGER NOT NULL,
    household_id INTEGER,
    r2_key TEXT,
    url TEXT,
    note TEXT,
    taken_at TEXT,
    care_log_id INTEGER,
    embedding BLOB
);
CREATE TABLE user_confirmed_embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    species_id INTEGER,
    embedding BLOB,
    source_account_id INTEGER,
    source_photo_url TEXT,
    source_plant_id INTEGER
);
"""


def embedding_bytes(values: list[float]) -> bytes:
    """Raw float32[512] with `values` in the leading slots."""
    padded = values + [0.0] * (512 - len(values))
    return struct.pack("512f", *padded)


def embedding_b64(values: list[float]) -> str:
    return base64.b64encode(embedding_bytes(values)).decode()


async def create_game_schema(db) -> None:
    await db.executescript(GAME_SCHEMA)
    # conftest's minimal maps table has no slug, but the state query selects it.
    try:
        await db.execute("ALTER TABLE maps ADD COLUMN slug TEXT")
    except Exception:
        pass
    await db.commit()


async def seed_map(db, map_id: int, name: str, map_type: str = "outdoor") -> None:
    await db.execute(
        "INSERT INTO maps (id, name, map_type, household_id, slug) VALUES (?, ?, ?, 1, ?)",
        (map_id, name, map_type, name.lower().replace(" ", "-")),
    )


async def seed_plants(
    db, map_id: int, ids: list[int], species_id: int | None = None
) -> list[int]:
    for plant_id in ids:
        await db.execute(
            """INSERT INTO plants (id, name, map_id, photo_path, is_active, species_id)
               VALUES (?, ?, ?, ?, 1, ?)""",
            (plant_id, f"Plant {plant_id}", map_id,
             f"https://r2.test/profile-{plant_id}.jpg", species_id),
        )
    await db.commit()
    return ids


async def seed_game_world(db, plant_count: int = 6) -> list[int]:
    """Game schema + one outdoor map with N photo-bearing plants."""
    await create_game_schema(db)
    await seed_map(db, 10, "Garden")
    return await seed_plants(db, 10, list(range(101, 101 + plant_count)))
