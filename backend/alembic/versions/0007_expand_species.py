"""expand plant_species with taxonomy + create species_images table

Adds: family, genus, growth_form, gbif_taxon_key, images_count,
      description_nl, description_en columns to plant_species.
Creates species_images table for CC0 image references.

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-23
"""
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE plant_species
          ADD COLUMN family         TEXT,
          ADD COLUMN genus          TEXT,
          ADD COLUMN growth_form    TEXT,
          ADD COLUMN gbif_taxon_key BIGINT,
          ADD COLUMN images_count   INTEGER DEFAULT 0,
          ADD COLUMN description_nl TEXT,
          ADD COLUMN description_en TEXT
    """)

    op.execute("""
        CREATE TABLE species_images (
            id              SERIAL PRIMARY KEY,
            species_id      INTEGER NOT NULL REFERENCES plant_species(id) ON DELETE CASCADE,
            url             TEXT NOT NULL,
            thumbnail_url   TEXT,
            source          TEXT NOT NULL,       -- 'gbif', 'wikidata', 'perenual'
            license         TEXT,                 -- 'CC0', 'CC-BY', etc.
            width           INTEGER,
            height          INTEGER,
            is_primary      BOOLEAN DEFAULT FALSE,
            created_at      TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE INDEX idx_species_images_species ON species_images(species_id)
    """)

    # GIN index for full-text search on names (Postgres-only feature)
    op.execute("""
        CREATE INDEX idx_plant_species_search
        ON plant_species
        USING gin(to_tsvector('simple', coalesce(common_name_nl, '') || ' ' ||
                               coalesce(common_name_en, '') || ' ' ||
                               coalesce(latin_name, '')))
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_plant_species_search")
    op.execute("DROP TABLE IF EXISTS species_images")
    op.execute("""
        ALTER TABLE plant_species
          DROP COLUMN IF EXISTS family,
          DROP COLUMN IF EXISTS genus,
          DROP COLUMN IF EXISTS growth_form,
          DROP COLUMN IF EXISTS gbif_taxon_key,
          DROP COLUMN IF EXISTS images_count,
          DROP COLUMN IF EXISTS description_nl,
          DROP COLUMN IF EXISTS description_en
    """)
