"""add password_reset_tokens table

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-20
"""
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE password_reset_tokens (
            id          SERIAL PRIMARY KEY,
            account_id  INTEGER NOT NULL REFERENCES accounts(id),
            token       TEXT    NOT NULL UNIQUE,
            expires_at  TIMESTAMP NOT NULL,
            used_at     TIMESTAMP
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS password_reset_tokens")
