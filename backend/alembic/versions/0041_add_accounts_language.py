"""add language column to accounts

Revision ID: 0041
Revises: 0040
"""
from alembic import op

revision = "0041"
down_revision = "0040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""ALTER TABLE accounts ADD COLUMN language TEXT DEFAULT 'nl'""")

    # Backfill language from matching user profile (same logic as send_due_digests)
    op.execute("""
        UPDATE accounts
        SET language = (
            SELECT u.language FROM users u
            WHERE u.household_id = accounts.household_id
              AND LOWER(u.name) = LOWER(accounts.name)
            ORDER BY u.id
            LIMIT 1
        )
    """)

    # Ensure no nulls for orphan accounts without a matching user
    op.execute("UPDATE accounts SET language = 'nl' WHERE language IS NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE accounts DROP COLUMN language")
