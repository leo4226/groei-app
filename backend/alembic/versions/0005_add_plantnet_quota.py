"""add plantnet_quota table for daily per-account rate limiting

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-22
"""
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE plantnet_quota (
            account_id  INTEGER NOT NULL REFERENCES accounts(id),
            date        TEXT    NOT NULL,
            count       INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (account_id, date)
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS plantnet_quota")
