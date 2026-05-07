"""Database module — connection handling and initialisation."""
import os
from contextlib import asynccontextmanager
import aiosqlite

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "groei.db")


@asynccontextmanager
async def get_db():
    """Async context manager for use with 'async with'. Used by init_db and scripts."""
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()


async def db_dep():
    """Async generator for FastAPI Depends injection. Enables test overrides."""
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()


async def init_db():
    """Initialise database: schema → migrations → seeds."""
    from . import schema, migrations, seeds
    async with get_db() as db:
        await schema.apply(db)
        await migrations.apply(db)
        await seeds.apply(db)
