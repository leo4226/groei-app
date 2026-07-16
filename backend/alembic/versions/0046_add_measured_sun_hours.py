"""add measured_sun_hours column to plants

Revision ID: 0046
Revises: 0045

A per-plant manual override for the sun-hours used in sun-fit scoring. When set,
the plant's fit is judged against this measured value instead of the modelled
heatmap sun at its position, and the UI labels it "measured". NULL = use the
modelled value (the default for every existing plant).
"""
from alembic import op

revision = "0046"
down_revision = "0045"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE plants ADD COLUMN measured_sun_hours REAL")


def downgrade() -> None:
    op.execute("ALTER TABLE plants DROP COLUMN measured_sun_hours")
