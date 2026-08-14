"""re-sync accounts.language from the user profiles (#889)

Migration 0041 added `accounts.language` and backfilled it from the matching
user profile. Nothing kept it in step afterwards: the language switch in
Settings calls `PATCH /users/{id}/language`, which wrote `users.language` only.

So the column has been drifting since 0041 for anyone who changed language, and
the two notification channels disagreed about the same person — push read the
stale `accounts.language` (Dutch forever), email read `users.language` through
a subquery (correct).

#889 makes `accounts.language` the single source for both and teaches the
language endpoint to write it. This re-runs 0041's backfill once so the column
is true at the moment it starts being trusted — without it, a user who switched
to English after 0041 would keep their correct English email and then *lose* it.

Same matching rule as 0041: an account is the profile with its name, in its
household.

Revision ID: 0071
Revises: 0070
Create Date: 2026-08-14
"""
from alembic import op

revision = "0071"
down_revision = "0070"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE accounts
        SET language = (
            SELECT u.language FROM users u
            WHERE u.household_id = accounts.household_id
              AND LOWER(u.name) = LOWER(accounts.name)
              AND u.language IS NOT NULL
            ORDER BY u.id
            LIMIT 1
        )
        WHERE EXISTS (
            SELECT 1 FROM users u
            WHERE u.household_id = accounts.household_id
              AND LOWER(u.name) = LOWER(accounts.name)
              AND u.language IS NOT NULL
        )
        """
    )
    op.execute("UPDATE accounts SET language = 'nl' WHERE language IS NULL")


def downgrade() -> None:
    # Data-only re-sync; the previous values were stale by definition, so there
    # is nothing worth restoring.
    pass
