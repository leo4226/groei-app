"""Check plants table schema."""
import asyncio
import os
import sys
sys.path.insert(0, '.')
import aiosqlite

DB_PATH = os.path.join(os.path.dirname(__file__), "floreren.db")

async def test():
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    
    # Check plants table schema
    info = await db.execute_fetchall("PRAGMA table_info(plants)")
    print("Plants columns:")
    for col in info:
        print(f"  {col['name']:20s} {col['type']:10s} nullable={not col['notnull']}")
    
    print("\n---")
    # Check if icon_variant is in objects table instead
    obj_info = await db.execute_fetchall("PRAGMA table_info(objects)")
    print("Objects columns:")
    for col in obj_info:
        print(f"  {col['name']:20s} {col['type']:10s} nullable={not col['notnull']}")
    
    await db.close()

asyncio.run(test())
