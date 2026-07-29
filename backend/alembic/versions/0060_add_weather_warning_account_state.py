"""add per-account weather warning state

Revision ID: 0060
Revises: 0059
"""
from alembic import op

revision = "0060"
down_revision = "0059"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # New empty table only: no backfill or existing-table rewrite.
    op.execute("""
        CREATE TABLE weather_warning_account_state (
            account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            warning_id TEXT NOT NULL,
            care_type TEXT NOT NULL,
            forecast_date DATE NOT NULL,
            severity TEXT NOT NULL,
            acknowledged_at TIMESTAMP,
            push_sent_at TIMESTAMP,
            PRIMARY KEY (account_id, warning_id),
            CONSTRAINT ck_weather_warning_state_care_type
                CHECK (care_type IN ('frost_protect', 'heat_protect')),
            CONSTRAINT ck_weather_warning_state_severity
                CHECK (severity IN ('warning', 'urgent'))
        )
    """)
    op.execute("""
        CREATE INDEX ix_weather_warning_state_forecast_date
        ON weather_warning_account_state (forecast_date)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS weather_warning_account_state")
