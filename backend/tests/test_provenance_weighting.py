"""Provenance weighting for user-confirmed anchors (#940).

Behaviour under test:
  - a household's OWN anchors count at full strength: a single strong own ref
    rescues a species (the un-gated behaviour from #442 is preserved for own
    refs) and gets a small ranking boost over a foreign corroborated match;
  - a single-source FOREIGN anchor does NOT rescue a species for other
    households — corroboration from >= 2 distinct source households is needed;
  - multiple refs from ONE foreign household still count as one source;
  - callers without a household (legacy, guest game) keep the old
    single-ref-from-anywhere semantics;
  - the admin anchor review list shows provenance, and retraction removes an
    anchor from the pool.
"""
import math

import numpy as np
import pytest
import pytest_asyncio

from routers.plant_id import (
    _blend_scores,
    _group_refs_by_provenance,
    _IMAGE_MATCH_MIN,
    _MIN_CORROBORATING_HOUSEHOLDS,
    _OWN_REF_BOOST,
    _provenance_image_score,
)

# Cosines chosen relative to the floor so these tests survive floor tuning.
_STRONG = min(_IMAGE_MATCH_MIN + 0.1, 0.999)
_WEAK = _IMAGE_MATCH_MIN - 0.2

_QUERY = np.array([1.0, 0.0], dtype=np.float32)


def _refs_at_cosines(*cosines: float) -> np.ndarray:
    """Stack unit rows whose cosine with _QUERY = [1, 0] is exactly each value."""
    rows = [np.array([c, math.sqrt(max(0.0, 1.0 - c * c))], dtype=np.float32) for c in cosines]
    return np.stack(rows)


def _own_foreign(own=(), foreign=None):
    """Build the structured refs entry the loader produces."""
    foreign = foreign or {}
    return {
        "own": _refs_at_cosines(*own) if own else None,
        "foreign": {h: _refs_at_cosines(*cos) for h, cos in foreign.items()},
    }


# ── own anchors: single-ref rescue preserved (no re-gating) ────────────────

def test_own_single_ref_still_rescues():
    """The #442 un-gating is NOT re-introduced for the household's own refs."""
    assert _MIN_CORROBORATING_HOUSEHOLDS >= 2  # the rule is about households
    text = [(1, 0.30), (2, 0.25)]
    refs = {99: _own_foreign(own=(_STRONG,))}  # one OWN ref, strong
    out = _blend_scores(text, _QUERY, refs, household_id=7)
    assert out[0][0] == 99  # rescued


def test_own_ref_gets_a_ranking_boost():
    refs = {1: _own_foreign(own=(_STRONG,))}
    out = _blend_scores([(1, 0.10)], _QUERY, refs, household_id=7)
    assert out[0][1] == pytest.approx(min(_STRONG + _OWN_REF_BOOST, 1.0), abs=1e-5)


def test_own_outranks_foreign_at_equal_cosine():
    """At equal raw cosine, the household's own confirmation ranks first."""
    refs = {
        1: _own_foreign(own=(_STRONG,)),
        2: _own_foreign(foreign={10: (_STRONG,), 11: (_STRONG,)}),  # corroborated
    }
    out = _blend_scores([(1, 0.10), (2, 0.10)], _QUERY, refs, household_id=7)
    assert out[0][0] == 1
    assert out[0][1] > out[1][1]


# ── foreign anchors: corroboration required ────────────────────────────────

def test_foreign_single_source_does_not_rescue():
    """A single-source foreign anchor must not rescue the species for a
    household that did not confirm it — the poisoning gap #940 closes."""
    text = [(1, 0.30), (2, 0.25)]
    refs = {99: _own_foreign(foreign={10: (_STRONG,)})}  # ONE foreign household
    out = _blend_scores(text, _QUERY, refs, household_id=7)
    assert out == text  # unchanged: 99 never appears


