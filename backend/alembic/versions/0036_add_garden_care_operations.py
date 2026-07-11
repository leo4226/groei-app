"""add reversible grouped outdoor care operations

Revision ID: 0036
Revises: 0035
Create Date: 2026-07-10
"""

from alembic import op


revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE garden_care_operations (
            id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
            household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
            care_type TEXT NOT NULL,
            completed_at DATE NOT NULL,
            completed_by INTEGER REFERENCES users(id),
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            undone_at TIMESTAMP
        )
    """)
    op.execute("""
        CREATE TABLE garden_care_operation_members (
            operation_id INTEGER NOT NULL REFERENCES garden_care_operations(id) ON DELETE CASCADE,
            schedule_id INTEGER NOT NULL REFERENCES care_schedules(id) ON DELETE CASCADE,
            previous_next_due DATE NOT NULL,
            previous_last_done TIMESTAMP,
            previous_last_done_by INTEGER REFERENCES users(id),
            care_log_id INTEGER REFERENCES care_log(id),
            PRIMARY KEY (operation_id, schedule_id)
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE garden_care_operation_members")
    op.execute("DROP TABLE garden_care_operations")
