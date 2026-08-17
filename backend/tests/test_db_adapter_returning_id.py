"""Which INSERTs may be given a "RETURNING id" tail.

`DbAdapter.execute` emulates SQLite's `lastrowid` by appending "RETURNING id"
to bare INSERTs. Against a table whose primary key is not a column called `id`
that is not a missing value — it is a statement Postgres cannot prepare, and
the whole request 500s.

That is how creating any game failed: every game creation inserts into
`game_session_maps`, whose PK is (session_id, map_id). The SQLite test seam
never saw it, because the adapter is the Postgres path and is not used there.
"""
from services.db_adapter import can_return_id, insert_target_table


def test_reads_the_target_table_of_an_insert():
    assert insert_target_table("INSERT INTO plants (name) VALUES ($1)") == "plants"
    assert insert_target_table('  insert into "plant_photos" (id) VALUES (1)') == "plant_photos"
    assert insert_target_table("SELECT id FROM plants") is None
    assert insert_target_table("UPDATE plants SET name = $1") is None


def test_ordinary_tables_may_return_an_id():
    assert can_return_id("INSERT INTO plants (name) VALUES ($1)")
    assert can_return_id("INSERT INTO game_sessions (join_code) VALUES ($1)")
    assert can_return_id("INSERT INTO plant_photos (plant_id) VALUES ($1)")


def test_join_tables_may_not():
    # The one that broke game creation in production.
    assert not can_return_id(
        "INSERT INTO game_session_maps (session_id, map_id) VALUES ($1, $2)")
    # And the rest of the id-less set, so adding one is a one-line change here
    # rather than a 500 discovered by a user.
    for table in ("notification_preferences", "plantnet_quota", "weather_cache",
                  "weather_warning_account_state", "streken",
                  "garden_care_operation_members"):
        assert not can_return_id(f"INSERT INTO {table} (a) VALUES ($1)"), table


def test_case_and_quoting_do_not_smuggle_a_table_past_the_check():
    assert not can_return_id("insert into game_session_maps (a) VALUES ($1)")
    assert not can_return_id('INSERT INTO "game_session_maps" (a) VALUES ($1)')
    assert not can_return_id("  \n  INSERT   INTO   game_session_maps (a) VALUES ($1)")


def test_the_list_still_matches_the_migrations():
    """A curated list of schema facts rots. This is what stops it.

    Add a table with a composite or renamed primary key and this fails,
    naming it, instead of the next INSERT into it 500ing in production.
    """
    import pathlib
    import re

    from services.db_adapter import _TABLES_WITHOUT_ID

    versions = pathlib.Path(__file__).resolve().parents[1] / "alembic" / "versions"
    created: dict[str, str] = {}
    for path in sorted(versions.glob("*.py")):
        source = path.read_text(encoding="utf-8", errors="ignore")
        for match in re.finditer(
            r"CREATE TABLE (?:IF NOT EXISTS )?(\w+)\s*\((.*?)\n\s*\)", source, re.S
        ):
            created.setdefault(match.group(1), match.group(2))

    idless = {
        name for name, body in created.items()
        if not re.search(r"^\s*id\s+\w", body, re.M | re.I)
    }
    missing = idless - _TABLES_WITHOUT_ID
    assert not missing, (
        f"These tables have no `id` column but are not in _TABLES_WITHOUT_ID: "
        f"{sorted(missing)}. Any INSERT into them via DbAdapter.execute() will "
        f"fail with 'column \"id\" does not exist'. Add them to the set."
    )
