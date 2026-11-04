"""Small thumbnails next to journal photos.

Journal photos are stored at up to 1600 px and every list, sheet and grid in
the app showed that full image, a few hundred KB each, for a 48–120 px slot.
Uploads now also store a ~480 px JPEG beside the original; these columns hold
its address. Both are nullable: a photo without one (older uploads until the
admin backfill has run, or a thumbnail that failed to render) falls back to
the full image, exactly as before.

- plant_photos.thumb_url: the thumbnail of that journal photo.
- plants.photo_thumb_path: the thumbnail of plants.photo_path (the newest
  journal photo), kept in step by the same code that sets photo_path.

Revision ID: 0083
Revises: 0082
Create Date: 2026-11-04
"""
from alembic import op

revision = "0083"
down_revision = "0082"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE plant_photos ADD COLUMN IF NOT EXISTS thumb_url TEXT")
    op.execute("ALTER TABLE plants ADD COLUMN IF NOT EXISTS photo_thumb_path TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE plants DROP COLUMN IF EXISTS photo_thumb_path")
    op.execute("ALTER TABLE plant_photos DROP COLUMN IF EXISTS thumb_url")
