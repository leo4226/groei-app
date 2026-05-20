# groei/backend/database/__init__.py
"""Database module — asyncpg connection pool, FastAPI dependency."""
import os
from contextlib import asynccontextmanager

import asyncpg

from services.db_adapter import DbAdapter

_pool: asyncpg.Pool | None = None


async def init_pool() -> None:
    global _pool
    if _pool is not None:
        return
    dsn = os.environ["DATABASE_URL"]
    _pool = await asyncpg.create_pool(dsn, min_size=1, max_size=10)


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def get_db():
    """For scripts (seed, migrate). Routers should use db_dep instead."""
    assert _pool is not None, "Pool not initialised — call init_pool() first"
    async with _pool.acquire() as conn:
        yield DbAdapter(conn)


async def db_dep():
    """FastAPI dependency. Yields a DbAdapter."""
    assert _pool is not None, "Pool not initialised — check lifespan"
    async with _pool.acquire() as conn:
        yield DbAdapter(conn)
