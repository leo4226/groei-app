"""add plant_species.is_moth_plant (night-flowering / moth-forage flag)

Marks plants whose pale and/or evening-scented flowers are visited by
night-active moths (nachtvlinders) as nectar sources — the nocturnal
counterpart of is_drachtplant (bee-forage). Column is nullable
(NULL = unknown / not in the curated list); filled by
scripts/resolve_moth_plants.py, which joins the committed
data/moth_plants.json snapshot to plant_species by scientific name.

Companion signal only: it drives a badge and a "your garden has no
night-moth plants yet" recommendation nudge, and is NOT folded into the
0-100 biodiversity score (see docs — biodiversity research/scoring doc,
Deel 3: new dimensions land as companion signals first).

Revision ID: 0053
Revises: 0052
Create Date: 2026-07-19
"""
from alembic import op

revision = "0053"
down_revision = "0052"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE plant_species ADD COLUMN IF NOT EXISTS is_moth_plant BOOLEAN")


def downgrade() -> None:
    op.execute("ALTER TABLE plant_species DROP COLUMN IF EXISTS is_moth_plant")
