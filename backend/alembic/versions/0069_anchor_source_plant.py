"""link user-confirmed anchors to the plant they came from (#866 phase 2)

Anchors are labelled training data. Until now a row recorded the account and
the photo URL, but not the plant — so when a user re-identified a plant as
something else, its anchors kept matching future photos against the label the
user had just rejected, and there was no way to find them.

ON DELETE CASCADE also makes deleting a plant retract its anchors for free.

Revision ID: 0069
Revises: 0068
Create Date: 2026-08-08
"""
from alembic import op

revision = "0069"
down_revision = "0068"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE user_confirmed_embeddings "
        "ADD COLUMN IF NOT EXISTS source_plant_id INTEGER "
        "REFERENCES plants(id) ON DELETE CASCADE"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_uce_source_plant "
        "ON user_confirmed_embeddings(source_plant_id)"
    )
    # Retraction also matches on the commit photo (anchors captured before the
    # plant row existed), so that lookup needs to be cheap too.
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_uce_source_photo "
        "ON user_confirmed_embeddings(source_photo_url)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_uce_source_photo")
    op.execute("DROP INDEX IF EXISTS idx_uce_source_plant")
    op.execute("ALTER TABLE user_confirmed_embeddings DROP COLUMN IF EXISTS source_plant_id")
