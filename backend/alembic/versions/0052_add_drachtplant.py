"""add plant_species.is_drachtplant (Bloeibogen bee-forage flag)

Naturalis/Bloeibogen marks which plants are drachtplanten (bee-forage: nectar
and/or pollen sources). This is a hard authoritative signal that strengthens the
LLM/GBIF-derived pollinator scoring. Column is nullable (NULL = unknown /
not-in-Bloeibogen); filled by scripts/resolve_bloeibogen.py which joins the
committed snapshot to plant_species by scientific name.

See issue #709.

Revision ID: 0052
Revises: 0051
Create Date: 2026-07-18
"""
from alembic import op

revision = "0052"
down_revision = "0051"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE plant_species ADD COLUMN IF NOT EXISTS is_drachtplant BOOLEAN")


def downgrade() -> None:
    op.execute("ALTER TABLE plant_species DROP COLUMN IF EXISTS is_drachtplant")
