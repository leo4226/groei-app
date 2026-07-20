"""add plant_species.is_woody + is_ground_cover (growth-form signals)

Two advice-only companion flags:
  - is_woody       — trees/shrubs/woody climbers; a carbon (koolstof) proxy,
                     since wood + roots store more carbon than annuals. NOT a
                     measured CO2 figure.
  - is_ground_cover — creeping/mat-forming species that cover bare soil.

Both are NULL by default (unknown), filled by scripts/resolve_growth_form.py
from the committed data/growth_form_plants.json snapshot, joined by scientific
name. Neither is folded into the 0-100 biodiversity score — they drive a
"koolstof" and a "bodembedekking" advice line on the card + Stekkie context
(biodiversity research doc, Deel 3: companion signals, not points).

(NB: a free-text `growth_form` column already exists from 0007 for the weed
catalog; these are distinct boolean signals to avoid overloading it.)

Revision ID: 0055
Revises: 0054
Create Date: 2026-07-19
"""
from alembic import op

revision = "0055"
down_revision = "0054"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE plant_species ADD COLUMN IF NOT EXISTS is_woody BOOLEAN")
    op.execute("ALTER TABLE plant_species ADD COLUMN IF NOT EXISTS is_ground_cover BOOLEAN")


def downgrade() -> None:
    op.execute("ALTER TABLE plant_species DROP COLUMN IF EXISTS is_woody")
    op.execute("ALTER TABLE plant_species DROP COLUMN IF EXISTS is_ground_cover")
