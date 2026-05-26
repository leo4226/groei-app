"""drop plants.ground_zone_id FK constraint (zone IDs come from editor, not relational)

Zone IDs like "zone_3_1779276913973" are generated client-side by the editor
and synced to the ground_zones table only on map-save. If a user drags a plant
onto a zone before saving, the FK constraint causes a server 500 crash.

The canonical zone data is in maps.canvas_data; ground_zones is a helper
table. This FK is a false constraint — it causes more harm than good.

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-25
"""
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Drop FK constraint — zone IDs are editor-generated and may not exist
    #    in ground_zones at drop time (see docstring).
    op.execute(
        "ALTER TABLE plants DROP CONSTRAINT plants_ground_zone_id_fkey"
    )
    # 2. Clean up any orphaned ground_zone_ids that reference non-existent zones
    op.execute(
        """UPDATE plants
           SET ground_zone_id = NULL
           WHERE ground_zone_id IS NOT NULL
             AND ground_zone_id NOT IN (SELECT id FROM ground_zones)"""
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE plants ADD CONSTRAINT plants_ground_zone_id_fkey "
        "FOREIGN KEY (ground_zone_id) REFERENCES ground_zones(id)"
    )
