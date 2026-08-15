"""Give `users` a real foreign key to `accounts`, and merge the duplicates.

`accounts` and `users` are two id spaces for the same person. Nothing linked
them but a matching `name`, and migration 0025 dropped the UNIQUE constraint on
`users.name` — so a household could hold several rows for one person and every
piece of code bridging the two had to guess which one it meant. That guessing
produced, in order: the settings page removing the wrong member, a member
listed twice with the same email, and a self-check that could miss your own
duplicate row.

This closes it. After this migration `users.account_id` is the link, one row per
account, enforced by a unique index. Name is just a label again.

The merge keeps history rather than dropping it: every column referencing
`users(id)` is repointed at the surviving row before its duplicates are
deleted. The surviving row is the *oldest* per account, which is the one care
history was attributed to before the duplicates appeared.

Rows with no matching account (a member removed at the account level but left
behind in `users`, or seed data) keep `account_id = NULL` and are left alone —
deleting them would cascade into care history for no good reason.

Revision ID: 0073
Revises: 0072
Create Date: 2026-08-15

"""
from alembic import op

revision = "0073"
down_revision = "0072"
branch_labels = None
depends_on = None


#: Every column that points at users(id). Missing one here would orphan history
#: when its duplicate row is deleted, so this list is the load-bearing part of
#: the migration.
USER_REFERENCES = [
    ("care_log", "done_by"),
    ("care_schedules", "last_done_by"),
    ("garden_water_log", "watered_by"),
    ("garden_fertilize_log", "fertilized_by"),
    ("garden_care_operations", "completed_by"),
    ("garden_care_operations", "previous_last_done_by"),
    ("care_rhythm_operations", "previous_last_done_by"),
]


def upgrade() -> None:
    op.execute(
        "ALTER TABLE users ADD COLUMN account_id INTEGER "
        "REFERENCES accounts(id) ON DELETE CASCADE"
    )

    # 1. Link each users row to the account sharing its (household_id, name).
    #    This is the last time the name is used to bridge the two tables.
    op.execute("""
        UPDATE users u
           SET account_id = a.id
          FROM accounts a
         WHERE a.household_id = u.household_id
           AND a.name = u.name
           AND u.account_id IS NULL
    """)

    # 2. Repoint every reference from a duplicate onto the surviving row.
    for table, column in USER_REFERENCES:
        op.execute(f"""
            UPDATE {table} t
               SET {column} = keep.keep_id
              FROM (
                    SELECT id, FIRST_VALUE(id) OVER (
                             PARTITION BY account_id ORDER BY id
                           ) AS keep_id
                      FROM users
                     WHERE account_id IS NOT NULL
                   ) keep
             WHERE t.{column} = keep.id
               AND t.{column} <> keep.keep_id
        """)

    # 3. Drop the now-unreferenced duplicates, keeping the oldest per account.
    op.execute("""
        DELETE FROM users
         WHERE account_id IS NOT NULL
           AND id <> (SELECT MIN(u2.id) FROM users u2
                       WHERE u2.account_id = users.account_id)
    """)

    # 4. One users row per account, from here on enforced rather than assumed.
    #    Partial index so the unlinked legacy rows from step 1 stay legal.
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_account_id "
        "ON users(account_id) WHERE account_id IS NOT NULL"
    )


def downgrade() -> None:
    # The merged duplicates are not recoverable; only the column goes back.
    op.execute("DROP INDEX IF EXISTS uq_users_account_id")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS account_id")
