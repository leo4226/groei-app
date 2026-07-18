"""GET /streken lists the 25 streken for the 'Kies je streek' picker."""
import pytest


@pytest.mark.asyncio
async def test_list_streken(client, auth_header, seeded_db):
    resp = await client.get("/api/streken", headers=auth_header)
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 25
    slugs = {i["slug"] for i in items}
    assert "hollands-en-utrechts-laagveengebied" in slugs
    assert all(i["name"] for i in items)


@pytest.mark.asyncio
async def test_streken_requires_auth(client):
    resp = await client.get("/api/streken")
    assert resp.status_code == 401
