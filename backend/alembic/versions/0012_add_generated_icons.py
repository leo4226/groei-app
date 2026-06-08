"""add generated_icons table

Stores AI/procedural generated plant icons. The SVG bytes live in R2; this
table holds the metadata + the R2 public url. Two rows per icon (potted base
+ bare variant) mirror the curated manifest's form-variant convention.

See docs/plans/2026-06-07-plant-icon-pipeline-design.md.

Revision ID: 0012
Revises: 0011
Create Date: 2026-06-07
"""
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE generated_icons (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            sci         TEXT NOT NULL DEFAULT '',
            cat         TEXT NOT NULL DEFAULT 'unknown',
            form        TEXT NOT NULL DEFAULT 'potted',
            variant_of  TEXT,
            family      TEXT NOT NULL DEFAULT '',
            url         TEXT NOT NULL,
            source      TEXT NOT NULL DEFAULT 'ai',
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS generated_icons")
