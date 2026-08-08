"""record what BioCLIP guessed vs what the user actually picked (#866 phase 3)

identify_log knew that an identify happened and with which engine, but not
whether the answer was any good. The question we actually care about — "BioCLIP
was wrong, the user went to PlantNet and picked something else" — was therefore
invisible, so we could neither measure whether the catalog sync helps nor rank
which species are worth adding next.

The identify row is written first (top_species_id / top_confidence = what
BioCLIP or PlantNet led with) and the commit fills in the tail
(chosen_species_id / chosen_source / committed_at). A row with no committed_at
is an identify the user walked away from, which is its own signal.

Revision ID: 0068
Revises: 0067
Create Date: 2026-08-08
"""
from alembic import op

revision = "0068"
down_revision = "0067"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE identify_log ADD COLUMN IF NOT EXISTS top_species_id INTEGER")
    op.execute("ALTER TABLE identify_log ADD COLUMN IF NOT EXISTS top_confidence DOUBLE PRECISION")
    op.execute("ALTER TABLE identify_log ADD COLUMN IF NOT EXISTS chosen_species_id INTEGER")
    op.execute("ALTER TABLE identify_log ADD COLUMN IF NOT EXISTS chosen_source TEXT")
    op.execute("ALTER TABLE identify_log ADD COLUMN IF NOT EXISTS committed_at TIMESTAMP")
    # The miss report filters on committed rows within a date window.
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_identify_log_committed "
        "ON identify_log(committed_at) WHERE committed_at IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_identify_log_committed")
    for column in (
        "top_species_id", "top_confidence", "chosen_species_id",
        "chosen_source", "committed_at",
    ):
        op.execute(f"ALTER TABLE identify_log DROP COLUMN IF EXISTS {column}")
