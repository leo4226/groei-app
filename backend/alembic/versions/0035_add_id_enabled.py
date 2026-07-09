"""add id_enabled flag to plant_species (exclude bloat from BioCLIP without deleting)

Revision ID: 0035
Revises: 0034
"""
from alembic import op

revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # TRUE for every existing row; scripts/prune_catalog.py flips exotic filler to
    # FALSE, and precompute_embeddings.py only embeds id_enabled = TRUE species —
    # so pruning removes them from identification without deleting any data.
    op.execute(
        "ALTER TABLE plant_species ADD COLUMN IF NOT EXISTS id_enabled BOOLEAN NOT NULL DEFAULT TRUE"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE plant_species DROP COLUMN IF EXISTS id_enabled")
