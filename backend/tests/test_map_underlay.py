"""HTTP tests for the map trace-over underlay upload endpoint (#647).

The endpoint only persists the image bytes to R2 and returns a URL; the
placement transform lives in the map's canvas_data (client-side).
"""
import pytest_asyncio

import routers.maps as maps_router


class FakeStorage:
    def __init__(self):
        self.puts = []

    def put(self, key, data, content_type):
        self.puts.append((key, len(data), content_type))
        return f"https://cdn.test/{key}"


@pytest_asyncio.fixture
async def underlay_db(seeded_db, monkeypatch):
    db = seeded_db
    # The shared conftest maps table has no slug column; the endpoint needs one.
    await db.execute("ALTER TABLE maps ADD COLUMN slug TEXT")
    await db.execute(
        "INSERT INTO maps (id, name, map_type, slug, household_id) VALUES (1, 'Garden', 'outdoor', 'garden', 1)"
    )
    await db.commit()
    fake = FakeStorage()
    monkeypatch.setattr(maps_router, "build_storage_from_env", lambda: fake)
    return db, fake


PNG = b"\x89PNG\r\n\x1a\nfakepngbytes"


async def test_upload_underlay_returns_url(client, underlay_db, auth_header):
    _, fake = underlay_db
    resp = await client.post(
        "/api/maps/1/underlay", headers=auth_header,
        files={"file": ("bg.png", PNG, "image/png")},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["url"].startswith("https://cdn.test/maps/garden/underlay-")
    assert len(fake.puts) == 1
    assert fake.puts[0][2] == "image/png"


async def test_upload_underlay_rejects_bad_type(client, underlay_db, auth_header):
    resp = await client.post(
        "/api/maps/1/underlay", headers=auth_header,
        files={"file": ("bg.gif", b"GIF89a", "image/gif")},
    )
    assert resp.status_code == 415


async def test_upload_underlay_foreign_map_404(client, underlay_db, auth_header):
    resp = await client.post(
        "/api/maps/999/underlay", headers=auth_header,
        files={"file": ("bg.png", PNG, "image/png")},
    )
    assert resp.status_code == 404


async def test_upload_underlay_requires_auth(client, underlay_db):
    resp = await client.post(
        "/api/maps/1/underlay",
        files={"file": ("bg.png", PNG, "image/png")},
    )
    assert resp.status_code in (401, 403)
