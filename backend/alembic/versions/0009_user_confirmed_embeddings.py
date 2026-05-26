"""user_confirmed_embeddings table

Stores image embeddings of plants users have confirmed via /identify/commit,
so future /identify calls can blend image-to-image similarity into ranking.
See docs/plans/2026-05-26-bioclip-user-confirmed-retrieval-design.md.

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-26
"""
from alembic import op


revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE user_confirmed_embeddings (
            id                 SERIAL PRIMARY KEY,
            species_id         INT NOT NULL REFERENCES plant_species(id) ON DELETE CASCADE,
            embedding          BYTEA NOT NULL,
            source_account_id  INT REFERENCES accounts(id) ON DELETE SET NULL,
            source_photo_url   TEXT,
            created_at         TIMESTAMPTZ DEFAULT NOW()
        );
    """)
    op.execute(
        "CREATE INDEX idx_uce_species_id ON user_confirmed_embeddings(species_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_uce_species_id")
    op.execute("DROP TABLE IF EXISTS user_confirmed_embeddings")
