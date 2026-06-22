"""Add plant_discoveries table for field journal

Revision ID: 0022
Revises: 0021
Create Date: 2026-06-22
"""
from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS plant_discoveries (
            id SERIAL PRIMARY KEY,
            account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
            species_id INTEGER REFERENCES plant_species(id) ON DELETE SET NULL,
            common_name TEXT NOT NULL,
            latin_name TEXT,
            thumbnail_url TEXT,
            notes TEXT,
            location_lat DOUBLE PRECISION,
            location_lon DOUBLE PRECISION,
            discovered_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_plant_discoveries_household ON plant_discoveries(household_id, discovered_at DESC)"
    )


def downgrade():
    op.execute("DROP TABLE IF EXISTS plant_discoveries")
