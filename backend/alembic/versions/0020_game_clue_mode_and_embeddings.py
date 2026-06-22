"""game: add clue_mode to sessions and target_embedding to rounds

Revision ID: 0020
Revises: 0019
Create Date: 2026-06-22

"""
from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE game_sessions ADD COLUMN clue_mode VARCHAR(10) NOT NULL DEFAULT 'photo'"
    )
    op.execute(
        "ALTER TABLE game_rounds ADD COLUMN target_embedding TEXT"
    )


def downgrade() -> None:
    # Postgres doesn't support DROP COLUMN easily in older Alembic — handled manually if needed
    pass
