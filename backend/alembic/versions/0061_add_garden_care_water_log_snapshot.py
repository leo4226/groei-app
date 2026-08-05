"""add pre-round garden water log snapshot to care operations

Revision ID: 0061
Revises: 0060
"""
from alembic import op

revision = "0061"
down_revision = "0060"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Snapshot the household garden_water_log row that a water round
    # overwrites, so undo_outdoor_care can restore it. Nullable: older
    # operations have no snapshot (undo then removes the round's row).
    op.execute("ALTER TABLE garden_care_operations ADD COLUMN previous_watered_at DATE")
    op.execute("ALTER TABLE garden_care_operations ADD COLUMN previous_watered_by INTEGER")
    op.execute(
        "ALTER TABLE garden_care_operations ADD COLUMN previous_water_amount DOUBLE PRECISION"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE garden_care_operations DROP COLUMN previous_water_amount")
    op.execute("ALTER TABLE garden_care_operations DROP COLUMN previous_watered_by")
    op.execute("ALTER TABLE garden_care_operations DROP COLUMN previous_watered_at")
