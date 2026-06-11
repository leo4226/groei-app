"""add notification_preferences table

Per-account daily digest settings (#137). One row per account, created
lazily on first read of GET /settings/notifications.

digest_time is TEXT 'HH:MM' rather than TIME: only the hour is used for
matching, and TEXT keeps one code path across asyncpg (prod) and the
aiosqlite test seam (which cannot bind datetime.time). quiet_hours is a
nullable JSONB placeholder for v2 push (see #116 design pass) — no
migration needed later.

Revision ID: 0013
Revises: 0012
Create Date: 2026-06-11
"""
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE notification_preferences (
            account_id          INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
            digest_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
            digest_time         TEXT NOT NULL DEFAULT '08:00',
            quiet_hours         JSONB,
            last_digest_sent_on DATE
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS notification_preferences")
