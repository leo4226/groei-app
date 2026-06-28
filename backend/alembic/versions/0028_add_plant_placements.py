"""add plant_placements table (secondary placements for one plant)

Revision ID: 0028
Revises: 0027
"""
from alembic import op

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS plant_placements (
            id SERIAL PRIMARY KEY,
            plant_id INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
            map_id INTEGER NOT NULL,
            map_x DOUBLE PRECISION NOT NULL,
            map_y DOUBLE PRECISION NOT NULL,
            ground_zone_id TEXT,
            phase TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_plant_placements_map_id ON plant_placements(map_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_plant_placements_plant_id ON plant_placements(plant_id)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS plant_placements")
