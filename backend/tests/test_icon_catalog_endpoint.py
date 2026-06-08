import pytest


@pytest.mark.asyncio
async def test_catalog_endpoint_returns_url_field(client, seeded_db):
    await seeded_db.execute("""CREATE TABLE generated_icons (
        id TEXT PRIMARY KEY, name TEXT, sci TEXT, cat TEXT, form TEXT,
        variant_of TEXT, family TEXT, url TEXT, source TEXT, created_at TEXT)""")
    await seeded_db.execute(
        "INSERT INTO generated_icons (id,name,sci,cat,form,url,source) "
        "VALUES ('gen_rosa','Roos','Rosa','flower','potted','https://r2/gen_rosa.svg','ai')")
    await seeded_db.commit()
    resp = await client.get("/api/icon-catalog")
    assert resp.status_code == 200, resp.text
    entries = resp.json()
    assert any(e["id"] == "gen_rosa" and e["url"] == "https://r2/gen_rosa.svg" for e in entries)
    assert all("url" in e for e in entries)
