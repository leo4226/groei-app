# groei/backend/services/db_adapter.py
"""asyncpg adapter preserving the legacy aiosqlite call surface used by routers."""

import asyncpg


def qm_to_pg(sql: str) -> str:
    """Convert `?` placeholders to `$N` (Postgres style). Pragmatic — does not
    parse out `?` inside string literals."""
    out = []
    i = 0
    for ch in sql:
        if ch == "?":
            i += 1
            out.append(f"${i}")
        else:
            out.append(ch)
    return "".join(out)


class DbAdapter:
    """Wraps an asyncpg.Connection (or pool-acquired connection)."""

    def __init__(self, conn: asyncpg.Connection) -> None:
        self._conn = conn
        self.lastrowid: int | None = None

    async def execute_fetchall(
        self, sql: str, params: tuple | list = ()
    ) -> list[dict]:
        rows = await self._conn.fetch(qm_to_pg(sql), *params)
        return [dict(r) for r in rows]

    async def execute(self, sql: str, params: tuple | list = ()) -> "DbAdapter":
        pg_sql = qm_to_pg(sql)
        head = pg_sql.lstrip().upper()
        if head.startswith("INSERT") and "RETURNING" not in head:
            pg_sql_returning = pg_sql.rstrip(" ;") + " RETURNING id"
            row = await self._conn.fetchrow(pg_sql_returning, *params)
            self.lastrowid = row["id"] if row else None
        elif head.startswith("INSERT") and "RETURNING ID" in head:
            row = await self._conn.fetchrow(pg_sql, *params)
            self.lastrowid = row["id"] if row else None
        else:
            await self._conn.execute(pg_sql, *params)
            self.lastrowid = None
        return self

    async def commit(self) -> None:
        # asyncpg auto-commits outside an explicit transaction. No-op here.
        return
