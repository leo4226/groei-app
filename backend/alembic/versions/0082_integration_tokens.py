"""Read-only integration tokens for personal dashboards (LAveren).

A local dashboard pulls one snapshot of the household from
`GET /api/integrations/snapshot`. It must not hold the owner's password or a
30-day login token (which a password change ends without warning), so it gets
its own long-lived, revocable bearer token instead. Only the SHA-256 of the
token is stored, like `calendar_subscriptions`.

`session_version` is the account's value when the token was made: a password
change or reset bumps the account's, which retires the token too. Someone who
learned the password and minted a token loses it at the reset.

`scope` is 'read' (snapshot + map thumbnails) or 'care' (also: mark a care
task done, as the token's account). A scope is fixed at creation; a wider one
means a new token, so a read-only token can never start writing.

Revision ID: 0082
Revises: 0081
Create Date: 2026-11-01
"""
from alembic import op

revision = "0082"
down_revision = "0081"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS integration_tokens (
            id SERIAL PRIMARY KEY,
            account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            -- Last characters of the raw token, so a list can tell two apart.
            token_hint TEXT NOT NULL,
            scope TEXT NOT NULL DEFAULT 'read' CHECK (scope IN ('read', 'care')),
            session_version INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_used_at TIMESTAMP,
            revoked_at TIMESTAMP
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_integration_tokens_account "
        "ON integration_tokens (account_id) WHERE revoked_at IS NULL"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS integration_tokens")
