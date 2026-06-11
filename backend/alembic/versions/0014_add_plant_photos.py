"""add plant_photos table

Photo journal per plant. Image bytes live in R2; this table holds metadata +
the R2 key/public url. BioCLIP columns are nullable — they are filled by a
background task (PR 3) and stay NULL when the worker is offline.

See docs/plans/2026-06-10-photo-journal-design.md. (The plan numbered this
0013, but 0013 was taken by notification_preferences in the meantime.)

Revision ID: 0014
Revises: 0013
Create Date: 2026-06-11
"""
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE plant_photos (
            id                  SERIAL PRIMARY KEY,
            plant_id            INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
            household_id        INTEGER NOT NULL,
            r2_key              TEXT NOT NULL,
            url                 TEXT NOT NULL,
            note                TEXT,
            taken_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            care_log_id         INTEGER REFERENCES care_log(id) ON DELETE SET NULL,
            bioclip_species_id  INTEGER,
            bioclip_confidence  REAL,
            species_mismatch    BOOLEAN DEFAULT FALSE,
            embedding           BYTEA,
            created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    op.execute(
        "CREATE INDEX idx_plant_photos_plant ON plant_photos(plant_id, taken_at DESC)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS plant_photos")
