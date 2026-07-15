"""Small transaction compatibility layer for asyncpg production and SQLite tests."""
from contextlib import asynccontextmanager


def supports_row_locks(db) -> bool:
    return callable(getattr(db, "transaction", None))


def for_update_clause(db) -> str:
    return " FOR UPDATE" if supports_row_locks(db) else ""


@asynccontextmanager
async def database_transaction(db):
    transaction = getattr(db, "transaction", None)
    if callable(transaction):
        async with transaction():
            yield
        return

    if getattr(db, "in_transaction", False):
        yield
        return

    await db.execute("BEGIN")
    try:
        yield
    except BaseException:
        await db.rollback()
        raise
    else:
        await db.commit()
