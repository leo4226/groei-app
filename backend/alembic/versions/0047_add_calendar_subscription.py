"""add private personal-calendar subscriptions

Revision ID: 0047
Revises: 0046
"""
from alembic import op

revision = "0047"
down_revision = "0046"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE calendar_subscriptions (
            id BIGSERIAL PRIMARY KEY,
            account_id INTEGER NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
            household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
            token_hash CHAR(64) NOT NULL UNIQUE,
            config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            revoked_at TIMESTAMPTZ
        )
    """)
    op.execute("CREATE INDEX calendar_subscriptions_household_idx ON calendar_subscriptions(household_id)")


def downgrade() -> None:
    op.execute("DROP TABLE calendar_subscriptions")
