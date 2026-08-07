"""add plants container/provenance detail columns (add-plant audit P1-1)

The Add Plant form has collected six of these for a while and thrown all of
them away: `buildCreatePayload` had no field for any, so form type, pot
material, pot dimensions, drainage and substrate were write-only UI. These
columns give them somewhere to land.

  - form_type: 'pot' | 'ground' | 'seedling' | 'tree' (how the plant grows)
  - pot_material: 'terracotta' | 'plastic' | 'ceramic' | 'basket'
  - pot_diameter_cm / pot_height_cm: container dimensions in cm
  - has_drainage: whether the pot has a drainage hole
  - substrate: JSON array of substrate chip ids
  - acquired_from: free text, where the plant came from

`pot_size_cm` already existed and stays the canonical "how big is the pot"
number (it drives the potted/bare icon variant); pot_diameter_cm is written
alongside it and is the value the form actually asks for.

Revision ID: 0063
Revises: 0062
Create Date: 2026-08-07
"""
from alembic import op

revision = "0063"
down_revision = "0062"
branch_labels = None
depends_on = None


COLUMNS = (
    ("form_type", "TEXT"),
    ("pot_material", "TEXT"),
    ("pot_diameter_cm", "INTEGER"),
    ("pot_height_cm", "INTEGER"),
    ("has_drainage", "BOOLEAN"),
    ("substrate", "TEXT"),
    ("acquired_from", "TEXT"),
)


def upgrade() -> None:
    for name, coltype in COLUMNS:
        op.execute(f"ALTER TABLE plants ADD COLUMN IF NOT EXISTS {name} {coltype}")


def downgrade() -> None:
    for name, _ in COLUMNS:
        op.execute(f"ALTER TABLE plants DROP COLUMN IF EXISTS {name}")
