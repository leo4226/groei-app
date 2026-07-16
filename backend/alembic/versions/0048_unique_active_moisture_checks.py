"""enforce one active ephemeral moisture check per plant

Revision ID: 0048
Revises: 0047
"""
from alembic import op

revision = "0048"
down_revision = "0047"
branch_labels = None
depends_on = None


_INDEX_NAME = "uq_care_schedules_active_ephemeral_moisture_check"


def upgrade() -> None:
    op.execute(f"""
        CREATE UNIQUE INDEX IF NOT EXISTS {_INDEX_NAME}
        ON care_schedules (plant_id)
        WHERE is_ephemeral = 1
          AND is_active = TRUE
          AND care_type = 'moisture_check'
    """)


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {_INDEX_NAME}")
