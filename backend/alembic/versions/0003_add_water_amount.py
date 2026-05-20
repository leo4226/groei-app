"""add water_amount to garden_water_log

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-20
"""
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE garden_water_log ADD COLUMN water_amount DOUBLE PRECISION")


def downgrade() -> None:
    op.execute("ALTER TABLE garden_water_log DROP COLUMN water_amount")
