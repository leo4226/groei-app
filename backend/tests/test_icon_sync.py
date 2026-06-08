# backend/tests/test_icon_sync.py
import pytest


@pytest.mark.asyncio
async def test_sync_is_match_only_no_new_icons(client, seeded_db):
    await seeded_db.execute("ALTER TABLE plants ADD COLUMN icon_requested INTEGER DEFAULT 0")
    await seeded_db.execute(
        "INSERT INTO plants (id,name,icon_key,icon_requested,is_active,household_id) "
        "VALUES (1,'Monstera','placeholder_houseplant',1,1,1)")
    await seeded_db.commit()
    resp = await client.post("/api/icon-catalog/sync")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "new_icons" not in body  # the old field is gone
    assert body["matched_plants"] == 1
    row = (await seeded_db.execute_fetchall("SELECT icon_key, icon_requested FROM plants WHERE id=1"))[0]
    assert row["icon_key"] == "monstera"
    assert not row["icon_requested"]
