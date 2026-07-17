"""log plant identification calls for admin metrics

Revision ID: 0050
Revises: 0049
"""
from alembic import op

revision = "0050"
down_revision = "0049"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS identify_log (
            id            SERIAL PRIMARY KEY,
            account_id    INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
            household_id  INTEGER REFERENCES households(id) ON DELETE CASCADE,
            engine        TEXT NOT NULL,
            outcome       TEXT,
            created_at    TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_identify_log_created ON identify_log(created_at)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_identify_log_household ON identify_log(household_id, created_at)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS identify_log")