def test_foreign_multiple_refs_same_household_do_not_corroborate():
    """Several refs from ONE foreign household still count as one source."""
    text = [(1, 0.30)]
    refs = {99: _own_foreign(foreign={10: (_STRONG, _STRONG, _STRONG)})}
    out = _blend_scores(text, _QUERY, refs, household_id=7)
    assert out == text


def test_foreign_two_households_corroborate():
    text = [(1, 0.30)]
    refs = {99: _own_foreign(foreign={10: (_STRONG,), 11: (_STRONG,)})}
    out = _blend_scores(text, _QUERY, refs, household_id=7)
    assert out[0] == (99, pytest.approx(_STRONG, abs=1e-5))


def test_weak_foreign_matches_never_corroborate():
    """Corroboration counts STRONG matches only — a weak match from a second
    household is not corroboration."""
    text = [(1, 0.30)]
    refs = {99: _own_foreign(foreign={10: (_STRONG,), 11: (_WEAK,)})}
    out = _blend_scores(text, _QUERY, refs, household_id=7)
    assert out == text


def test_own_plus_foreign_single_source_counts_as_own():
    """Own confirmation alone is enough; an extra single-source foreign ref
    changes nothing (own branch wins before corroboration is consulted)."""
    refs = {1: _own_foreign(own=(_STRONG,), foreign={10: (_STRONG,)})}
    out = _blend_scores([(1, 0.10)], _QUERY, refs, household_id=7)
    assert out[0][0] == 1


def test_orphan_anchors_never_corroborate():
    """Anchors without a source account each sit in their own NULL 'household'
    bucket, so orphan anchors can never corroborate each other."""
    text = [(1, 0.30)]
    refs = {99: _own_foreign(foreign={None: (_STRONG, _STRONG)})}  # 2 orphan refs
    out = _blend_scores(text, _QUERY, refs, household_id=7)
    assert out == text

# ── legacy callers without a household ──────────────────────────────────────

def test_no_household_keeps_legacy_single_ref_semantics():
    """A caller that cannot name its household (guest game, old callers) keeps
    the pre-#940 behaviour: any single strong ref rescues."""
    text = [(1, 0.30)]
    refs = {99: _own_foreign(foreign={10: (_STRONG,)})}
    out = _blend_scores(text, _QUERY, refs, household_id=None)
    assert out[0][0] == 99


def test_legacy_ndarray_refs_treated_as_own():
    """Plain stacked arrays (the pre-#940 refs format) keep working and
    rescue from a single strong ref even with a household present."""
    text = [(1, 0.30)]
    out = _blend_scores(text, _QUERY, refs_by_species={99: _refs_at_cosines(_STRONG)}, household_id=7)
    assert out[0][0] == 99


def test_group_refs_by_provenance_splits_own_and_foreign():
    rows = [
        {"species_id": 42, "embedding": _refs_at_cosines(0.9).tobytes(), "source_household_id": 7},
        {"species_id": 42, "embedding": _refs_at_cosines(0.8).tobytes(), "source_household_id": 10},
        {"species_id": 42, "embedding": _refs_at_cosines(0.7).tobytes(), "source_household_id": 10},
        {"species_id": 42, "embedding": _refs_at_cosines(0.6).tobytes(), "source_household_id": None},
    ]
    grouped = _group_refs_by_provenance(rows, household_id=7)

    assert set(grouped) == {42}
    entry = grouped[42]
    assert entry["own"] is not None and entry["own"].shape == (1, 2)
    assert set(entry["foreign"].keys()) == {10, None}
    assert entry["foreign"][10].shape == (2, 2)
    assert entry["foreign"][None].shape == (1, 2)


def test_group_refs_by_provenance_no_own_keeps_foreign_only():
    rows = [
        {"species_id": 42, "embedding": _refs_at_cosines(0.9).tobytes(), "source_household_id": 10},
    ]
    grouped = _group_refs_by_provenance(rows, household_id=7)
    assert grouped[42]["own"] is None
    assert 10 in grouped[42]["foreign"]


def test_provenance_score_constants_are_sane():
    assert 0 < _OWN_REF_BOOST < 0.05
    assert _MIN_CORROBORATING_HOUSEHOLDS == 2

