# backend/tests/test_icon_generation.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

# The AI now returns only the plant fragment; the backend composites it onto the
# standard pot and validates the finished icon.
PLANT = '<g><ellipse cx="50" cy="50" rx="9" ry="9" fill="#4A7C4E"/></g>'
# A fragment that makes the composed icon invalid (disallowed tag) -> procedural.
BAD_PLANT = '<foreignObject/>'


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
               new=AsyncMock(return_value={"plant_svg": PLANT, "cat": "flower"})), \
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
               new=AsyncMock(return_value={"plant_svg": BAD_PLANT, "cat": "flower"})), \
         patch("routers.admin_panel.build_storage_from_env", return_value=fake_storage):
        resp = await client.post("/api/admin-panel/generate-icons", headers=auth_header)
    assert resp.status_code == 200, resp.text
    rows = await admin_db.execute_fetchall("SELECT source FROM generated_icons")
    assert rows and all(r["source"] == "procedural" for r in rows)


@pytest.mark.asyncio
async def test_ai_retries_before_procedural_fallback(client, admin_db, auth_header):
    # The reasoning model is flaky (timeout / empty content); two failures then a
    # success must still yield an AI icon, not the generic procedural fallback.
    flaky = AsyncMock(side_effect=[
        Exception("read timeout"),
        ValueError("empty content"),
        {"plant_svg": PLANT, "cat": "flower"},
    ])
    fake_storage = MagicMock()
    fake_storage.put = MagicMock(side_effect=lambda key, data, ct: f"https://r2/{key}")
    with patch("routers.admin_panel.generate_icon_variants", new=flaky), \
         patch("routers.admin_panel.build_storage_from_env", return_value=fake_storage):
        resp = await client.post("/api/admin-panel/generate-icons", headers=auth_header)
    assert resp.status_code == 200, resp.text
    rows = await admin_db.execute_fetchall("SELECT source FROM generated_icons")
    assert rows and all(r["source"] == "ai" for r in rows)
    assert flaky.call_count == 3


@pytest.mark.asyncio
async def test_preview_counts_all_uncovered_species(client, admin_db, auth_header):
    resp = await client.get("/api/admin-panel/generate-icons/preview", headers=auth_header)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["scope"] == "all"
    assert body["count"] == 1  # the single seeded species (Rosa canina), uncovered


@pytest.mark.asyncio
async def test_preview_in_use_scope_and_map_only(client, admin_db, auth_header):
    # A species exists but no plant references it yet -> in_use count is 0.
    r0 = await client.get("/api/admin-panel/generate-icons/preview?scope=in_use", headers=auth_header)
    assert r0.json()["count"] == 0
    # Add a plant that needs an icon, linked to the species, NOT placed on a map.
    await admin_db.execute(
        "INSERT INTO plants (id,name,species_id,icon_requested,is_active,household_id) "
        "VALUES (1,'Mijn roos',1,1,1,1)")
    await admin_db.commit()
    r1 = await client.get("/api/admin-panel/generate-icons/preview?scope=in_use", headers=auth_header)
    assert r1.json()["count"] == 1
    # map_only excludes it (no map_id).
    r2 = await client.get("/api/admin-panel/generate-icons/preview?scope=in_use&map_only=true", headers=auth_header)
    assert r2.json()["count"] == 0
    # Place it on a map -> map_only now counts it.
    await admin_db.execute("UPDATE plants SET map_id = 5 WHERE id = 1")
    await admin_db.commit()
    r3 = await client.get("/api/admin-panel/generate-icons/preview?scope=in_use&map_only=true", headers=auth_header)
    assert r3.json()["count"] == 1


@pytest.mark.asyncio
async def test_generate_respects_limit_and_reports_remaining(client, admin_db, auth_header):
    # Second uncovered species -> two candidates under scope=all.
    await admin_db.execute(
        "INSERT INTO plant_species (id, common_name_nl, latin_name) VALUES (2,'Basterdkool','Bunias orientalis')")
    await admin_db.commit()
    fake_storage = MagicMock()
    fake_storage.put = MagicMock(side_effect=lambda key, data, ct: f"https://r2/{key}")
    with patch("routers.admin_panel.generate_icon_variants",
               new=AsyncMock(return_value={"plant_svg": PLANT, "cat": "flower"})), \
         patch("routers.admin_panel.build_storage_from_env", return_value=fake_storage):
        resp = await client.post("/api/admin-panel/generate-icons?limit=1", headers=auth_header)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["count"] == 1
    assert body["remaining"] == 1


@pytest.mark.asyncio
async def test_dangling_icon_key_surfaces_and_is_reassigned(client, admin_db, auth_header):
    # A plant linked to a species, with an icon_key that resolves to NO real icon
    # (a stale/dangling key) and icon_requested = 0 — the legacy-data case.
    await admin_db.execute(
        "INSERT INTO plant_species (id, common_name_nl, latin_name) VALUES (2,'Basterdkool','Bunias orientalis')")
    await admin_db.execute(
        "INSERT INTO plants (id,name,species,species_id,icon_key,icon_requested,is_active,household_id) "
        "VALUES (1,'Basterdkool','Bunias orientalis',2,'basterdkool_old',0,1,1)")
    await admin_db.commit()
    # It must surface under in_use even though icon_requested=0 and the key is non-null/non-placeholder.
    pv = await client.get("/api/admin-panel/generate-icons/preview?scope=in_use", headers=auth_header)
    assert pv.json()["count"] == 1
    fake_storage = MagicMock()
    fake_storage.put = MagicMock(side_effect=lambda key, data, ct: f"https://r2/{key}")
    with patch("routers.admin_panel.generate_icon_variants",
               new=AsyncMock(return_value={"plant_svg": PLANT, "cat": "edible"})), \
         patch("routers.admin_panel.build_storage_from_env", return_value=fake_storage):
        resp = await client.post("/api/admin-panel/generate-icons?scope=in_use", headers=auth_header)
    assert resp.status_code == 200, resp.text
    # The dangling key is replaced by the freshly generated icon.
    row = (await admin_db.execute_fetchall("SELECT icon_key, icon_requested FROM plants WHERE id=1"))[0]
    assert row["icon_key"] == "gen_basterdkool"
    assert not row["icon_requested"]
