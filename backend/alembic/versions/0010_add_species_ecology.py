"""add species ecology columns to plant_species

Adds seven nullable ecology columns used by the species-ecology enrichment
pipeline (GBIF native/invasive flags, LLM-generated flowering window +
pollinator value, Wikidata host-plant relations, and provenance tracking).

See docs/plans/2026-05-27-species-ecology-enrichment-spec.md.

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-27
"""
from alembic import op


revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE plant_species
          ADD COLUMN native_to_nl        BOOLEAN,
          ADD COLUMN invasive_nl         BOOLEAN,
          ADD COLUMN flowering_months    JSONB,
          ADD COLUMN pollinator_value    SMALLINT,
          ADD COLUMN host_plant_for      JSONB,
          ADD COLUMN ecology_data_source TEXT,
          ADD COLUMN ecology_enriched_at TIMESTAMPTZ
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE plant_species
          DROP COLUMN IF EXISTS native_to_nl,
          DROP COLUMN IF EXISTS invasive_nl,
          DROP COLUMN IF EXISTS flowering_months,
          DROP COLUMN IF EXISTS pollinator_value,
          DROP COLUMN IF EXISTS host_plant_for,
          DROP COLUMN IF EXISTS ecology_data_source,
          DROP COLUMN IF EXISTS ecology_enriched_at
    """)
