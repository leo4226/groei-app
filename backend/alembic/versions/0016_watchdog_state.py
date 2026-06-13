"""watchdog dead-man's switch state (single row).

Revision ID: 0016
Revises: 0015
"""
from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE watchdog_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            last_heartbeat TIMESTAMP,
            summary TEXT,
            outage_alerted BOOLEAN NOT NULL DEFAULT FALSE
        )
        """
    )
    op.execute("INSERT INTO watchdog_state (id) VALUES (1)")


def downgrade() -> None:
    op.execute("DROP TABLE watchdog_state")
