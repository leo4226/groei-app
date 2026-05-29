"""Add sun_preference column to plant_species.

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-29
"""
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE plant_species ADD COLUMN sun_preference VARCHAR(16)"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE plant_species DROP COLUMN IF EXISTS sun_preference"
    )
