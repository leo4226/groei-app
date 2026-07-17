# backend/tests/test_icon_sync.py
import pytest


@pytest.mark.asyncio
async def test_sync_is_match_only_no_new_icons(client, seeded_db, auth_header):
    await seeded_db.execute("ALTER TABLE plants ADD COLUMN icon_requested INTEGER DEFAULT 0")
    await seeded_db.execute(
        "INSERT INTO plants (id,name,icon_key,icon_requested,is_active,household_id) "
        "VALUES (1,'Monstera','placeholder_houseplant',1,1,1)")
    await seeded_db.commit()
    resp = await client.post("/api/icon-catalog/sync", headers=await _admin_headers(seeded_db, auth_header))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "new_icons" not in body  # the old field is gone
    assert body["matched_plants"] == 1
    row = (await seeded_db.execute_fetchall("SELECT icon_key, icon_requested FROM plants WHERE id=1"))[0]
    assert row["icon_key"] == "monstera"
    assert not row["icon_requested"]


async def _admin_headers(db, auth_header):
    await db.execute("UPDATE accounts SET is_admin = 1 WHERE id = 1")
    await db.commit()
    return auth_header


async def _seed_generated_icons(db):
    """AI-generated catalog entries: base = potted drawing, _bare = variant."""
    await db.execute(
        """CREATE TABLE generated_icons (
            id TEXT PRIMARY KEY, name TEXT, sci TEXT, cat TEXT, form TEXT,
            variant_of TEXT, family TEXT, url TEXT, source TEXT, created_at TEXT)""")
    for icon_id, name, sci, form, variant_of in [
        ("gen_muurbloem", "Muurbloem", "Erysimum cheiri", "potted", None),
        ("gen_muurbloem_bare", "Muurbloem", "Erysimum cheiri", "bare", "gen_muurbloem"),
        ("gen_roos", "Roos", "Rosa", "potted", None),
        ("gen_roos_bare", "Roos", "Rosa", "bare", "gen_roos"),
    ]:
        await db.execute(
            "INSERT INTO generated_icons (id,name,sci,cat,form,variant_of,url,source) "
            "VALUES (?,?,?,'flower',?,?,?,'ai')",
            (icon_id, name, sci, form, variant_of, f"https://r2/{icon_id}.svg"))


@pytest.mark.asyncio
async def test_sync_leaves_bare_variant_of_exact_icon_alone(client, seeded_db, auth_header):
    """Regression: a plant already on the _bare variant of its own exact AI icon
    must NOT be 'upgraded' to the base (= potted) icon by sync — that was the
    pot-comes-back bug triggered on every plant creation."""
    await seeded_db.execute("ALTER TABLE plants ADD COLUMN icon_requested INTEGER DEFAULT 0")
    await _seed_generated_icons(seeded_db)
    await seeded_db.execute(
        "INSERT INTO plants (id,name,icon_key,icon_requested,is_active,household_id) "
        "VALUES (1,'Muurbloem','gen_muurbloem_bare',0,1,1)")
    await seeded_db.commit()
    resp = await client.post("/api/icon-catalog/sync", headers=await _admin_headers(seeded_db, auth_header))
    assert resp.status_code == 200, resp.text
    assert resp.json()["matched_plants"] == 0
    row = (await seeded_db.execute_fetchall("SELECT icon_key FROM plants WHERE id=1"))[0]
    assert row["icon_key"] == "gen_muurbloem_bare"


@pytest.mark.asyncio
async def test_sync_upgrade_preserves_bare_form(client, seeded_db, auth_header):
    """When sync legitimately upgrades to an exact AI icon, the plant's current
    bare form carries over to the new icon's _bare variant."""
    await seeded_db.execute("ALTER TABLE plants ADD COLUMN icon_requested INTEGER DEFAULT 0")
    await _seed_generated_icons(seeded_db)
    await seeded_db.execute(
        "INSERT INTO plants (id,name,icon_key,icon_requested,is_active,household_id) "
        "VALUES (1,'Muurbloem','gen_roos_bare',0,1,1)")
    await seeded_db.commit()
    resp = await client.post("/api/icon-catalog/sync", headers=await _admin_headers(seeded_db, auth_header))
    assert resp.status_code == 200, resp.text
    row = (await seeded_db.execute_fetchall("SELECT icon_key FROM plants WHERE id=1"))[0]
    assert row["icon_key"] == "gen_muurbloem_bare"


@pytest.mark.asyncio
async def test_sync_dangling_bare_key_keeps_form(client, seeded_db, auth_header):
    """A dangling icon_key with a _bare suffix re-matches to the new icon's
    _bare variant, not the potted base."""
    await seeded_db.execute("ALTER TABLE plants ADD COLUMN icon_requested INTEGER DEFAULT 0")
    await _seed_generated_icons(seeded_db)
    await seeded_db.execute(
        "INSERT INTO plants (id,name,icon_key,icon_requested,is_active,household_id) "
        "VALUES (1,'Muurbloem','verdwenen_icoon_bare',0,1,1)")
    await seeded_db.commit()
    resp = await client.post("/api/icon-catalog/sync", headers=await _admin_headers(seeded_db, auth_header))
    assert resp.status_code == 200, resp.text
    row = (await seeded_db.execute_fetchall("SELECT icon_key FROM plants WHERE id=1"))[0]
    assert row["icon_key"] == "gen_muurbloem_bare"
