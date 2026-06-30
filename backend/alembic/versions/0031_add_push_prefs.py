"""add quiet-hours + per-care-type push prefs

Web push v2.1 (#181). Three TEXT columns on notification_preferences:
- quiet_start / quiet_end ('HH:MM') — the quiet window in which care pushes
  are held. NULL = default 21:00–08:00.
- muted_care_types — comma-separated care_type keys the user has muted; an
  empty/NULL value mutes nothing.

TEXT (not the dormant quiet_hours JSONB) keeps one code path across asyncpg
(prod) and the aiosqlite test seam, mirroring digest_time.

Revision ID: 0031
Revises: 0030
Create Date: 2026-06-29
"""
from alembic import op

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE notification_preferences ADD COLUMN quiet_start TEXT")
    op.execute("ALTER TABLE notification_preferences ADD COLUMN quiet_end TEXT")
    op.execute("ALTER TABLE notification_preferences ADD COLUMN muted_care_types TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE notification_preferences DROP COLUMN IF EXISTS muted_care_types")
    op.execute("ALTER TABLE notification_preferences DROP COLUMN IF EXISTS quiet_end")
    op.execute("ALTER TABLE notification_preferences DROP COLUMN IF EXISTS quiet_start")
