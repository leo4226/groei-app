"""add per-plant mulch flag (mulch pressure factor #799)

The #441 audit flagged mulch as the only water-pressure factor with no data
model: the engine could not know a plant is mulched. This adds a nullable
boolean so the pressure engine can lower evaporation-driven demand for
mulched outdoor plants. NULL = unknown (treated as bare/neutral), FALSE =
explicitly bare, TRUE = mulched.

Revision ID: 0066
Revises: 0065
Create Date: 2026-08-07
"""
from alembic import op

revision = "0066"
down_revision = "0065"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE plants ADD COLUMN IF NOT EXISTS mulch BOOLEAN")


def downgrade() -> None:
    op.execute("ALTER TABLE plants DROP COLUMN IF EXISTS mulch")
