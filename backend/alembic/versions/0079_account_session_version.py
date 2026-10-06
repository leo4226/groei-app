"""Let a password change end the account's other sessions.

Tokens last 30 days and nothing on the account could revoke them, so a reset
after a stolen phone left the thief signed in for up to a month. Every token
now carries the account's `session_version` (claim `sv`); a password change or
reset bumps it, and a token whose `sv` no longer matches is refused.

Tokens issued before this migration carry no `sv` and are read as 0, which is
the default here, so the deploy itself signs nobody out.

Revision ID: 0079
Revises: 0078
Create Date: 2026-10-06
"""
from alembic import op

revision = "0079"
down_revision = "0078"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE accounts "
        "ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE accounts DROP COLUMN IF EXISTS session_version")
