"""add share_token to plant_discoveries for public specimen-card links

Revision ID: 0040
Revises: 0039
"""
from alembic import op

revision = "0040"
down_revision = "0039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Minted on first share (POST /discover/{id}/share); NULL = never shared.
    op.execute("ALTER TABLE plant_discoveries ADD COLUMN IF NOT EXISTS share_token TEXT")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_plant_discoveries_share_token "
        "ON plant_discoveries (share_token) WHERE share_token IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_plant_discoveries_share_token")
    op.execute("ALTER TABLE plant_discoveries DROP COLUMN IF EXISTS share_token")
