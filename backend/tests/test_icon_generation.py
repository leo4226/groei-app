# backend/tests/test_icon_generation.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

GOOD = '<svg viewBox="0 0 100 100" width="100" height="100"><ellipse cx="50" cy="50" rx="9" ry="9" fill="#4A7C4E"/></svg>'


@pytest.fixture
async def admin_db(seeded_db):
    await seeded_db.execute("UPDATE accounts SET email='leon_korbee@hotmail.com' WHERE id=1")
    await seeded_db.execute("ALTER TABLE plants ADD COLUMN icon_requested BOOLEAN DEFAULT 0")
    await seeded_db.execute("CREATE TABLE plant_species (id INTEGER PRIMARY KEY, common_name_nl TEXT, latin_name TEXT)")
    await seeded_db.execute("INSERT INTO plant_species (id, common_name_nl, latin_name) VALUES (1,'Roos','Rosa canina')")
    await seeded_db.execute("""CREATE TABLE generated_icons (
        id TEXT PRIMARY KEY, name TEXT, sci TEXT, cat TEXT, form TEXT,
        variant_of TEXT, family TEXT, url TEXT, source TEXT, created_at TEXT)""")
    await seeded_db.commit()
    return seeded_db


@pytest.mark.asyncio
async def test_generate_ai_path_writes_r2_and_db(client, admin_db, auth_header):
    fake_storage = MagicMock()
    fake_storage.put = MagicMock(side_effect=lambda key, data, ct: f"https://r2/{key}")
    with patch("routers.admin_panel.generate_icon_variants",
               new=AsyncMock(return_value={"potted_svg": GOOD, "bare_svg": GOOD, "cat": "flower"})), \
         patch("routers.admin_panel.build_storage_from_env", return_value=fake_storage):
        resp = await client.post("/api/admin-panel/generate-icons", headers=auth_header)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["count"] == 1
    rows = await admin_db.execute_fetchall("SELECT id, source, url FROM generated_icons ORDER BY id")
    ids = {r["id"] for r in rows}
    assert {"gen_roos", "gen_roos_bare"} <= ids
    assert fake_storage.put.call_count == 2


@pytest.mark.asyncio
async def test_falls_back_to_procedural_on_bad_svg(client, admin_db, auth_header):
    fake_storage = MagicMock()
    fake_storage.put = MagicMock(side_effect=lambda key, data, ct: f"https://r2/{key}")
    with patch("routers.admin_panel.generate_icon_variants",
               new=AsyncMock(return_value={"potted_svg": "garbage", "bare_svg": "garbage", "cat": "flower"})), \
         patch("routers.admin_panel.build_storage_from_env", return_value=fake_storage):
        resp = await client.post("/api/admin-panel/generate-icons", headers=auth_header)
    assert resp.status_code == 200, resp.text
    rows = await admin_db.execute_fetchall("SELECT source FROM generated_icons")
    assert rows and all(r["source"] == "procedural" for r in rows)
