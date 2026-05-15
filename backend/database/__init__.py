     1|"""Database module — connection handling and initialisation."""
     2|import os
     3|from contextlib import asynccontextmanager
     4|import aiosqlite
     5|
     6|DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "floreren.db")
     7|
     8|
     9|@asynccontextmanager
    10|async def get_db():
    11|    """Async context manager for use with 'async with'. Used by init_db and scripts."""
    12|    db = await aiosqlite.connect(DB_PATH)
    13|    db.row_factory = aiosqlite.Row
    14|    try:
    15|        yield db
    16|    finally:
    17|        await db.close()
    18|
    19|
    20|async def db_dep():
    21|    """Async generator for FastAPI Depends injection. Enables test overrides."""
    22|    db = await aiosqlite.connect(DB_PATH)
    23|    db.row_factory = aiosqlite.Row
    24|    try:
    25|        yield db
    26|    finally:
    27|        await db.close()
    28|
    29|
    30|async def init_db():
    31|    """Initialise database: schema → migrations → seeds."""
    32|    from . import schema, migrations, seeds
    33|    async with get_db() as db:
    34|        await schema.apply(db)
    35|        await migrations.apply(db)
    36|        await seeds.apply(db)
    37|