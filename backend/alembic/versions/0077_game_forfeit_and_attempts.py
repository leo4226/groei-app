"""Party rules: a limit on wrong scans, and a forfeit for the loser.

Two columns for two rules a party needs and a solo hunt does not:

- `game_answers.wrong_attempts` counts how many times a player photographed the
  wrong plant in a round. Past the limit the round closes for them, so a guest
  cannot brute-force a hunt by scanning every plant in the garden.
- `game_sessions.forfeit` is what the loser has to do — free text the host
  types, not a value this app supplies. Whether that is a shot, a song or the
  washing-up is the host's business, and hard-coding a drink into everyone's
  game would be a strange thing for a plant-care app to do.

Both are additive with harmless defaults: existing answers have made zero wrong
attempts, and existing sessions have no forfeit.

Revision ID: 0077
Revises: 0076
Create Date: 2026-08-22

"""
from alembic import op

revision = "0077"
down_revision = "0076"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE game_answers "
        "ADD COLUMN IF NOT EXISTS wrong_attempts INTEGER NOT NULL DEFAULT 0"
    )
    op.execute("ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS forfeit TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE game_sessions DROP COLUMN IF EXISTS forfeit")
    op.execute("ALTER TABLE game_answers DROP COLUMN IF EXISTS wrong_attempts")
