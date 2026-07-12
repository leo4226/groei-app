"""add language column to accounts

Revision ID: 0041
Revises: 0039
"""
from alembic import op

revision = "0041"
# Originally revised 0040; that id was renumbered away while untangling the
# duplicate-revision incident (#593/#594), so this now chains directly off 0039.
# Only DBs sitting exactly at the removed id would notice; prod is past this.
down_revision = "0039"
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
