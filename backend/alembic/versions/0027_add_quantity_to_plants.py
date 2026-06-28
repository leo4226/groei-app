"""add quantity column to plants

Revision ID: 0027
Revises: 0026
"""
from alembic import op

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE plants ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE plants DROP COLUMN IF EXISTS quantity")
