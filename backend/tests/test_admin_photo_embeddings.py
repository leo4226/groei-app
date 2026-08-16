"""Re-embedding journal photos taken while the BioCLIP worker was offline.

This backfill exists because the failure it repairs is silent: `check_photo`
returns None when the worker is unreachable, the upload path stores no
embedding and creates no anchor, and the photo still uploads and displays
perfectly. A whole photo round done with the Windows machine asleep looks like
a complete success and produces none of the value it was for.
"""
import numpy as np
import pytest

import routers.admin_panel as ap


EXTRA_SCHEMA = """
    CREATE TABLE plant_photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plant_id INTEGER NOT NULL,
        household_id INTEGER NOT NULL,
        r2_key TEXT NOT NULL,
        url TEXT,
        note TEXT,
        taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        care_log_id INTEGER,
        bioclip_species_id INTEGER,
        bioclip_confidence REAL,
        species_mismatch BOOLEAN DEFAULT FALSE,
        embedding BLOB
    );
    CREATE TABLE user_confirmed_embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        species_id INTEGER NOT NULL,
        embedding BLOB NOT NULL,
        source_account_id INTEGER,
        source_photo_url TEXT,
        source_plant_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
"""

EMBEDDING = np.ones(512, dtype=np.float32).tobytes()


@pytest.fixture
async def photo_db(seeded_db):
    await seeded_db.executescript(EXTRA_SCHEMA)
    await seeded_db.executescript("""
        INSERT INTO households (id, name) VALUES (2, 'Other');
        INSERT INTO plants (id, name, species_id, is_active, household_id) VALUES
            (1, 'Monstera', 7, 1, 1),
            (2, 'Naamloos', NULL, 1, 1),
            (3, 'Vreemde plant', 9, 1, 2);
        INSERT INTO plant_photos (id, plant_id, household_id, r2_key, url, embedding) VALUES
            (10, 1, 1, 'k10', 'https://cdn.test/10.jpg', NULL),
            (11, 2, 1, 'k11', 'https://cdn.test/11.jpg', NULL),
            (12, 3, 2, 'k12', 'https://cdn.test/12.jpg', NULL);
    """)
    await seeded_db.commit()
    return seeded_db


def _fake_httpx(monkeypatch):
    """Every fetch returns some bytes; we only care about the embed step."""
    class Resp:
        content = b'jpegbytes'
        def raise_for_status(self): pass

    class Client:
        def __init__(self, **kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, url): return Resp()

    import httpx
    monkeypatch.setattr(httpx, 'AsyncClient', Client)


async def _noop_progress(done, total):
    pass


@pytest.mark.asyncio
async def test_embeds_photos_and_anchors_species_linked_ones(photo_db, monkeypatch):
    _fake_httpx(monkeypatch)
    monkeypatch.setattr(
        'services.photo_check.check_photo',
        lambda img, species_id: _ok(species_id),
    )

    result = await ap._run_backfill_photo_embeddings(
        photo_db, {"household_id": 1}, _noop_progress)

    # Only this household's two photos — the foreign one is not touched.
    assert result["checked"] == 2
    assert result["embedded"] == 2

    rows = await photo_db.execute_fetchall(
        "SELECT id, embedding FROM plant_photos ORDER BY id")
    by_id = {r["id"]: r["embedding"] for r in rows}
    assert by_id[10] is not None
    assert by_id[11] is not None
    assert by_id[12] is None, "another household's photo must be left alone"

    # The species-linked plant gains an anchor; the unlinked one cannot.
    anchors = await photo_db.execute_fetchall(
        "SELECT species_id, source_plant_id FROM user_confirmed_embeddings")
    assert [(a["species_id"], a["source_plant_id"]) for a in anchors] == [(7, 1)]
    assert result["anchored"] == 1

    reasons = {f["reason"] for f in result["skipped_details"]}
    assert "no_species_link" in reasons


@pytest.mark.asyncio
async def test_stops_loudly_when_the_worker_is_unreachable(photo_db, monkeypatch):
    """The whole point: say "your worker is off" once, rather than report a run
    that checked everything and embedded nothing."""
    _fake_httpx(monkeypatch)
    monkeypatch.setattr('services.photo_check.check_photo', lambda img, sid: _none())

    with pytest.raises(RuntimeError) as excinfo:
        await ap._run_backfill_photo_embeddings(
            photo_db, {"household_id": 1}, _noop_progress)

    message = str(excinfo.value)
    assert "unreachable" in message
    assert "bioclip.floreren.app/health" in message, "must say where to look"

    # Nothing half-written.
    rows = await photo_db.execute_fetchall(
        "SELECT embedding FROM plant_photos WHERE id = 10")
    assert rows[0]["embedding"] is None


