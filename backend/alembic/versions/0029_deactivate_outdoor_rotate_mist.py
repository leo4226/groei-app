"""deactivate rotate/mist care schedules for outdoor plants

Rotate and mist only make sense for indoor plants — outdoor plants (in the
ground or in containers) never need them. The read-time warning pipeline
already suppresses these care types for outdoor plants, but stale
``care_schedules`` rows lingered from before the plant-creation guard, so the
underlying data was inconsistent. This one-off backfill deactivates them so
the stored data matches the rules.

Idempotent: only flips rows that are still active.

Revision ID: 0029
Revises: 0028
"""
from alembic import op

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE care_schedules
        SET is_active = FALSE
        WHERE care_type IN ('rotate', 'mist')
          AND is_active = TRUE
          AND plant_id IN (
            SELECT p.id
            FROM plants p
            LEFT JOIN maps m ON p.map_id = m.id
            WHERE COALESCE(m.map_type, 'outdoor') <> 'indoor'
          )
        """
    )


def downgrade() -> None:
    # Data-only cleanup — deactivated schedules are intentionally left off.
    pass
