"""Add durable household account roles.

Existing households receive one deterministic owner: the earliest account by
`created_at`, then lowest account id. Every other existing account remains an
editor, which preserves the current collaborative editing behaviour. New
accounts default to editor as least privilege; registration explicitly creates
the initial owner.

Revision ID: 0074
Revises: 0073
Create Date: 2026-08-16
"""
from alembic import op

revision = "0074"
down_revision = "0073"
branch_labels = None
depends_on = None


ROLE_CHECK_NAME = "accounts_role_check"
OWNER_INDEX_NAME = "uq_accounts_one_owner_per_household"


def upgrade() -> None:
    # Add without a default first so the backfill can distinguish the existing
    # rows that must receive their deterministic owner/editor roles.
    op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS role TEXT")

    op.execute(
        """
        WITH ranked_accounts AS (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY household_id
                       ORDER BY created_at ASC NULLS LAST, id ASC
                   ) AS household_position
              FROM accounts
        )
        UPDATE accounts AS account
           SET role = CASE
                          WHEN ranked_accounts.household_position = 1 THEN 'owner'
                          ELSE 'editor'
                      END
          FROM ranked_accounts
         WHERE account.id = ranked_accounts.id
           AND account.role IS NULL
        """
    )

    # Future overlooked account creation paths must not gain management access.
    op.execute("ALTER TABLE accounts ALTER COLUMN role SET DEFAULT 'editor'")
    op.execute("ALTER TABLE accounts ALTER COLUMN role SET NOT NULL")

    # PostgreSQL does not support ADD CONSTRAINT IF NOT EXISTS. The catalog
    # guard makes a deploy retry safe if a later migration step had failed.
    op.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                  FROM pg_constraint
                 WHERE conname = '{ROLE_CHECK_NAME}'
                   AND conrelid = 'accounts'::regclass
            ) THEN
                ALTER TABLE accounts
                    ADD CONSTRAINT {ROLE_CHECK_NAME}
                    CHECK (role IN ('owner', 'editor', 'viewer'));
            END IF;
        END
        $$;
        """
    )

    # The backfill produces one owner per populated household. Keep that
    # invariant for later role-management work without allowing two owners.
    op.execute(
        f"""
        CREATE UNIQUE INDEX IF NOT EXISTS {OWNER_INDEX_NAME}
            ON accounts(household_id)
         WHERE role = 'owner'
        """
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {OWNER_INDEX_NAME}")
    op.execute(f"ALTER TABLE accounts DROP CONSTRAINT IF EXISTS {ROLE_CHECK_NAME}")
    op.execute("ALTER TABLE accounts DROP COLUMN IF EXISTS role")
