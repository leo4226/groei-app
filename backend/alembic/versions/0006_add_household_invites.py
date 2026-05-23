"""add household_invites table for invite-to-join flow

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-22
"""
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE household_invites (
            id              SERIAL PRIMARY KEY,
            household_id    INTEGER NOT NULL REFERENCES households(id),
            code            TEXT NOT NULL UNIQUE,
            created_by      INTEGER NOT NULL REFERENCES accounts(id),
            expires_at      TIMESTAMP NOT NULL,
            used_at         TIMESTAMP,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS household_invites")