# ── admin anchor review list + retraction ───────────────────────────────────

EXTRA_SCHEMA = """
    CREATE TABLE plant_species (
        id INTEGER PRIMARY KEY,
        common_name_nl TEXT,
        latin_name TEXT,
        care_thresholds TEXT
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


@pytest_asyncio.fixture
async def anchor_admin_db(seeded_db):
    await seeded_db.executescript(EXTRA_SCHEMA)
    await seeded_db.executescript("""
        INSERT INTO households (id, name) VALUES (2, 'Other household');
        INSERT INTO accounts (id, household_id, email, name, password_hash, role, created_at)
            VALUES (2, 2, 'other@example.com', 'Other', 'x', 'owner', '2026-06-01');
        UPDATE accounts SET is_admin = 1 WHERE id = 1;

        INSERT INTO plant_species (id, common_name_nl, latin_name) VALUES
            (42, 'Paardenbloem', 'Taraxacum officinale'),
            (43, 'Brandnetel', 'Urtica dioica');

        INSERT INTO user_confirmed_embeddings
            (id, species_id, embedding, source_account_id, source_photo_url, source_plant_id, created_at)
        VALUES
            (1, 42, X'00', 1, 'https://cdn.test/own.jpg', 11, '2026-07-01'),
            (2, 42, X'00', 2, 'https://cdn.test/foreign.jpg', 22, '2026-07-02'),
            (3, 43, X'00', NULL, 'https://cdn.test/orphan.jpg', NULL, '2026-07-03');
    """)
    await seeded_db.commit()
    return seeded_db


@pytest.mark.asyncio
async def test_admin_anchors_list_shows_provenance(client, anchor_admin_db, auth_header):
    res = await client.get("/api/admin-panel/anchors", headers=auth_header)
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 3
    by_id = {r["id"]: r for r in data["rows"]}
    own = by_id[1]
    assert own["latin_name"] == "Taraxacum officinale"
    assert own["source_household_id"] == 1
    assert own["source_household_name"] == "Test Household"
    assert own["source_account_email"] == "test@example.com"
    assert own["source_photo_url"] == "https://cdn.test/own.jpg"
    assert own["created_at"] is not None
    foreign = by_id[2]
    assert foreign["source_household_id"] == 2
    assert foreign["source_household_name"] == "Other household"
    orphan = by_id[3]
    assert orphan["source_account_id"] is None
    assert orphan["source_household_id"] is None
    # Species 42 is backed by two distinct households, species 43 by none.
    assert by_id[1]["backing_households"] == 2
    assert by_id[3]["backing_households"] == 0


@pytest.mark.asyncio
async def test_admin_anchors_filter_unprovenanced(client, anchor_admin_db, auth_header):
    res = await client.get("/api/admin-panel/anchors", params={"filter": "unprovenanced"}, headers=auth_header)
    assert res.status_code == 200
    data = res.json()
    assert [r["id"] for r in data["rows"]] == [3]


@pytest.mark.asyncio
async def test_admin_retract_anchor_removes_it_from_the_pool(client, anchor_admin_db, auth_header):
    res = await client.post("/api/admin-panel/anchors/2/retract", headers=auth_header)
    assert res.status_code == 200
    assert res.json() == {"ok": True, "anchor_id": 2}

    rows = await anchor_admin_db.execute_fetchall(
        "SELECT id FROM user_confirmed_embeddings ORDER BY id"
    )
    assert [r["id"] for r in rows] == [1, 3]


@pytest.mark.asyncio
async def test_admin_retract_missing_anchor_is_404(client, anchor_admin_db, auth_header):
    res = await client.post("/api/admin-panel/anchors/999/retract", headers=auth_header)
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_admin_retract_requires_admin(client, anchor_admin_db):
    from auth import create_token
    # account 2 is not an admin
    headers = {"Authorization": f"Bearer {create_token(account_id=2, household_id=2)}"}
    res = await client.get("/api/admin-panel/anchors", headers=headers)
    assert res.status_code == 403
