"""add garden game tables.

Revision ID: 0019
Revises: 0018
"""
import sqlalchemy as sa
from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE game_sessions (
            id              SERIAL PRIMARY KEY,
            join_code       VARCHAR(6) NOT NULL UNIQUE,
            host_account_id INTEGER NOT NULL REFERENCES accounts(id),
            map_id          INTEGER NOT NULL REFERENCES maps(id),
            status          VARCHAR(20) NOT NULL DEFAULT 'waiting',
            current_round   INTEGER NOT NULL DEFAULT 0,
            created_at      TIMESTAMP NOT NULL DEFAULT now(),
            started_at      TIMESTAMP,
            finished_at     TIMESTAMP
        )
    """)

    op.execute("""
        CREATE TABLE game_players (
            id          SERIAL PRIMARY KEY,
            session_id  INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
            account_id  INTEGER NOT NULL REFERENCES accounts(id),
            score       INTEGER NOT NULL DEFAULT 0,
            joined_at   TIMESTAMP NOT NULL DEFAULT now(),
            UNIQUE (session_id, account_id)
        )
    """)

    op.execute("""
        CREATE TABLE game_rounds (
            id              SERIAL PRIMARY KEY,
            session_id      INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
            round_index     INTEGER NOT NULL,
            plant_id        INTEGER NOT NULL REFERENCES plants(id),
            plant_name_nl   TEXT NOT NULL,
            plant_name_en   TEXT,
            target_species  TEXT NOT NULL,
            clue_photo_url  TEXT,
            clue_hint_nl    TEXT,
            clue_hint_en    TEXT,
            started_at      TIMESTAMP,
            UNIQUE (session_id, round_index)
        )
    """)

    op.execute("""
        CREATE TABLE game_answers (
            id              SERIAL PRIMARY KEY,
            round_id        INTEGER NOT NULL REFERENCES game_rounds(id) ON DELETE CASCADE,
            player_id       INTEGER NOT NULL REFERENCES game_players(id) ON DELETE CASCADE,
            scanned_species TEXT NOT NULL,
            is_correct      BOOLEAN NOT NULL,
            points_awarded  INTEGER NOT NULL DEFAULT 0,
            answered_at     TIMESTAMP NOT NULL DEFAULT now(),
            UNIQUE (round_id, player_id)
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS game_answers")
    op.execute("DROP TABLE IF EXISTS game_rounds")
    op.execute("DROP TABLE IF EXISTS game_players")
    op.execute("DROP TABLE IF EXISTS game_sessions")