@pytest.mark.asyncio
async def test_photos_that_already_have_an_embedding_are_not_refetched(photo_db, monkeypatch):
    await photo_db.execute(
        "UPDATE plant_photos SET embedding = ? WHERE id = 10", (EMBEDDING,))
    await photo_db.commit()
    _fake_httpx(monkeypatch)
    monkeypatch.setattr(
        'services.photo_check.check_photo', lambda img, sid: _ok(sid))

    result = await ap._run_backfill_photo_embeddings(
        photo_db, {"household_id": 1}, _noop_progress)

    assert result["checked"] == 1, "an already-embedded photo is not a candidate"


async def _ok(species_id):
    return {
        "bioclip_species_id": species_id,
        "bioclip_confidence": 0.9,
        "species_mismatch": False,
        "embedding": EMBEDDING,
    }


async def _none():
    return None


@pytest.mark.asyncio
async def test_adopts_embedded_photos_whose_species_arrived_later(photo_db, monkeypatch):
    """The gap this closes: photograph first, link the species afterwards.

    The upload path took its anchor decision when the plant had no species, and
    the re-embed pass skips the photo because it HAS an embedding. Without this
    the photo stays embedded and unanchored forever — it helps the game and
    never trains identification.
    """
    # Photo 11's plant had no species when it was shot; it does now.
    await photo_db.execute(
        "UPDATE plant_photos SET embedding = ? WHERE id = 11", (EMBEDDING,))
    await photo_db.execute("UPDATE plants SET species_id = 12 WHERE id = 2")
    await photo_db.commit()
    _fake_httpx(monkeypatch)
    monkeypatch.setattr(
        'services.photo_check.check_photo', lambda img, sid: _ok(sid))

    result = await ap._run_backfill_photo_embeddings(
        photo_db, {"household_id": 1}, _noop_progress)

    anchors = await photo_db.execute_fetchall(
        "SELECT species_id, source_plant_id FROM user_confirmed_embeddings "
        "WHERE source_plant_id = 2")
    assert [(a["species_id"], a["source_plant_id"]) for a in anchors] == [(12, 2)]
    assert result["adopted"] == 1


@pytest.mark.asyncio
async def test_adoption_survives_an_unreachable_worker(photo_db, monkeypatch):
    """Adoption needs no worker — the embedding is already stored. So a dead
    worker must not throw that work away along with the embedding pass."""
    await photo_db.execute(
        "UPDATE plant_photos SET embedding = ? WHERE id = 11", (EMBEDDING,))
    await photo_db.execute("UPDATE plants SET species_id = 12 WHERE id = 2")
    await photo_db.commit()
    _fake_httpx(monkeypatch)
    monkeypatch.setattr('services.photo_check.check_photo', lambda img, sid: _none())

    with pytest.raises(RuntimeError) as excinfo:
        await ap._run_backfill_photo_embeddings(
            photo_db, {"household_id": 1}, _noop_progress)

    assert "needs no worker and is saved" in str(excinfo.value)
    anchors = await photo_db.execute_fetchall(
        "SELECT id FROM user_confirmed_embeddings WHERE source_plant_id = 2")
    assert len(anchors) == 1, "the anchor was committed before the worker failure"


@pytest.mark.asyncio
async def test_does_not_anchor_the_same_photo_twice(photo_db, monkeypatch):
    await photo_db.execute(
        "UPDATE plant_photos SET embedding = ? WHERE id = 10", (EMBEDDING,))
    await photo_db.executescript("""
        INSERT INTO user_confirmed_embeddings
            (species_id, embedding, source_photo_url, source_plant_id)
        VALUES (7, x'00', 'https://cdn.test/10.jpg', 1);
    """)
    await photo_db.commit()
    _fake_httpx(monkeypatch)
    monkeypatch.setattr(
        'services.photo_check.check_photo', lambda img, sid: _ok(sid))

    result = await ap._run_backfill_photo_embeddings(
        photo_db, {"household_id": 1}, _noop_progress)

    assert result["adopted"] == 0, "photo 10 already has its anchor"
