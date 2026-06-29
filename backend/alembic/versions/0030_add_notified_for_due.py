"""add notified_for_due to care_schedules

Real-time care push (#295). Tracks the `next_due` value a schedule was last
push-notified for, so the hourly dispatch sends one push per due cycle when a
task becomes due — not every hour, and not only at the daily digest hour.
Completing a task advances `next_due`, which no longer equals
`notified_for_due`, so the next due date notifies afresh.

Revision ID: 0030
Revises: 0029
Create Date: 2026-06-29
"""
from alembic import op

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE care_schedules ADD COLUMN notified_for_due DATE")


def downgrade() -> None:
    op.execute("ALTER TABLE care_schedules DROP COLUMN IF EXISTS notified_for_due")
