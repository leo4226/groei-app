"""User-confirmed anchors: harvesting, dedupe, cap, retraction (#866 phase 2).

Anchors are the strongest identification signal we have — real photos labelled
by the plant's owner — which is exactly why they need guardrails: a duplicate
lets one angle dominate by weight of numbers, an uncapped set lets one plant
speak for a whole species, and a stale anchor keeps matching photos against a
label the user has already rejected.
"""
import aiosqlite
import numpy as np
import pytest
import pytest_asyncio

from services import user_refs
from services.user_refs import (
    DEDUPE_MAX_COSINE,
    MAX_ANCHORS_PER_SPECIES,
    add_anchor,
    retract_anchor,
    retract_photo_anchor,
    retract_plant_anchors,
)

SCHEMA = """
    CREATE TABLE user_confirmed_embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        species_id INTEGER NOT NULL,
        embedding BLOB NOT NULL,
        source_account_id INTEGER,
        source_photo_url TEXT,
        source_plant_id INTEGER,
        created_at TIMESTAMP
    );
"""


def _dict_row(cursor, row):
    return {d[0]: row[i] for i, d in enumerate(cursor.description)}


@pytest_asyncio.fixture
async def db():
    conn = await aiosqlite.connect(":memory:")
    conn.row_factory = _dict_row
    await conn.executescript(SCHEMA)
    try:
        yield conn
    finally:
        await conn.close()


def _embedding(seed: int) -> bytes:
    """A unit 512-vector, deterministic per seed and far from the others."""
    rng = np.random.default_rng(seed)
    vector = rng.normal(size=512).astype(np.float32)
    return (vector / np.linalg.norm(vector)).tobytes()


def _nudged(embedding: bytes, amount: float) -> bytes:
    """Same photo, slightly different: cosine ≈ 1 - amount."""
    base = np.frombuffer(embedding, dtype=np.float32)
    noise = np.random.default_rng(7).normal(size=512).astype(np.float32)
    noise -= noise.dot(base) * base                      # orthogonal component
    noise /= np.linalg.norm(noise)
    mixed = base + amount * noise
    return (mixed / np.linalg.norm(mixed)).astype(np.float32).tobytes()


async def _anchors(db, species_id=None):
    sql = "SELECT * FROM user_confirmed_embeddings"
    params = ()
    if species_id is not None:
        sql += " WHERE species_id = ?"
        params = (species_id,)
    return await db.execute_fetchall(sql + " ORDER BY id", params)


# ── harvesting ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_anchor_is_stored_with_its_provenance(db):
    result = await add_anchor(
        db, 42, _embedding(1), account_id=1,
        photo_url="https://r2/photo.jpg", plant_id=7,
    )

    assert result == "added"
    row = (await _anchors(db))[0]
    assert row["species_id"] == 42
    # Provenance is what makes retraction possible later.
    assert row["source_plant_id"] == 7
    assert row["source_photo_url"] == "https://r2/photo.jpg"
    assert row["source_account_id"] == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("embedding", [b"", b"too-short", b"\x00" * 2047])
async def test_malformed_embeddings_are_refused(db, embedding):
    assert await add_anchor(db, 42, embedding) == "invalid"
    assert await _anchors(db) == []


@pytest.mark.asyncio
async def test_zero_vector_is_refused(db):
    """A worker that returned zeros would otherwise poison every match."""
    assert await add_anchor(db, 42, np.zeros(512, dtype=np.float32).tobytes()) == "invalid"
    assert await _anchors(db) == []


@pytest.mark.asyncio
async def test_species_id_is_required(db):
    assert await add_anchor(db, 0, _embedding(1)) == "invalid"
    assert await _anchors(db) == []


# ── dedupe ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_near_identical_photo_is_not_stored_twice(db):
    original = _embedding(1)
    await add_anchor(db, 42, original)

    # Cosine well above the floor: the same photo, re-uploaded or barely moved.
    result = await add_anchor(db, 42, _nudged(original, 0.05))

    assert result == "duplicate"
    assert len(await _anchors(db)) == 1


@pytest.mark.asyncio
async def test_a_genuinely_different_angle_is_kept(db):
    original = _embedding(1)
    await add_anchor(db, 42, original)

    # Far enough apart to carry new information about the plant.
    result = await add_anchor(db, 42, _nudged(original, 0.6))

    assert result == "added"
    assert len(await _anchors(db)) == 2


@pytest.mark.asyncio
async def test_dedupe_is_per_species(db):
    """The same photo can legitimately anchor two species rows (a rename, a
    merge) — dedupe must not silently drop the second."""
    shared = _embedding(1)
    await add_anchor(db, 42, shared)

    assert await add_anchor(db, 99, shared) == "added"
    assert len(await _anchors(db, 42)) == 1
    assert len(await _anchors(db, 99)) == 1


@pytest.mark.asyncio
async def test_dedupe_threshold_is_the_documented_one(db):
    assert 0.9 < DEDUPE_MAX_COSINE < 1.0


