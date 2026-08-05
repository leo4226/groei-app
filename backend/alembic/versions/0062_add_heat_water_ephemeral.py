"""enforce one active ephemeral heat-water row per plant

Revision ID: 0061
Revises: 0060
"""
from alembic import op

revision = "0062"
down_revision = "0061"
branch_labels = None
depends_on = None


_INDEX_NAME = "uq_care_schedules_active_ephemeral_heat_water"


def upgrade() -> None:
    op.execute(f"""
        CREATE UNIQUE INDEX IF NOT EXISTS {_INDEX_NAME}
        ON care_schedules (plant_id)
        WHERE is_ephemeral = 1
          AND is_active = TRUE
          AND care_type = 'water'
    """)


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {_INDEX_NAME}")
