"""add push_subscriptions + push prefs columns

Web push v2 (#139). One subscription row per browser/device; dead endpoints
(404/410 from the push service) are pruned at send time. push_enabled and
last_push_sent_on extend notification_preferences — push and email stamp
independently so one channel failing never blocks the other.

See docs/plans/2026-06-11-web-push-design.md.

Revision ID: 0015
Revises: 0014
Create Date: 2026-06-11
"""
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE push_subscriptions (
            id          SERIAL PRIMARY KEY,
            account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            endpoint    TEXT NOT NULL UNIQUE,
            p256dh      TEXT NOT NULL,
            auth        TEXT NOT NULL,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    op.execute(
        "ALTER TABLE notification_preferences ADD COLUMN push_enabled BOOLEAN NOT NULL DEFAULT FALSE"
    )
    op.execute(
        "ALTER TABLE notification_preferences ADD COLUMN last_push_sent_on DATE"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE notification_preferences DROP COLUMN IF EXISTS last_push_sent_on")
    op.execute("ALTER TABLE notification_preferences DROP COLUMN IF EXISTS push_enabled")
    op.execute("DROP TABLE IF EXISTS push_subscriptions")
