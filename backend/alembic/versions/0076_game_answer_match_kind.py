"""Record how a game answer was accepted.

Grading a round has several routes to "correct": the scan's photo matched the
target plant's own photos, or the species name matched exactly, or — when the
plant has no reference photos at all — a genus or common-name guess was good
enough. Until now that verdict lived only in the HTTP response to the player
who scanned, so the host had no way to tell a hunt won on photographs from one
won on generous name matching, and a run of false positives (see the Scindapsus
round of 2026-08-17) left no trace to find afterwards.

Existing answers keep NULL: their route is genuinely unknown, and inventing
'photo' for them would poison exactly the signal this column exists to give.

Revision ID: 0076
Revises: 0075
Create Date: 2026-08-17

"""
from alembic import op

revision = "0076"
down_revision = "0075"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE game_answers ADD COLUMN IF NOT EXISTS match_kind TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE game_answers DROP COLUMN IF EXISTS match_kind")
