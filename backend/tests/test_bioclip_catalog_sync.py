"""Backend-side tests for the BioCLIP catalog sync service (#866).

The loop under test: a species created from a PlantNet correction lands in
plant_species with `embedded_at IS NULL`, and this service pushes it to the
worker so BioCLIP itself can name the plant next time.
"""
import aiosqlite
import pytest
import pytest_asyncio

from services import bioclip_catalog_sync as sync


PLANT_SPECIES_SCHEMA = """
    CREATE TABLE plant_species (
        id INTEGER PRIMARY KEY,
        latin_name TEXT,
        common_name_en TEXT,
        id_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        embedded_at TIMESTAMP
    );
"""


def _dict_row(cursor, row):
    return {d[0]: row[i] for i, d in enumerate(cursor.description)}


@pytest_asyncio.fixture
async def db():
    conn = await aiosqlite.connect(":memory:")
    conn.row_factory = _dict_row
    await conn.executescript(PLANT_SPECIES_SCHEMA)
    try:
        yield conn
    finally:
        await conn.close()


async def _insert(db, species_id, latin_name, *, embedded=False, enabled=True, common=None):
    await db.execute(
        "INSERT INTO plant_species (id, latin_name, common_name_en, id_enabled, embedded_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (species_id, latin_name, common, enabled, "2026-01-01T00:00:00" if embedded else None),
    )
    await db.commit()


async def _embedded_ids(db) -> list[int]:
    rows = await db.execute_fetchall(
        "SELECT id FROM plant_species WHERE embedded_at IS NOT NULL ORDER BY id"
    )
    return [r["id"] for r in rows]


@pytest.fixture
def worker_configured(monkeypatch):
    monkeypatch.setenv("BIOCLIP_WORKER_URL", "http://worker.test")
    monkeypatch.setenv("BIOCLIP_WORKER_TOKEN", "s3cret")


@pytest.fixture
def sent(monkeypatch):
    """Capture what the service would POST to /embed-text (accepting it)."""
    batches = []

    async def _fake_post(species):
        batches.append(species)
        return True

    monkeypatch.setattr(sync, "_post_embed_text", _fake_post)
    return batches


@pytest.fixture(autouse=True)
def gbif_resolves(monkeypatch):
    """Tests that predate GBIF-backbone validation (#941) treat every name as
    valid — no test may hit the real GBIF API. GBIF-specific tests re-patch
    `resolve_latin_name` with their own fake (same monkeypatch, last wins)."""

    async def _always(client, name):
        return True

    monkeypatch.setattr(sync, "resolve_latin_name", _always)


# ── the queue ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_queued_species_is_pushed_and_marked_embedded(db, worker_configured, sent):
    await _insert(db, 1, "Rosa canina", embedded=True)
    await _insert(db, 42, "Silene dioica", common="Red campion")  # the new one

    result = await sync.sync_pending(db)

    assert result == {"status": "ok", "embedded": 1, "skipped": 0, "failed": 0}
    assert sent == [[{
        "species_id": 42,
        "latin_name": "Silene dioica",
        "common_name_en": "Red campion",
    }]]
    assert await _embedded_ids(db) == [1, 42]


@pytest.mark.asyncio
async def test_nothing_queued_makes_no_worker_call(db, worker_configured, sent):
    await _insert(db, 1, "Rosa canina", embedded=True)

    assert (await sync.sync_pending(db))["embedded"] == 0
    assert sent == []


@pytest.mark.asyncio
async def test_disabled_and_nameless_species_are_never_pushed(db, worker_configured, sent):
    await _insert(db, 1, "Rosa canina", enabled=False)  # pruned congener bloat
    await _insert(db, 2, "")
    await _insert(db, 3, None)

    assert (await sync.sync_pending(db))["embedded"] == 0
    assert sent == []
    assert await _embedded_ids(db) == []


@pytest.mark.asyncio
async def test_junk_names_are_skipped_but_stay_queued(db, worker_configured, sent):
    """An LLM placeholder must not enter the identification catalog — and must
    not be marked done either, so fixing the name later still syncs it."""
    await _insert(db, 7, "Unknown plant 2")
    await _insert(db, 8, "Urtica dioica")

    result = await sync.sync_pending(db)

    assert result == {"status": "ok", "embedded": 1, "skipped": 1, "failed": 0}
    assert [s["species_id"] for batch in sent for s in batch] == [8]
    assert await _embedded_ids(db) == [8]


