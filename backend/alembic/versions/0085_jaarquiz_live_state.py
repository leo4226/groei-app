"""Separate presentation traffic from the quiz configuration."""
from alembic import op

revision = "0085"
down_revision = "0084"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE jaarquiz ADD COLUMN live_state TEXT NOT NULL DEFAULT '{}'")
    op.execute("ALTER TABLE jaarquiz ADD COLUMN live_photo TEXT")
    op.execute("""UPDATE jaarquiz SET live_state = jsonb_strip_nulls(jsonb_build_object(
        '_presentation', config::jsonb->'_presentation',
        '_waiting_visitors', config::jsonb->'_waiting_visitors'))::text,
        config = (config::jsonb - '_presentation' - '_waiting_visitors')::text""")


def downgrade():
    op.execute("UPDATE jaarquiz SET config = (config::jsonb || live_state::jsonb)::text")
    op.execute("ALTER TABLE jaarquiz DROP COLUMN live_photo, DROP COLUMN live_state")
