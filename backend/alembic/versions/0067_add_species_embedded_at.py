"""track which species are embedded in the BioCLIP reference set (#866)

A species created from a PlantNet-corrected identify (get_or_create_species)
used to be invisible to BioCLIP forever: the worker matches against a static
.npy built offline, so a new plant_species row never entered the candidate set.
`embedded_at` is the queue marker — NULL means "not in the worker's reference
set yet", set to the sync timestamp once the worker has accepted the embedding.

Backfilled to NOW() for existing rows: they were embedded by the last
precompute_embeddings.py run, and the reconciler re-checks against the worker's
/coverage anyway, so a wrong assumption here self-heals rather than re-embedding
the whole catalog on first boot.

Revision ID: 0067
Revises: 0066
Create Date: 2026-08-08
"""
from alembic import op

revision = "0067"
down_revision = "0066"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE plant_species ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMP")
    op.execute("UPDATE plant_species SET embedded_at = NOW() WHERE embedded_at IS NULL")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_plant_species_embedded_at "
        "ON plant_species(embedded_at) WHERE embedded_at IS NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_plant_species_embedded_at")
    op.execute("ALTER TABLE plant_species DROP COLUMN IF EXISTS embedded_at")
