"""Identify outcome telemetry — did the answer stick? (#866 phase 3)

`identify_log` used to record only that an identify happened. These tests cover
the added half: what the engine led with, what the user actually committed, and
the admin rollup that turns those two into "BioCLIP missed, PlantNet got it".
"""
import datetime

import pytest

from routers.admin_panel import _identify_outcomes
from routers.plant_id import _log_identify, _log_identify_choice

ACCOUNT = {"account_id": 1, "household_id": 1}
OTHER_ACCOUNT = {"account_id": 2, "household_id": 1}


async def _rows(db):
    return await db.execute_fetchall("SELECT * FROM identify_log ORDER BY id")


# ── writing the log ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_log_identify_records_what_the_engine_led_with(seeded_db):
    identify_id = await _log_identify(
        seeded_db, ACCOUNT, "bioclip", "medium",
        top_species_id=42, top_confidence=0.31,
    )

    assert identify_id is not None  # handed to the client as identify_id
    row = (await _rows(seeded_db))[0]
    assert row["engine"] == "bioclip"
    assert row["top_species_id"] == 42
    assert row["top_confidence"] == pytest.approx(0.31)
    assert row["committed_at"] is None  # nothing committed yet


@pytest.mark.asyncio
async def test_log_identify_without_a_top_candidate(seeded_db):
    """no_match, or a PlantNet pick that isn't in our catalog: the absence is
    itself the signal, so it must not blow up the write."""
    identify_id = await _log_identify(seeded_db, ACCOUNT, "plantnet", "no_match")

    assert identify_id is not None
    row = (await _rows(seeded_db))[0]
    assert row["top_species_id"] is None
    assert row["top_confidence"] is None


@pytest.mark.asyncio
async def test_commit_records_the_species_the_user_kept(seeded_db):
    identify_id = await _log_identify(
        seeded_db, ACCOUNT, "bioclip", "low", top_species_id=42, top_confidence=0.2
    )

    await _log_identify_choice(seeded_db, identify_id, ACCOUNT, 99, "plantnet")

    row = (await _rows(seeded_db))[0]
    assert row["chosen_species_id"] == 99      # not what BioCLIP led with
    assert row["chosen_source"] == "plantnet"
    assert row["committed_at"] is not None


@pytest.mark.asyncio
async def test_choice_cannot_be_written_into_another_accounts_row(seeded_db):
    identify_id = await _log_identify(seeded_db, ACCOUNT, "bioclip", "high", 42, 0.4)

    await _log_identify_choice(seeded_db, identify_id, OTHER_ACCOUNT, 99, "plantnet")

    row = (await _rows(seeded_db))[0]
    assert row["chosen_species_id"] is None
    assert row["committed_at"] is None


@pytest.mark.asyncio
async def test_unknown_source_is_stored_as_null_not_echoed(seeded_db):
    identify_id = await _log_identify(seeded_db, ACCOUNT, "bioclip", "high", 42, 0.4)

    await _log_identify_choice(seeded_db, identify_id, ACCOUNT, 42, "haiku-oracle")

    row = (await _rows(seeded_db))[0]
    assert row["chosen_source"] is None
    assert row["chosen_species_id"] == 42  # the choice itself still lands


# ── the rollup ──────────────────────────────────────────────────────────────

async def _seed_outcome(db, *, engine, top, chosen, source="plantnet", committed=True):
    await db.execute(
        "INSERT INTO identify_log (account_id, household_id, engine, outcome, "
        "  top_species_id, chosen_species_id, chosen_source, committed_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (1, 1, engine, "medium", top, chosen, source,
         datetime.datetime.now() if committed else None),
    )
    await db.commit()


@pytest.fixture
def start_date():
    return (datetime.date.today() - datetime.timedelta(days=30)).isoformat()


@pytest.mark.asyncio
async def test_outcomes_split_accepted_from_missed(seeded_db, start_date):
    await seeded_db.execute(
        "CREATE TABLE plant_species (id INTEGER PRIMARY KEY, latin_name TEXT, common_name_nl TEXT)"
    )
    await seeded_db.execute(
        "INSERT INTO plant_species (id, latin_name, common_name_nl) VALUES (99, 'Silene dioica', 'Dagkoekoeksbloem')"
    )
    await _seed_outcome(seeded_db, engine="bioclip", top=42, chosen=42, source="bioclip")
    await _seed_outcome(seeded_db, engine="bioclip", top=42, chosen=99)
    await _seed_outcome(seeded_db, engine="bioclip", top=None, chosen=99)

    out = await _identify_outcomes(seeded_db, start_date)

    assert out["committed"] == 3
    assert out["bioclip_accepted"] == 1
    assert out["bioclip_misses"] == 2
    assert out["miss_rate"] == pytest.approx(2 / 3, abs=0.001)
    # The ranked list is the work queue: what users had to reach past BioCLIP for.
    assert out["missed_species"] == [{
        "species_id": 99, "latin_name": "Silene dioica",
        "common_name_nl": "Dagkoekoeksbloem", "count": 2,
    }]


@pytest.mark.asyncio
async def test_uncommitted_identifies_are_not_counted(seeded_db, start_date):
    await seeded_db.execute("CREATE TABLE plant_species (id INTEGER PRIMARY KEY, latin_name TEXT, common_name_nl TEXT)")
    await _seed_outcome(seeded_db, engine="bioclip", top=42, chosen=None, committed=False)

    out = await _identify_outcomes(seeded_db, start_date)

    assert out["committed"] == 0
    assert out["bioclip_misses"] == 0


@pytest.mark.asyncio
async def test_miss_rate_is_null_with_no_data(seeded_db, start_date):
    """'No data' and 'never misses' must not render the same on the dashboard."""
    await seeded_db.execute("CREATE TABLE plant_species (id INTEGER PRIMARY KEY, latin_name TEXT, common_name_nl TEXT)")

    out = await _identify_outcomes(seeded_db, start_date)

    assert out["miss_rate"] is None
    assert out["missed_species"] == []


@pytest.mark.asyncio
async def test_missing_columns_degrade_instead_of_500ing(seeded_db, start_date):
    """A DB that hasn't run migration 0068 must not take the dashboard down."""
    await seeded_db.execute("DROP TABLE identify_log")
    await seeded_db.execute(
        "CREATE TABLE identify_log (id INTEGER PRIMARY KEY, engine TEXT, created_at DATETIME)"
    )

    out = await _identify_outcomes(seeded_db, start_date)

    assert out == {
        "committed": 0, "bioclip_accepted": 0, "bioclip_misses": 0,
        "miss_rate": None, "missed_species": [],
    }
