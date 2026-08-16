"""Add intended role to household invites.

Every invite now carries the role the joining account will get (editor or
viewer). Existing unused and historical invites are backfilled as editor so
old codes retain the access level they implied before roles existed — and no
old row becomes an owner by accident.

Revision ID: 0075
Revises: 0074
Create Date: 2026-08-16

"""
from alembic import op

revision = "0075"
down_revision = "0074"
branch_labels = None
depends_on = None


ROLE_CHECK_NAME = "household_invites_role_check"


def upgrade() -> None:
    # Add without a default first so the backfill can distinguish existing
    # rows that must keep their pre-role access level (editor).
    op.execute("ALTER TABLE household_invites ADD COLUMN IF NOT EXISTS role TEXT")

    op.execute(
        "UPDATE household_invites SET role = 'editor' WHERE role IS NULL"
    )

    # Future invite-creation paths that forget the role must not gain owner
    # powers; editor is the least-surprising historical default.
    op.execute("ALTER TABLE household_invites ALTER COLUMN role SET DEFAULT 'editor'")
    op.execute("ALTER TABLE household_invites ALTER COLUMN role SET NOT NULL")

    # An invite must never be able to mint an owner; constrain it at the row.
    op.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                  FROM pg_constraint
                 WHERE conname = '{ROLE_CHECK_NAME}'
                   AND conrelid = 'household_invites'::regclass
            ) THEN
                ALTER TABLE household_invites
                    ADD CONSTRAINT {ROLE_CHECK_NAME}
                    CHECK (role IN ('editor', 'viewer'));
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute(f"ALTER TABLE household_invites DROP CONSTRAINT IF EXISTS {ROLE_CHECK_NAME}")
    op.execute("ALTER TABLE household_invites DROP COLUMN IF EXISTS role")
