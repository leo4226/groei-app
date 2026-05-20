"""add is_locked column to plants

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-20
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE plants ADD COLUMN is_locked BOOLEAN DEFAULT FALSE")


def downgrade() -> None:
    op.execute("ALTER TABLE plants DROP COLUMN is_locked")
