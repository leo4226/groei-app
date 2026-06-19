"""add is_admin flag to accounts.

Revision ID: 0018
Revises: 0017
"""
import sqlalchemy as sa
from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE accounts ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE")

    # Seed the current production admin once. Runtime authorization reads only
    # accounts.is_admin, so future admin changes are normal DB updates.
    current_admin_email = "leon_korbee" + "@hotmail.com"
    result = op.get_bind().execute(
        sa.text("UPDATE accounts SET is_admin = TRUE WHERE email = :email"),
        {"email": current_admin_email},
    )
    if result.rowcount != 1:
        raise RuntimeError(
            "Expected to seed exactly one admin account while adding accounts.is_admin"
        )


def downgrade() -> None:
    op.execute("ALTER TABLE accounts DROP COLUMN is_admin")