@pytest.mark.asyncio
async def test_species_stays_queued_when_the_worker_rejects_the_batch(db, worker_configured, monkeypatch):
    await _insert(db, 42, "Silene dioica")

    async def _refuse(species):
        return False

    monkeypatch.setattr(sync, "_post_embed_text", _refuse)

    result = await sync.sync_pending(db)

    assert result["status"] == "partial"
    assert result["failed"] == 1
    assert await _embedded_ids(db) == []  # retried on the next run


@pytest.mark.asyncio
async def test_batches_are_capped(db, worker_configured, sent, monkeypatch):
    monkeypatch.setattr(sync, "_BATCH_SIZE", 2)
    for i, epithet in enumerate(["alba", "nigra", "rubra", "viridis", "lutea"], start=1):
        await _insert(db, i, f"Genus {epithet}")

    result = await sync.sync_pending(db)

    assert result["embedded"] == 5
    assert [len(b) for b in sent] == [2, 2, 1]


@pytest.mark.asyncio
async def test_unconfigured_worker_is_a_no_op(db, monkeypatch, sent):
    monkeypatch.delenv("BIOCLIP_WORKER_URL", raising=False)
    await _insert(db, 42, "Silene dioica")

    assert (await sync.sync_pending(db))["status"] == "unconfigured"
    assert sent == []
    assert await _embedded_ids(db) == []


# ── reconciliation ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reconcile_requeues_species_the_worker_lost(db, worker_configured, sent, monkeypatch):
    """Worker rebuilt from an older .npy: the DB thinks 2 is embedded, the
    worker has never heard of it. It must go back on the queue and be pushed."""
    await _insert(db, 1, "Rosa canina", embedded=True)
    await _insert(db, 2, "Silene dioica", embedded=True)

    async def _coverage():
        return {1}

    monkeypatch.setattr(sync, "_fetch_worker_species_ids", _coverage)

    result = await sync.reconcile(db)

    assert result["requeued"] == 1
    assert result["embedded"] == 1
    assert [s["species_id"] for batch in sent for s in batch] == [2]
    assert await _embedded_ids(db) == [1, 2]


@pytest.mark.asyncio
async def test_reconcile_never_discards_an_explicit_re_embed_request(db, worker_configured, sent, monkeypatch):
    """A species re-queued on purpose (latin name fixed) must still be pushed
    even though its id is in /coverage — coverage proves the id is loaded, not
    that the worker's vector matches the current name."""
    await _insert(db, 1, "Rosa rugosa")  # queued after a rename
    await _insert(db, 2, "Bellis perennis", embedded=True)

    async def _coverage():
        return {1, 2}

    monkeypatch.setattr(sync, "_fetch_worker_species_ids", _coverage)

    result = await sync.reconcile(db)

    assert result["requeued"] == 0
    assert result["embedded"] == 1
    assert [s["latin_name"] for batch in sent for s in batch] == ["Rosa rugosa"]
    assert await _embedded_ids(db) == [1, 2]


@pytest.mark.asyncio
async def test_reconcile_leaves_embedded_species_alone(db, worker_configured, sent, monkeypatch):
    """Everything already embedded and present on the worker: no GPU work."""
    await _insert(db, 1, "Rosa canina", embedded=True)
    await _insert(db, 2, "Bellis perennis", embedded=True)

    async def _coverage():
        return {1, 2}

    monkeypatch.setattr(sync, "_fetch_worker_species_ids", _coverage)

    result = await sync.reconcile(db)

    assert result == {"status": "ok", "requeued": 0, "embedded": 0, "skipped": 0, "failed": 0}
    assert sent == []


@pytest.mark.asyncio
async def test_reconcile_leaves_the_queue_alone_when_the_worker_is_down(db, worker_configured, sent, monkeypatch):
    await _insert(db, 1, "Rosa canina", embedded=True)

    async def _no_coverage():
        return None

    monkeypatch.setattr(sync, "_fetch_worker_species_ids", _no_coverage)

    result = await sync.reconcile(db)

    assert result["status"] == "worker_unavailable"
    assert sent == []
    assert await _embedded_ids(db) == [1]  # not wrongly re-queued


