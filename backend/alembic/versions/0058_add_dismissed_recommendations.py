"""add dismissed_recommendations (learn-from-dismissals)

Lets a gardener wave off a plant suggestion ("niet voor mij / te groot"); the
species is then excluded from that garden's recommendations. Keyed per map, so
a plant dismissed in one garden can still be suggested in another. Reversible —
the DELETE endpoint (and the inline undo) removes the row.

Revision ID: 0058
Revises: 0057
Create Date: 2026-07-22
"""
from alembic import op

revision = "0058"
down_revision = "0057"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS dismissed_recommendations (
            id          SERIAL PRIMARY KEY,
            map_id      INTEGER NOT NULL,
            species_id  INTEGER NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (map_id, species_id)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_dismissed_recs_map ON dismissed_recommendations (map_id)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS dismissed_recommendations")
