"""drop global UNIQUE constraint on users.name

Revision ID: 0025
Revises: 0024
"""
from alembic import op

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # users.name was globally unique, which blocks two households from having a
    # member with the same first name (e.g. "Sam"). Names only need to be unique
    # within a household, and for now we rely on convention rather than a DB
    # constraint for that weaker requirement.
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_name_key")


def downgrade() -> None:
    op.execute("ALTER TABLE users ADD CONSTRAINT users_name_key UNIQUE (name)")
