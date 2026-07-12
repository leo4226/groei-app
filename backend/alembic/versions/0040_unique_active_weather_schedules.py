"""enforce one active ephemeral weather schedule per plant and care type

Revision ID: 0040
Revises: 0039
"""
from alembic import op

revision = "0040"
down_revision = "0039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Old app machines keep serving during Fly's release command. Block their
    # writes for this short transaction so no duplicate can appear between the
    # cleanup and unique-index creation.
    if op.get_bind().dialect.name == "postgresql":
        op.execute("LOCK TABLE care_schedules IN SHARE MODE")

    # Keep the newest actionable row before adding the database invariant.
    op.execute("""
        WITH ranked AS (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY plant_id, care_type
                       ORDER BY id DESC
                   ) AS row_number
            FROM care_schedules
            WHERE is_ephemeral = 1
              AND is_active = TRUE
              AND care_type IN ('frost_protect', 'heat_protect')
        )
        UPDATE care_schedules
        SET is_active = FALSE
        WHERE id IN (
            SELECT id FROM ranked WHERE row_number > 1
        )
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_care_schedules_active_ephemeral_weather
        ON care_schedules (plant_id, care_type)
        WHERE is_ephemeral = 1
          AND is_active = TRUE
          AND care_type IN ('frost_protect', 'heat_protect')
    """)


def downgrade() -> None:
    # Deactivated duplicates remain inactive; reactivating them would recreate
    # stale Calendar tasks. Only the uniqueness rule is reversible.
    op.execute("DROP INDEX IF EXISTS uq_care_schedules_active_ephemeral_weather")
