"""add plant_species.habit + mature_height_cm (size-aware recommendations)

Structured growth habit and rough mature height so recommendations can be
scaled to the garden: a plant is only a "best" pick if it fits the space. A
willow is superb bee forage but a tree — it shouldn't top the list for a
courtyard.

  - habit: 'tree' | 'large_shrub' | 'shrub' | 'climber' | 'perennial' |
           'grass' | 'groundcover' | 'bulb' | 'annual' (NULL = unknown)
  - mature_height_cm: rough mature height in cm (NULL = unknown)

Filled by scripts/resolve_plant_habits.py from the committed
data/plant_habits.json snapshot, joined by scientific name. Unknown habit/height
degrades gracefully (the plant is still recommended, just not size-filtered).

(Distinct from the free-text growth_form column (0007, weed catalog) and from
is_woody/is_ground_cover (0055, advice signals) — this is the size dimension.)

Revision ID: 0057
Revises: 0056
Create Date: 2026-07-20
"""
from alembic import op

revision = "0057"
down_revision = "0056"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE plant_species ADD COLUMN IF NOT EXISTS habit TEXT")
    op.execute("ALTER TABLE plant_species ADD COLUMN IF NOT EXISTS mature_height_cm INTEGER")


def downgrade() -> None:
    op.execute("ALTER TABLE plant_species DROP COLUMN IF EXISTS habit")
    op.execute("ALTER TABLE plant_species DROP COLUMN IF EXISTS mature_height_cm")