@pytest.mark.asyncio
async def test_a_second_sync_is_skipped_while_one_is_running(db, worker_configured, monkeypatch):
    """Concurrent identify commits must not each hold a pooled DB connection
    through the worker round trip — the second trigger drops instead."""
    import asyncio

    await _insert(db, 1, "Silene dioica")
    started = asyncio.Event()
    release = asyncio.Event()
    calls = []

    async def _slow_post(species):
        calls.append(species)
        started.set()
        await release.wait()
        return True

    monkeypatch.setattr(sync, "_post_embed_text", _slow_post)

    first = asyncio.create_task(sync.sync_pending(db, skip_if_busy=True))
    await started.wait()

    second = await sync.sync_pending(db, skip_if_busy=True)
    assert second["status"] == "busy"
    assert second["embedded"] == 0

    release.set()
    assert (await first)["embedded"] == 1
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_mark_species_pending_requeues(db):
    await _insert(db, 1, "Rosa canina", embedded=True)

    await sync.mark_species_pending(db, 1)

    assert await _embedded_ids(db) == []


# ── the name guardrail ──────────────────────────────────────────────────────

@pytest.mark.parametrize("name", [
    "Rosa canina",
    "Silene dioica",
    "Monstera",                      # genus-only rows exist legitimately
    "Rosa × floribunda",             # hybrid marker
    "Sedum spp.",
    "Crataegus laevigata 'Paul's Scarlet'".replace("'", ""),
])
def test_accepts_botanical_names(name):
    assert sync.is_embeddable_latin_name(name) is True


@pytest.mark.parametrize("name", [
    None, "", "   ", "??", "x", "Unknown plant 2", "plant #3", "Rosa 2",
])
def test_rejects_junk_names(name):
    assert sync.is_embeddable_latin_name(name) is False


# ── GBIF-backbone validation (#941) ────────────────────────────────────────


async def _species_row(db, species_id):
    rows = await db.execute_fetchall(
        "SELECT latin_name, id_enabled, embedded_at FROM plant_species WHERE id = ?",
        (species_id,),
    )
    return dict(rows[0])


@pytest.mark.asyncio
async def test_unresolved_name_is_disabled_and_never_embedded(
    db, worker_configured, sent, monkeypatch
):
    """A misspelled LLM name that GBIF cannot resolve must not enter the
    identification catalog: id_enabled = FALSE, embedded_at stays NULL so a
    later name fix + re-enable re-queues it."""
    await _insert(db, 7, "Rosa caninna")  # typo
    await _insert(db, 8, "Urtica dioica")

    async def _resolve(client, name):
        return name == "Urtica dioica"

    monkeypatch.setattr(sync, "resolve_latin_name", _resolve)

    result = await sync.sync_pending(db)

    assert result == {"status": "ok", "embedded": 1, "skipped": 1, "failed": 0}
    assert [s["species_id"] for batch in sent for s in batch] == [8]
    row = await _species_row(db, 7)
    assert row["id_enabled"] == 0
    assert row["embedded_at"] is None
    assert await _embedded_ids(db) == [8]


@pytest.mark.asyncio
async def test_resolved_name_still_flows_through(db, worker_configured, sent):
    """A name GBIF knows behaves exactly like before the guardrail."""
    await _insert(db, 42, "Silene dioica", common="Red campion")

    result = await sync.sync_pending(db)

    assert result == {"status": "ok", "embedded": 1, "skipped": 0, "failed": 0}
    assert sent == [[{
        "species_id": 42,
        "latin_name": "Silene dioica",
        "common_name_en": "Red campion",
    }]]
    assert await _embedded_ids(db) == [42]


@pytest.mark.asyncio
async def test_gbif_outage_leaves_species_queued(
    db, worker_configured, sent, monkeypatch
):
    """GBIF being down must not fail the sync nor disable anything: the species
    stays queued and is retried on the next run."""
    await _insert(db, 42, "Silene dioica")

    async def _unavailable(client, name):
        return None

    monkeypatch.setattr(sync, "resolve_latin_name", _unavailable)

    result = await sync.sync_pending(db)

    assert result == {"status": "ok", "embedded": 0, "skipped": 1, "failed": 0}
    assert sent == []
    row = await _species_row(db, 42)
    assert row["id_enabled"] == 1  # still enabled
    assert row["embedded_at"] is None  # still queued
