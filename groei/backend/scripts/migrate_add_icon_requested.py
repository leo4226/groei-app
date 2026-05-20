"""One-off migration: add icon_requested column to plants table."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

async def main():
    dsn = os.environ["DATABASE_URL"]
    import asyncpg
    conn = await asyncpg.connect(dsn)
    try:
        # Check if column already exists
        row = await conn.fetchrow(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='plants' AND column_name='icon_requested'"
        )
        if row:
            print("Column icon_requested already exists — skipping.")
            return

        await conn.execute(
            "ALTER TABLE plants ADD COLUMN icon_requested BOOLEAN DEFAULT FALSE"
        )
        print("✅ Added icon_requested column to plants table.")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
