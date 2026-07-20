"""Circularity (kringloop) self-report — PUT /maps/{slug}/circularity.

Advice-only garden-level flags (compost / mulch / rainwater / peat-free). The
endpoint requires the authenticated household to own the map; the stored value
is parsed back into a full {key: bool} dict by garden_biodiversity._circularity.
"""
import json

import aiosqlite
import pytest

from services.garden_biodiversity import _circularity

BASE = "/api"


async def _maps_with_circularity(db):
    # conftest's maps table has no slug / circularity columns — add them.
    await db.execute("ALTER TABLE maps ADD COLUMN slug TEXT")
    await db.execute("ALTER TABLE maps ADD COLUMN circularity TEXT")


@pytest.mark.asyncio
async def test_put_circularity_updates_and_returns_flags(client, seeded_db, auth_header):
    await _maps_with_circularity(seeded_db)
    await seeded_db.execute(
        "INSERT INTO maps (id, name, map_type, household_id, slug) "
        "VALUES (1, 'Tuin', 'outdoor', 1, 'mijn-tuin')"
    )
    await seeded_db.commit()

    resp = await client.put(
        f"{BASE}/maps/mijn-tuin/circularity",
        json={"compost": True, "mulch": True, "rainwater": False, "peat_free": True},
        headers=auth_header,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"compost": True, "mulch": True, "rainwater": False, "peat_free": True}

    rows = await seeded_db.execute_fetchall("SELECT circularity FROM maps WHERE id = 1")
    assert json.loads(rows[0]["circularity"]) == {
        "compost": True, "mulch": True, "rainwater": False, "peat_free": True,
    }


@pytest.mark.asyncio
async def test_put_circularity_rejects_other_household_map(client, seeded_db, auth_header):
    await _maps_with_circularity(seeded_db)
    await seeded_db.execute(
        "INSERT INTO maps (id, name, map_type, household_id, slug) "
        "VALUES (2, 'Andermans', 'outdoor', 999, 'andermans-tuin')"
    )
    await seeded_db.commit()

    resp = await client.put(
        f"{BASE}/maps/andermans-tuin/circularity",
        json={"compost": True, "mulch": False, "rainwater": False, "peat_free": False},
        headers=auth_header,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_circularity_helper_parses_and_defaults_missing_keys():
    db = await aiosqlite.connect(":memory:")
    db.row_factory = lambda cur, row: {d[0]: row[i] for i, d in enumerate(cur.description)}
    await db.execute("CREATE TABLE maps (id INTEGER PRIMARY KEY, circularity TEXT)")
    await db.execute("INSERT INTO maps (id, circularity) VALUES (1, ?)", (json.dumps({"compost": True}),))
    await db.commit()
    flags = await _circularity(db, 1)
    assert flags == {"compost": True, "mulch": False, "rainwater": False, "peat_free": False}
    await db.close()


@pytest.mark.asyncio
async def test_circularity_helper_guards_missing_column():
    db = await aiosqlite.connect(":memory:")
    db.row_factory = lambda cur, row: {d[0]: row[i] for i, d in enumerate(cur.description)}
    await db.execute("CREATE TABLE maps (id INTEGER PRIMARY KEY)")  # no circularity column
    await db.commit()
    flags = await _circularity(db, 1)
    assert flags == {"compost": False, "mulch": False, "rainwater": False, "peat_free": False}
    await db.close()
