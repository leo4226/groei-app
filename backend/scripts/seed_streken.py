"""Idempotent (re)seed of streken + streek_species from the committed snapshot.

Migration 0051 seeds these tables, but that only runs once — and if the snapshot
wasn't packaged in the image at that time (see the .dockerignore fix), it seeded
nothing and won't re-run. This script re-seeds idempotently (ON CONFLICT DO
NOTHING) and is safe to run on every deploy from the Fly release_command, so the
reference data self-heals and stays in sync with data/streken_source.json.

Usage:
  cd backend && python -m scripts.seed_streken
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

if os.path.dirname(__file__).endswith("scripts"):
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
else:
    sys.path.insert(0, ".")

from database import init_pool, close_pool, get_db

SNAPSHOT = Path(__file__).parent.parent / "data" / "streken_source.json"


async def seed() -> dict:
    if not SNAPSHOT.exists():
        return {"seeded": False, "reason": "snapshot missing"}
    data = json.loads(SNAPSHOT.read_text(encoding="utf-8"))

    async with get_db() as db:
        for s in data["streken"]:
            # Explicit RETURNING slug so the adapter doesn't auto-append
            # "RETURNING id" (streken's PK is slug — there is no id column).
            await db.execute(
                "INSERT INTO streken (slug, name_nl, name_en) VALUES (?, ?, ?) "
                "ON CONFLICT (slug) DO NOTHING RETURNING slug",
                (s["slug"], s["name"], s["name"]),
            )
        for sp in data["species"]:
            for slug in sp.get("streek_slugs", []):
                await db.execute(
                    "INSERT INTO streek_species (streek_slug, name_nl, category, source) "
                    "VALUES (?, ?, ?, 'streektuinen') "
                    "ON CONFLICT (streek_slug, name_nl, category) DO NOTHING",
                    (slug, sp["name_nl"], sp.get("category")),
                )
        await db.commit()

        streken = await db.execute_fetchall("SELECT COUNT(*) AS n FROM streken")
        species = await db.execute_fetchall("SELECT COUNT(*) AS n FROM streek_species")
        return {"seeded": True, "streken": streken[0]["n"], "streek_species": species[0]["n"]}


async def _main() -> None:
    await init_pool()
    try:
        stats = await seed()
    finally:
        await close_pool()
    print("seed_streken:", stats)


if __name__ == "__main__":
    asyncio.run(_main())
