"""add streken + streek_species and map.streek_slug (streek biodiversity)

Regional (streek) layer sourced from streektuinen.nl: 25 Dutch ecological streken
and the icoonsoorten (flora/fauna) native to each. Seeds streken + streek_species
from the committed snapshot (data/streken_source.json). The species_id linkage to
plant_species is filled later by scripts/resolve_streek_species.py (name
resolution) — nullable here so the streek lists display even before resolution.

maps gains streek_slug (auto-resolved from lat/lon by services/streek.py) and
streek_source ('auto' | 'manual') so a user's "Kies je streek" pick is never
overwritten by a later auto-resolve.

See docs/plans/2026-07-18-streek-biodiversity.md.

Revision ID: 0051
Revises: 0050
Create Date: 2026-07-18
"""
import json
from pathlib import Path

import sqlalchemy as sa
from alembic import op

revision = "0051"
down_revision = "0050"
branch_labels = None
depends_on = None

SNAPSHOT = Path(__file__).resolve().parents[2] / "data" / "streken_source.json"


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS streken (
            slug           TEXT PRIMARY KEY,
            name_nl        TEXT NOT NULL,
            name_en        TEXT,
            soil_types     JSONB,
            description_nl TEXT,
            description_en TEXT
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS streek_species (
            id          SERIAL PRIMARY KEY,
            streek_slug TEXT NOT NULL REFERENCES streken(slug) ON DELETE CASCADE,
            name_nl     TEXT NOT NULL,
            category    TEXT,
            source      TEXT NOT NULL DEFAULT 'streektuinen',
            species_id  INTEGER REFERENCES plant_species(id) ON DELETE SET NULL,
            UNIQUE (streek_slug, name_nl, category)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_streek_species_slug ON streek_species(streek_slug)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_streek_species_species ON streek_species(species_id)")

    op.execute("ALTER TABLE maps ADD COLUMN IF NOT EXISTS streek_slug TEXT REFERENCES streken(slug)")
    op.execute("ALTER TABLE maps ADD COLUMN IF NOT EXISTS streek_source TEXT NOT NULL DEFAULT 'auto'")

    _seed()


def _seed() -> None:
    if not SNAPSHOT.exists():
        return
    data = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    conn = op.get_bind()

    conn.execute(
        sa.text(
            "INSERT INTO streken (slug, name_nl, name_en) VALUES (:slug, :name, :name) "
            "ON CONFLICT (slug) DO NOTHING"
        ),
        [{"slug": s["slug"], "name": s["name"]} for s in data["streken"]],
    )

    rows = []
    for sp in data["species"]:
        for slug in sp.get("streek_slugs", []):
            rows.append({
                "slug": slug,
                "name": sp["name_nl"],
                "cat": sp.get("category"),
            })
    if rows:
        conn.execute(
            sa.text(
                "INSERT INTO streek_species (streek_slug, name_nl, category, source) "
                "VALUES (:slug, :name, :cat, 'streektuinen') "
                "ON CONFLICT (streek_slug, name_nl, category) DO NOTHING"
            ),
            rows,
        )


def downgrade() -> None:
    op.execute("ALTER TABLE maps DROP COLUMN IF EXISTS streek_slug")
    op.execute("ALTER TABLE maps DROP COLUMN IF EXISTS streek_source")
    op.execute("DROP TABLE IF EXISTS streek_species")
    op.execute("DROP TABLE IF EXISTS streken")
