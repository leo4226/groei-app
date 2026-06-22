"""Add fun_fact_nl and fun_fact_en columns to plant_species

Revision ID: 0021
Revises: 0020
Create Date: 2026-06-22
"""
from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE plant_species ADD COLUMN IF NOT EXISTS fun_fact_nl TEXT")
    op.execute("ALTER TABLE plant_species ADD COLUMN IF NOT EXISTS fun_fact_en TEXT")


def downgrade():
    op.execute("ALTER TABLE plant_species DROP COLUMN IF EXISTS fun_fact_nl")
    op.execute("ALTER TABLE plant_species DROP COLUMN IF EXISTS fun_fact_en")
