# groei/backend/services/db_adapter.py
"""asyncpg adapter preserving the legacy aiosqlite call surface used by routers."""

import re
from contextlib import asynccontextmanager

import asyncpg


def qm_to_pg(sql: str) -> str:
    """Convert ? placeholders to $N and SQLite boolean literals to PG syntax."""
    # Step 1: convert ? → $N placeholders
    out = []
    i = 0
    for ch in sql:
        if ch == "?":
            i += 1
            out.append(f"${i}")
        else:
            out.append(ch)
    sql = "".join(out)

    # Step 2: convert SQLite boolean comparisons (column = 1/0) to PG (column = TRUE/FALSE)
    # Pattern: word-boundary + optional table_alias.column_name = 1/0
    # Word boundary \b anchors to start of column name without consuming space.
    sql = re.sub(
        r"\b(\w+(?:\.\w+)?)\s*=\s*1\b",
        lambda m: f"{m.group(1)} = TRUE" if _is_known_boolean(m.group(1)) else m.group(0),
        sql,
    )
    sql = re.sub(
        r"\b(\w+(?:\.\w+)?)\s*=\s*0\b",
        lambda m: f"{m.group(1)} = FALSE" if _is_known_boolean(m.group(1)) else m.group(0),
        sql,
    )
    # Step 3: convert SQLite COLLATE NOCASE → PG LOWER(column)
    # PostgreSQL does not ship a built-in NOCASE collation;
    # using COLLATE NOCASE on PG raises:
    #   UndefinedObjectError: collation "nocase" for encoding "UTF8" does not exist
    sql = re.sub(
        r"(\w+(?:\.\w+)?)\s+COLLATE\s+NOCASE",
        r"LOWER(\1)",
        sql,
        flags=re.IGNORECASE,
    )
    return sql


#: Tables whose primary key is NOT a column called `id` — join tables and
#: singleton-per-owner rows. `execute()` emulates SQLite's lastrowid by
#: appending "RETURNING id" to bare INSERTs, which asks these tables for a
#: column they do not have and fails the whole statement with
#: `UndefinedColumnError: column "id" does not exist`.
#:
#: That is how creating ANY game 500'd: `INSERT INTO game_session_maps` runs on
#: every game creation. Call sites had been working around it one at a time by
#: adding an explicit RETURNING (see `_get_or_create_prefs` in
#: routers/notifications.py, which even documents the trap) — which fixes that
#: caller and leaves the next one to discover it in production.
#:
#: Regenerate after adding a table:
#:   grep -A20 'CREATE TABLE' alembic/versions/*.py   # any without an `id` column
_TABLES_WITHOUT_ID = frozenset({
    "care_rhythm_operation_members",
    "game_session_maps",
    "garden_care_operation_members",
    "household_calendar_grouping_preferences",
    "household_calendar_grouping_rules",
    "household_care_rhythm_preferences",
    "map_care_rhythm_overrides",
    "notification_preferences",
    "plantnet_quota",
    "streken",
    "weather_cache",
    "weather_warning_account_state",
})

_INSERT_TARGET = re.compile(r'^\s*INSERT\s+INTO\s+"?(\w+)"?', re.IGNORECASE)


def insert_target_table(sql: str) -> str | None:
    """The table an INSERT writes to, or None when `sql` is not an INSERT."""
    match = _INSERT_TARGET.match(sql)
    return match.group(1).lower() if match else None


def can_return_id(sql: str) -> bool:
    """Whether appending "RETURNING id" to this INSERT is safe.

    False for a table with no `id` column — asking for one there is not a
    missing value, it is a statement that cannot be prepared.
    """
    table = insert_target_table(sql)
    return table is not None and table not in _TABLES_WITHOUT_ID


# Known boolean columns in the PG schema that were compared to 1/0 in SQLite
_BOOLEAN_COLUMNS = frozenset({
    "is_active",
    "edible",
    "native_to_nl",
    "skipped",
    "leaf_retention",
})


def _is_known_boolean(ref: str) -> bool:
    """Check if the SQL reference (e.g. 'is_active' or 'p.is_active') is a known boolean column."""
    col = ref.split(".")[-1]  # handle table_alias.column_name
    return col in _BOOLEAN_COLUMNS


class DbAdapter:
    """Wraps an asyncpg.Connection (or pool-acquired connection).

    Preserves the legacy aiosqlite call surface:
      cursor = await db.execute("SELECT ...")  → returns self
      rows = await cursor.fetchall()           → returns list[dict]
      row = await cursor.fetchone()            → returns dict | None
    """

    def __init__(self, conn: asyncpg.Connection) -> None:
        self._conn = conn
        self.lastrowid: int | None = None
        self.rowcount: int = 0
        self._last_result: list[dict] | None = None

    async def execute_fetchall(
        self, sql: str, params: tuple | list = ()
    ) -> list[dict]:
        rows = await self._conn.fetch(qm_to_pg(sql), *params)
        return [dict(r) for r in rows]

    async def execute(self, sql: str, params: tuple | list = ()) -> "DbAdapter":
        pg_sql = qm_to_pg(sql)
        head = pg_sql.lstrip().upper()

        if head.startswith("INSERT") and "RETURNING" not in head and can_return_id(pg_sql):
            pg_sql_returning = pg_sql.rstrip(" ;") + " RETURNING id"
            row = await self._conn.fetchrow(pg_sql_returning, *params)
            self.lastrowid = row["id"] if row else None
            self._last_result = None
        elif head.startswith("INSERT") and "RETURNING" not in head:
            # A table with no id column: run it as-is. There is no row id to
            # report, and callers writing to these tables do not ask for one.
            await self._conn.execute(pg_sql, *params)
            self.lastrowid = None
            self._last_result = None
        elif head.startswith("INSERT") and "RETURNING ID" in head:
            row = await self._conn.fetchrow(pg_sql, *params)
            self.lastrowid = row["id"] if row else None
            self._last_result = None
        elif head.startswith("SELECT") or head.startswith("WITH"):
            # Return rows so fetchall()/fetchone() work
            rows = await self._conn.fetch(pg_sql, *params)
            self._last_result = [dict(r) for r in rows]
            self.lastrowid = None
        else:
            # DELETE, UPDATE, etc. — no rows returned
            # asyncpg returns a status string like "DELETE 1" or "UPDATE 0"
            status = await self._conn.execute(pg_sql, *params)
            self._last_result = None
            self.lastrowid = None
            try:
                self.rowcount = int(status.split()[-1])
            except (ValueError, IndexError, AttributeError):
                self.rowcount = 0
        return self

    async def fetchall(self) -> list[dict]:
        return list(self._last_result) if self._last_result else []

    async def fetchone(self) -> dict | None:
        return self._last_result[0] if self._last_result else None

    @asynccontextmanager
    async def transaction(self):
        """Run a group of adapter statements in one asyncpg transaction."""
        async with self._conn.transaction():
            yield self

    async def commit(self) -> None:
        # asyncpg auto-commits outside an explicit transaction. No-op here.
        return
