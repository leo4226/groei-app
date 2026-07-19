"""add plant_species.soil_ph_pref (Ellenberg soil-reaction preference)

Marks a plant's clear soil-pH preference: 'acid' (calcifuge / kalkmijdend,
low Ellenberg R) or 'alkaline' (calcicole / kalkminnend, high R). NULL =
unknown / pH-tolerant (no advice signal). Filled by
scripts/resolve_soil_ph.py from the committed data/soil_ph_plants.json
snapshot, joined by scientific name.

Advice-only signal: it drives a "your plants prefer acidic/chalky soil —
consider a zuurmeting / lime" tip via the biodiversity card and Stekkie
chat context, and is NOT folded into the 0-100 biodiversity score (see the
biodiversity research/scoring doc, Deel 3: soil is advice, not points).

Revision ID: 0054
Revises: 0053
Create Date: 2026-07-19
"""
from alembic import op

revision = "0054"
down_revision = "0053"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE plant_species ADD COLUMN IF NOT EXISTS soil_ph_pref TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE plant_species DROP COLUMN IF EXISTS soil_ph_pref")
