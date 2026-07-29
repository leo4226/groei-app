"""add garden_features (physical biodiversity features per garden)

Counts of physical garden features — insect hotel, nestkast, egelhuisje,
takkenril, steenhoop, vijver, drinkschaaltje, vleermuiskast — reported per map.
Biodiversity is more than plants: shelter, nesting and water decide whether the
fauna your flowers attract can actually *live* there.

Advice-only, like the other companion signals: it drives a "welke dieren
ondersteun je / wat ontbreekt" panel and Stekkie context, and is NOT folded
into the 0-100 score.

Revision ID: 0059
Revises: 0058
Create Date: 2026-07-25
"""
from alembic import op

revision = "0059"
down_revision = "0058"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS garden_features (
            id           SERIAL PRIMARY KEY,
            map_id       INTEGER NOT NULL,
            feature_type TEXT NOT NULL,
            count        INTEGER NOT NULL DEFAULT 1,
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (map_id, feature_type)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_garden_features_map ON garden_features (map_id)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS garden_features")
