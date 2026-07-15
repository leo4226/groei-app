"""add reversible Water Care-rhythm planning

Revision ID: 0045
Revises: 0044
Create Date: 2026-07-15
"""
from alembic import op


revision = "0045"
down_revision = "0044"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE care_rhythm_operations (
            id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
            household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
            previous_config TEXT NOT NULL,
            applied_config TEXT NOT NULL,
            preview_hash TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            undone_at TIMESTAMP
        )
    """)
    op.execute("""
        CREATE TABLE household_care_rhythm_preferences (
            household_id INTEGER PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
            indoor_weekdays TEXT NOT NULL,
            outdoor_weekdays TEXT NOT NULL,
            last_operation_id INTEGER REFERENCES care_rhythm_operations(id) ON DELETE SET NULL
        )
    """)
    op.execute("""
        CREATE TABLE map_care_rhythm_overrides (
            household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
            map_id INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
            weekdays TEXT NOT NULL,
            PRIMARY KEY (household_id, map_id)
        )
    """)
    op.execute("""
        CREATE TABLE care_rhythm_operation_members (
            operation_id INTEGER NOT NULL REFERENCES care_rhythm_operations(id) ON DELETE CASCADE,
            schedule_id INTEGER NOT NULL REFERENCES care_schedules(id) ON DELETE CASCADE,
            previous_next_due DATE NOT NULL,
            applied_next_due DATE NOT NULL,
            previous_rhythm_operation_id INTEGER REFERENCES care_rhythm_operations(id) ON DELETE SET NULL,
            previous_last_done TIMESTAMP,
            previous_last_done_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            PRIMARY KEY (operation_id, schedule_id)
        )
    """)
    op.execute(
        "ALTER TABLE care_schedules "
        "ADD COLUMN rhythm_opt_out BOOLEAN NOT NULL DEFAULT FALSE"
    )
    op.execute(
        "ALTER TABLE care_schedules "
        "ADD COLUMN rhythm_operation_id INTEGER "
        "REFERENCES care_rhythm_operations(id) ON DELETE SET NULL"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE care_schedules DROP COLUMN rhythm_operation_id")
    op.execute("ALTER TABLE care_schedules DROP COLUMN rhythm_opt_out")
    op.execute("DROP TABLE care_rhythm_operation_members")
    op.execute("DROP TABLE map_care_rhythm_overrides")
    op.execute("DROP TABLE household_care_rhythm_preferences")
    op.execute("DROP TABLE care_rhythm_operations")
