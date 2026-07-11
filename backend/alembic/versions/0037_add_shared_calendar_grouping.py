"""add shared Calendar grouping preferences

Revision ID: 0037
Revises: 0036
Create Date: 2026-07-11
"""
from alembic import op


revision = "0037"
down_revision = "0036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE household_calendar_grouping_preferences (
            household_id INTEGER PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
            care_types TEXT NOT NULL,
            map_ids TEXT NOT NULL
        )
    """)
    op.execute("""
        ALTER TABLE garden_care_operations
        ADD COLUMN map_id INTEGER REFERENCES maps(id) ON DELETE SET NULL
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE garden_care_operations DROP COLUMN map_id")
    op.execute("DROP TABLE household_calendar_grouping_preferences")
