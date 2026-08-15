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

The set of referencing columns is read out of the live catalog rather than
hardcoded. The first version of this migration carried a hand-written list and
aborted the production deploy on `column t.previous_last_done_by does not
exist`: the column lives on `garden_care_operation_members`, not
`garden_care_operations`, and the list had also missed
`garden_care_operations.previous_watered_by` entirely. A list like that is only
ever as current as the last person to remember it — asking `pg_constraint` is
not.

Every step is idempotent, so a deploy that fails later can be retried.

Revision ID: 0073
Revises: 0072
Create Date: 2026-08-15

"""
from alembic import op

revision = "0073"
down_revision = "0072"
branch_labels = None
depends_on = None


#: Columns holding a `users.id` without a declared foreign key, so the catalog
#: query below cannot see them. Only `previous_watered_by` (migration 0061,
#: added as a bare INTEGER) is in this position today. Anything added here must
#: also be guarded by the EXISTS check — the entry is a claim about a column
#: that may not exist in every database.
UNDECLARED_REFERENCES = [
    ("garden_care_operations", "previous_watered_by"),
]


def _undeclared_values_sql() -> str:
    rows = ", ".join(f"('{t}', '{c}')" for t, c in UNDECLARED_REFERENCES)
    return f"(VALUES {rows}) AS extra(tbl, col)"


def upgrade() -> None:
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS account_id INTEGER "
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
    #    Missing one here would orphan history when its duplicate is deleted,
    #    so the list comes from the database instead of from memory.
    op.execute(f"""
        DO $mig$
        DECLARE
            ref RECORD;
        BEGIN
            FOR ref IN
                    SELECT c.conrelid::regclass::text AS tbl, a.attname::text AS col
                      FROM pg_constraint c
                      JOIN unnest(c.conkey) AS k(attnum) ON TRUE
                      JOIN pg_attribute a
                        ON a.attrelid = c.conrelid AND a.attnum = k.attnum
                     WHERE c.contype = 'f'
                       AND c.confrelid = 'users'::regclass
                       AND c.conrelid <> 'users'::regclass
                UNION
                    SELECT extra.tbl, extra.col
                      FROM {_undeclared_values_sql()}
                     WHERE EXISTS (
                           SELECT 1 FROM information_schema.columns ic
                            WHERE ic.table_schema = current_schema()
                              AND ic.table_name = extra.tbl
                              AND ic.column_name = extra.col)
            LOOP
                EXECUTE format($sql$
                    UPDATE %s t
                       SET %I = keep.keep_id
                      FROM (
                            SELECT id, FIRST_VALUE(id) OVER (
                                     PARTITION BY account_id ORDER BY id
                                   ) AS keep_id
                              FROM users
                             WHERE account_id IS NOT NULL
                           ) keep
                     WHERE t.%I = keep.id
                       AND t.%I <> keep.keep_id
                $sql$, ref.tbl, ref.col, ref.col, ref.col);
            END LOOP;
        END
        $mig$;
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
