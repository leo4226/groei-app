"""Unified icon catalog: curated (static manifest) + generated (DB rows).

Curated icons live in the manifest baked into the image and are served by
Vercel at /icons/<file>. Generated icons live in R2 and their public url is
stored in generated_icons.url. This module returns one merged list where every
entry carries an explicit `url`, so the frontend can resolve either source.
"""
from __future__ import annotations

import json
import logging
import os
logger = logging.getLogger(__name__)

# Same resolution as the routers (env override, else repo path). In prod the
# ICONS_DIR env var is set (fly.toml -> /app/icons); the fallback is dev-only.
# backend/services/ is two levels under the repo root, hence two "..".
ICONS_DIR = os.environ.get(
    "ICONS_DIR",
    os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "public", "icons")),
)


def _curated_entries(icons_dir: str | None = None) -> list[dict]:
    icons_dir = icons_dir or ICONS_DIR
    path = os.path.join(icons_dir, "manifest.json")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    entries = data["plants"] if isinstance(data, dict) else data
    out = []
    for e in entries:
        e = dict(e)
        e["url"] = f"/icons/{e.get('file') or (e['id'] + '.svg')}"
        e["source"] = "curated"
        out.append(e)
    return out


async def _generated_entries(db) -> list[dict]:
    try:
        rows = await db.execute_fetchall(
            "SELECT id, name, sci, cat, form, variant_of, family, url, source FROM generated_icons"
        )
    except Exception:
        # generated_icons may not exist yet (fresh DB before migration, or
        # unit-test DBs that don't seed it). Treat as no generated icons.
        logger.warning("generated_icons table not accessible, returning empty catalog")
        return []
    return [dict(r) for r in rows]


async def load_catalog(db, *, icons_dir: str | None = None) -> list[dict]:
    """Curated + generated, deduped by id (generated wins on conflict)."""
    merged: dict[str, dict] = {}
    for e in _curated_entries(icons_dir):
        merged[e["id"]] = e
    for e in await _generated_entries(db):
        merged[e["id"]] = e
    return list(merged.values())
