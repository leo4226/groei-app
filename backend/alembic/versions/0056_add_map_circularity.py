"""add maps.circularity (self-reported kringloop practices)

Stores a small JSON object of self-reported circularity practices per garden:
{"compost": bool, "mulch": bool, "rainwater": bool, "peat_free": bool}. NULL /
absent means "not reported". Advice-only — drives a "Kringloop N/4" meter on the
biodiversity card and Stekkie context; NOT folded into the 0-100 score
(biodiversity research doc, Deel 3: circularity is self-report, not points).

Stored as TEXT holding a JSON string, mirroring maps.canvas_data (the codebase
json.loads/json.dumps these rather than relying on a JSONB codec).

Revision ID: 0056
Revises: 0055
Create Date: 2026-07-20
"""
from alembic import op

revision = "0056"
down_revision = "0055"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE maps ADD COLUMN IF NOT EXISTS circularity TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE maps DROP COLUMN IF EXISTS circularity")
