"""add photo_url to weed_sightings

Revision ID: 0033
Revises: 0032
Create Date: 2026-07-07
"""
from alembic import op

revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE weed_sightings ADD COLUMN photo_url TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE weed_sightings DROP COLUMN photo_url")
