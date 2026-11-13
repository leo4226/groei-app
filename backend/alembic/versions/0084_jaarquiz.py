"""Jaarquiz: a ranking quiz for a group of friends (floreren.app/jaarquiz).

Two new tables, nothing existing is touched. See routers/jaarquiz.py.

- `jaarquiz` holds the one quiz: its invite code, its config (people, photos,
  questions, as JSON text — kept out of the public repo) and whether the
  results are revealed.
- `jaarquiz_responses` holds one row per claimed name. Only the SHA-256 of the
  participant's token is stored; UNIQUE (quiz_id, voter) makes a name
  first-come.

Revision ID: 0084
Revises: 0083
Create Date: 2026-11-13

"""
from alembic import op

revision = "0084"
down_revision = "0083"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS jaarquiz (
            id INTEGER PRIMARY KEY,
            join_code TEXT NOT NULL UNIQUE,
            config TEXT NOT NULL,
            revealed BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS jaarquiz_responses (
            id SERIAL PRIMARY KEY,
            quiz_id INTEGER NOT NULL REFERENCES jaarquiz(id) ON DELETE CASCADE,
            voter TEXT NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            answers TEXT NOT NULL DEFAULT '{}',
            done BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
            UNIQUE (quiz_id, voter)
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS jaarquiz_responses")
    op.execute("DROP TABLE IF EXISTS jaarquiz")
