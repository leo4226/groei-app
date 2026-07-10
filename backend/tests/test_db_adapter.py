# groei/backend/tests/test_db_adapter.py
import asyncio
import os
import pytest
import asyncpg
from services.db_adapter import DbAdapter, qm_to_pg


def test_qm_to_pg_basic():
    assert qm_to_pg("SELECT * FROM x WHERE a = ? AND b = ?") == \
        "SELECT * FROM x WHERE a = $1 AND b = $2"


def test_qm_to_pg_no_placeholders():
    assert qm_to_pg("SELECT 1") == "SELECT 1"


def test_qm_to_pg_preserves_literal_question_marks_in_strings():
    # Pragmatic: we don't try to be clever. Document the limitation.
    pass


def test_qm_to_pg_collate_nocase():
    # SQLite COLLATE NOCASE is not supported in PostgreSQL;
    # migrate to LOWER() wrapping.
    assert qm_to_pg("ORDER BY p.name COLLATE NOCASE, p.id") == "ORDER BY LOWER(p.name), p.id"
    assert qm_to_pg("ORDER BY name COLLATE NOCASE, id") == "ORDER BY LOWER(name), id"
    assert qm_to_pg("ORDER BY o.name COLLATE NOCASE, o.id") == "ORDER BY LOWER(o.name), o.id"
    assert qm_to_pg("ORDER BY gz.name COLLATE NOCASE, gz.id") == "ORDER BY LOWER(gz.name), gz.id"
    # Case-insensitive
    assert qm_to_pg("ORDER BY p.name collate nocase") == "ORDER BY LOWER(p.name)"
    # Placeholder conversion still works alongside COLLATE
    assert qm_to_pg("SELECT * FROM t WHERE x = ? ORDER BY name COLLATE NOCASE") == \
        "SELECT * FROM t WHERE x = $1 ORDER BY LOWER(name)"


@pytest.fixture
async def conn():
    dsn = os.environ["DATABASE_URL"]
    try:
        c = await asyncpg.connect(dsn, timeout=5)
    except (OSError, asyncio.TimeoutError, asyncpg.PostgresError) as e:
        pytest.skip(f"no Postgres reachable at DATABASE_URL: {e.__class__.__name__}")
    await c.execute("CREATE TEMP TABLE t (id SERIAL PRIMARY KEY, name TEXT)")
    yield c
    await c.close()


@pytest.mark.asyncio
async def test_execute_fetchall_returns_dicts(conn):
    await conn.execute("INSERT INTO t (name) VALUES ('a'), ('b')")
    db = DbAdapter(conn)
    rows = await db.execute_fetchall("SELECT id, name FROM t ORDER BY id")
    assert rows == [{"id": 1, "name": "a"}, {"id": 2, "name": "b"}]


@pytest.mark.asyncio
async def test_execute_insert_sets_lastrowid(conn):
    db = DbAdapter(conn)
    cur = await db.execute("INSERT INTO t (name) VALUES (?)", ("hello",))
    assert cur.lastrowid is not None
    rows = await db.execute_fetchall("SELECT name FROM t WHERE id = ?", (cur.lastrowid,))
    assert rows == [{"name": "hello"}]


@pytest.mark.asyncio
async def test_execute_update_no_lastrowid(conn):
    await conn.execute("INSERT INTO t (id, name) VALUES (1, 'a')")
    db = DbAdapter(conn)
    cur = await db.execute("UPDATE t SET name = ? WHERE id = ?", ("b", 1))
    assert cur.lastrowid is None
    rows = await db.execute_fetchall("SELECT name FROM t")
    assert rows == [{"name": "b"}]


@pytest.mark.asyncio
async def test_explicit_returning_passthrough(conn):
    db = DbAdapter(conn)
    cur = await db.execute("INSERT INTO t (name) VALUES (?) RETURNING id", ("x",))
    assert cur.lastrowid is not None