# ── cap ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_species_is_capped_and_the_oldest_anchor_makes_way(db):
    for seed in range(MAX_ANCHORS_PER_SPECIES):
        assert await add_anchor(db, 42, _embedding(seed), plant_id=seed) == "added"
    oldest_id = (await _anchors(db, 42))[0]["id"]

    assert await add_anchor(db, 42, _embedding(999), plant_id=999) == "added"

    rows = await _anchors(db, 42)
    assert len(rows) == MAX_ANCHORS_PER_SPECIES     # cap holds
    assert oldest_id not in [r["id"] for r in rows]  # oldest evicted
    assert rows[-1]["source_plant_id"] == 999        # newest kept


@pytest.mark.asyncio
async def test_the_cap_is_per_species_not_global(db):
    for seed in range(MAX_ANCHORS_PER_SPECIES):
        await add_anchor(db, 42, _embedding(seed))

    assert await add_anchor(db, 99, _embedding(1000)) == "added"
    assert len(await _anchors(db, 42)) == MAX_ANCHORS_PER_SPECIES
    assert len(await _anchors(db, 99)) == 1


# ── retraction ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_relabelling_a_plant_retracts_everything_it_contributed(db):
    await add_anchor(db, 42, _embedding(1), plant_id=7, photo_url="https://r2/a.jpg")
    await add_anchor(db, 42, _embedding(2), plant_id=7, photo_url="https://r2/b.jpg")
    await add_anchor(db, 42, _embedding(3), plant_id=8, photo_url="https://r2/c.jpg")

    removed = await retract_plant_anchors(db, 7)

    assert removed == 2
    remaining = await _anchors(db)
    assert [r["source_plant_id"] for r in remaining] == [8]


@pytest.mark.asyncio
async def test_retraction_also_catches_the_commit_anchor_with_no_plant_id(db):
    """The /identify/commit anchor predates the plant row, so it has no
    plant_id — it is reachable only through the photo that became the plant's
    photo_path. Missing it would leave the rejected label in place."""
    await add_anchor(db, 42, _embedding(1), photo_url="https://r2/commit.jpg")
    await add_anchor(db, 42, _embedding(2), plant_id=7, photo_url="https://r2/later.jpg")

    removed = await retract_plant_anchors(db, 7, "https://r2/commit.jpg")

    assert removed == 2
    assert await _anchors(db) == []


@pytest.mark.asyncio
async def test_retraction_counts_a_shared_row_once(db):
    """Anchor matched by BOTH plant_id and photo_url must not be double-counted."""
    await add_anchor(db, 42, _embedding(1), plant_id=7, photo_url="https://r2/a.jpg")

    assert await retract_plant_anchors(db, 7, "https://r2/a.jpg") == 1


@pytest.mark.asyncio
async def test_deleting_a_photo_retracts_only_its_anchor(db):
    await add_anchor(db, 42, _embedding(1), plant_id=7, photo_url="https://r2/a.jpg")
    await add_anchor(db, 42, _embedding(2), plant_id=7, photo_url="https://r2/b.jpg")

    removed = await retract_photo_anchor(db, "https://r2/a.jpg")

    assert removed == 1
    assert [r["source_photo_url"] for r in await _anchors(db)] == ["https://r2/b.jpg"]


@pytest.mark.asyncio
async def test_retracting_nothing_is_not_an_error(db):
    assert await retract_plant_anchors(db, 404) == 0
    assert await retract_photo_anchor(db, "") == 0
    assert await retract_photo_anchor(db, "https://r2/never-seen.jpg") == 0


@pytest.mark.asyncio
async def test_a_broken_table_never_raises_into_the_caller(db, monkeypatch):
    """Anchors are an optimisation — no user-facing flow may fail over one."""
    await db.execute("DROP TABLE user_confirmed_embeddings")

    assert await add_anchor(db, 42, _embedding(1)) == "invalid"
    assert await retract_plant_anchors(db, 7) == 0
    assert await retract_photo_anchor(db, "https://r2/a.jpg") == 0
    assert user_refs.EMBEDDING_BYTES == 2048


# ── single-anchor retraction (admin review, #940) ───────────────────────────

@pytest.mark.asyncio
async def test_admin_can_retract_one_anchor_by_id(db):
    await add_anchor(db, 42, _embedding(1), account_id=1, photo_url="https://r2/a.jpg")
    await add_anchor(db, 42, _embedding(2), account_id=2, photo_url="https://r2/b.jpg")

    assert await retract_anchor(db, 1) is True
    remaining = await _anchors(db)
    assert [r["id"] for r in remaining] == [2]


@pytest.mark.asyncio
async def test_retracting_a_missing_anchor_is_false(db):
    await add_anchor(db, 42, _embedding(1), account_id=1)

    assert await retract_anchor(db, 999) is False
    assert len(await _anchors(db)) == 1
