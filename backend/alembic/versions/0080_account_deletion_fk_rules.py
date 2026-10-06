"""Give every foreign key to users/accounts a delete rule.

Eleven of them had none (NO ACTION), so deleting an account failed outright as
soon as any of its rows existed: a single care-log entry (`care_log.done_by`
was also NOT NULL, so it could not even be cleared first), a game it hosted or
played, a garden-wide watering it ticked off, a reset link it requested. The
admin delete and the household "remove member" flow both hit this in prod.

Two kinds of rule, by what the row is:
- history the household keeps (care log, schedules, garden logs, garden-wide
  operations): ON DELETE SET NULL, so the record stays and only the name goes;
- rows that only meant something for that account (reset links, PlantNet
  quota, invites it created, its games and game seats): ON DELETE CASCADE.

Constraint names are looked up rather than assumed, so an environment whose
constraints were named differently still converges on the same rules.

Revision ID: 0080
Revises: 0079
Create Date: 2026-10-06
"""
from alembic import op

revision = "0080"
down_revision = "0079"
branch_labels = None
depends_on = None


# (table, column, referenced table, delete rule)
RULES = [
    ("care_log", "done_by", "users", "SET NULL"),
    ("care_schedules", "last_done_by", "users", "SET NULL"),
    ("garden_water_log", "watered_by", "users", "SET NULL"),
    ("garden_fertilize_log", "fertilized_by", "users", "SET NULL"),
    ("garden_care_operations", "completed_by", "users", "SET NULL"),
    ("garden_care_operation_members", "previous_last_done_by", "users", "SET NULL"),
    ("password_reset_tokens", "account_id", "accounts", "CASCADE"),
    ("plantnet_quota", "account_id", "accounts", "CASCADE"),
    ("household_invites", "created_by", "accounts", "CASCADE"),
    ("game_sessions", "host_account_id", "accounts", "CASCADE"),
    ("game_players", "account_id", "accounts", "CASCADE"),
]


def _set_rule(table: str, column: str, ref: str, rule: str) -> None:
    # Drop whatever single-column FK sits on table.column, then add it back
    # under the conventional name with the wanted rule.
    op.execute(f"""
        DO $$
        DECLARE con record;
        BEGIN
            IF to_regclass('{table}') IS NULL THEN
                RETURN;
            END IF;
            FOR con IN
                SELECT c.conname
                FROM pg_constraint c
                JOIN pg_attribute a
                  ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
                WHERE c.contype = 'f'
                  AND c.conrelid = '{table}'::regclass
                  AND array_length(c.conkey, 1) = 1
                  AND a.attname = '{column}'
            LOOP
                EXECUTE format('ALTER TABLE {table} DROP CONSTRAINT %I', con.conname);
            END LOOP;
            ALTER TABLE {table}
                ADD CONSTRAINT {table}_{column}_fkey
                FOREIGN KEY ({column}) REFERENCES {ref}(id) ON DELETE {rule};
        END $$;
    """)


def upgrade() -> None:
    # Care history stays when its author's account goes; it just loses the name.
    op.execute("ALTER TABLE care_log ALTER COLUMN done_by DROP NOT NULL")
    for table, column, ref, rule in RULES:
        _set_rule(table, column, ref, rule)


def downgrade() -> None:
    for table, column, ref, _ in RULES:
        _set_rule(table, column, ref, "NO ACTION")
    # Fails if a deleted account's care history is left without an author;
    # assign those rows to someone before downgrading.
    op.execute("ALTER TABLE care_log ALTER COLUMN done_by SET NOT NULL")
