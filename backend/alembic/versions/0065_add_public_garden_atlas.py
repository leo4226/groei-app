"""add public garden atlas flags to maps

Revision ID: 0065
Revises: 0064
"""
from alembic import op

revision = "0065"
down_revision = "0064"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Public-garden atlas opt-in: explicit, default-off (see
    # docs/plans/2026-05-27-public-gardens-and-biodiversity.md).
    op.execute("ALTER TABLE maps ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE")
    # Separate photo-sharing opt-in: map photos stay private unless the owner
    # opts in to sharing them on the public atlas.
    op.execute("ALTER TABLE maps ADD COLUMN IF NOT EXISTS photos_public BOOLEAN NOT NULL DEFAULT FALSE")
    # Reverse-geocoded city/region label (Nominatim, same source as
    # plant_discoveries.place_name) so the atlas can filter by city without
    # exposing exact GPS.
    op.execute("ALTER TABLE maps ADD COLUMN IF NOT EXISTS place_name TEXT")
    op.execute("ALTER TABLE maps ADD COLUMN IF NOT EXISTS country_code TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE maps DROP COLUMN IF EXISTS place_name")
    op.execute("ALTER TABLE maps DROP COLUMN IF EXISTS country_code")
    op.execute("ALTER TABLE maps DROP COLUMN IF EXISTS photos_public")
    op.execute("ALTER TABLE maps DROP COLUMN IF EXISTS is_public")
