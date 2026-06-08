import json
import os
import pytest
import aiosqlite

from services.icon_catalog import load_catalog, _curated_entries


@pytest.fixture
def icons_dir(tmp_path):
    d = tmp_path / "icons"
    d.mkdir()
    (d / "manifest.json").write_text(json.dumps({"plants": [
        {"id": "monstera", "name": "Monstera", "sci": "Monstera deliciosa",
         "cat": "houseplant", "form": "potted", "family": "", "file": "monstera.svg"},
    ]}), encoding="utf-8")
    return str(d)


def test_curated_entries_get_vercel_url(icons_dir):
    entries = _curated_entries(icons_dir)
    assert entries[0]["url"] == "/icons/monstera.svg"


@pytest.mark.asyncio
async def test_load_catalog_merges_generated(icons_dir):
    db = await aiosqlite.connect(":memory:")
    db.row_factory = aiosqlite.Row
    await db.execute("""CREATE TABLE generated_icons (
        id TEXT PRIMARY KEY, name TEXT, sci TEXT, cat TEXT, form TEXT,
        variant_of TEXT, family TEXT, url TEXT, source TEXT, created_at TEXT)""")
    await db.execute(
        "INSERT INTO generated_icons (id,name,sci,cat,form,url,source) "
        "VALUES ('gen_rosa','Roos','Rosa','flower','potted','https://r2/gen_rosa.svg','ai')")
    await db.commit()
    catalog = await load_catalog(db, icons_dir=icons_dir)
    by_id = {e["id"]: e for e in catalog}
    assert by_id["monstera"]["url"] == "/icons/monstera.svg"
    assert by_id["gen_rosa"]["url"] == "https://r2/gen_rosa.svg"
    await db.close()


@pytest.mark.asyncio
async def test_load_catalog_tolerates_missing_generated_table(icons_dir):
    """If generated_icons doesn't exist yet (fresh/test DB), curated-only, no crash."""
    db = await aiosqlite.connect(":memory:")
    db.row_factory = aiosqlite.Row
    catalog = await load_catalog(db, icons_dir=icons_dir)
    assert {e["id"] for e in catalog} == {"monstera"}
    await db.close()
