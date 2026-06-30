"""add snoozed_until to care_schedules

Care-push snooze (#181). When a user taps "remind me in 2h / tomorrow" on a
care notification, the schedule's `snoozed_until` is set so the real-time
dispatch suppresses re-notification until that moment, then notifies afresh.

Revision ID: 0032
Revises: 0031
Create Date: 2026-06-30
"""
from alembic import op

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE care_schedules ADD COLUMN snoozed_until TIMESTAMP")


def downgrade() -> None:
    op.execute("ALTER TABLE care_schedules DROP COLUMN IF EXISTS snoozed_until")
