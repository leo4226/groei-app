"""add reverse-geocoded place columns to plant_discoveries (veldgids phase 2)

Revision ID: 0038
Revises: 0037
"""
from alembic import op

revision = "0038"
down_revision = "0037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Filled by Nominatim at save time; existing rows backfill opportunistically
    # when the journal is listed (see routers/discoveries.py).
    op.execute("ALTER TABLE plant_discoveries ADD COLUMN IF NOT EXISTS place_name TEXT")
    op.execute("ALTER TABLE plant_discoveries ADD COLUMN IF NOT EXISTS country_code TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE plant_discoveries DROP COLUMN IF EXISTS place_name")
    op.execute("ALTER TABLE plant_discoveries DROP COLUMN IF EXISTS country_code")
