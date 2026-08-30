"""Spaced-repetition cards for learning plant names.

A quiz on its own gives practice; what makes a name stick is being asked again
later, and sooner for the ones you got wrong. So the schedule is the feature,
not the questions — `box` and `due_at` are what separate this from the party
game's quiz round.

Deliberately per ACCOUNT, not per household: what Leon has learned is not what
Lisbeth has learned, even though they share every discovery and every plant.

Leitner boxes: a right answer moves the card up one and pushes it further out;
a wrong answer sends it back to box 0 and it returns the same day. Intervals
live in the router (`_BOX_INTERVALS`) rather than here, because tuning them is
a product decision and should not need a migration.

Revision ID: 0078
Revises: 0077
Create Date: 2026-08-22

"""
from alembic import op

revision = "0078"
down_revision = "0077"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS study_cards (
            id SERIAL PRIMARY KEY,
            account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            -- 'discovery' (field guide) or 'plant' (own plants with journal
            -- photos). Kept as a pair rather than two nullable FKs so a card
            -- always points at exactly one thing.
            source TEXT NOT NULL,
            ref_id INTEGER NOT NULL,
            box INTEGER NOT NULL DEFAULT 0,
            due_at TIMESTAMP NOT NULL DEFAULT NOW(),
            seen INTEGER NOT NULL DEFAULT 0,
            correct INTEGER NOT NULL DEFAULT 0,
            last_answered_at TIMESTAMP,
            UNIQUE (account_id, source, ref_id)
        )
        """
    )
    # Every question starts with "what is due for this account" — the one query
    # this table exists to answer.
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_study_cards_due "
        "ON study_cards(account_id, due_at)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS study_cards")
