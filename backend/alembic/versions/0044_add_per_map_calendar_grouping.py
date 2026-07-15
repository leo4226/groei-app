"""add per-map Calendar grouping rules

Revision ID: 0044
Revises: 0043
Create Date: 2026-07-15
"""
from alembic import op


revision = "0044"
down_revision = "0043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS household_calendar_grouping_rules (
            household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
            map_id INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
            care_type TEXT NOT NULL,
            PRIMARY KEY (household_id, map_id, care_type)
        )
    """)
    op.execute(
        "ALTER TABLE garden_care_operation_members "
        "ADD COLUMN applied_next_due DATE"
    )
    op.execute(
        "ALTER TABLE garden_care_operation_members "
        "ADD COLUMN applied_last_done TIMESTAMP"
    )
    # Existing care_types × map_ids preferences are interpreted as per-map rules
    # by the service until the household next saves. This avoids PostgreSQL-only
    # JSON expansion in the migration and preserves the exact legacy meaning.


def downgrade() -> None:
    op.execute(
        "ALTER TABLE garden_care_operation_members "
        "DROP COLUMN applied_last_done"
    )
    op.execute(
        "ALTER TABLE garden_care_operation_members "
        "DROP COLUMN applied_next_due"
    )
    op.execute("DROP TABLE IF EXISTS household_calendar_grouping_rules")
