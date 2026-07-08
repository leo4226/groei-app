"""add household_id to garden_water_log and garden_fertilize_log

Revision ID: 0034
Revises: 0033
Create Date: 2026-07-08
"""
from alembic import op

revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add household_id columns (nullable first, then backfill)
    op.execute("ALTER TABLE garden_water_log ADD COLUMN household_id INTEGER REFERENCES households(id)")
    op.execute("ALTER TABLE garden_fertilize_log ADD COLUMN household_id INTEGER REFERENCES households(id)")

    # Backfill existing rows to Leon's household (id=1)
    op.execute("UPDATE garden_water_log SET household_id = 1 WHERE household_id IS NULL")
    op.execute("UPDATE garden_fertilize_log SET household_id = 1 WHERE household_id IS NULL")

    # Add indexes for per-household DESC queries
    op.execute("CREATE INDEX idx_garden_water_log_household_watered ON garden_water_log (household_id, watered_at DESC)")
    op.execute("CREATE INDEX idx_garden_fertilize_log_household_fertilized ON garden_fertilize_log (household_id, fertilized_at DESC)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_garden_fertilize_log_household_fertilized")
    op.execute("DROP INDEX IF EXISTS idx_garden_water_log_household_watered")
    op.execute("ALTER TABLE garden_fertilize_log DROP COLUMN household_id")
    op.execute("ALTER TABLE garden_water_log DROP COLUMN household_id")
