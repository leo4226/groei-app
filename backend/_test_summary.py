"""Quick test: check DB state for warnings/summary endpoint."""
import asyncio
import os
import sys
sys.path.insert(0, '.')
import aiosqlite

DB_PATH = os.path.join(os.path.dirname(__file__), "floreren.db")
print(f"DB path: {DB_PATH}")

async def test():
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    
    # Check tables
    tables = await db.execute_fetchall("SELECT name FROM sqlite_master WHERE type='table'")
    print('Tables:', [t['name'] for t in tables])
    
    # Check users/accounts
    users = await db.execute_fetchall("SELECT id, name, household_id FROM accounts")
    print(f'Users ({len(users)}):')
    for u in users:
        print(f'  id={u["id"]} name={u["name"]} household_id={u["household_id"]}')
    
    # Check plants with map info
    plants = await db.execute_fetchall(
        'SELECT p.id, p.name, p.care_profile, m.map_type, p.household_id '
        'FROM plants p LEFT JOIN maps m ON p.map_id = m.id '
        'WHERE p.is_active = 1'
    )
    print(f'Plants ({len(plants)}):')
    for p in plants:
        profile = p['care_profile']
        print(f'  id={p["id"]} name={p["name"]} map_type={p["map_type"]} hh={p["household_id"]}')
        print(f'    profile: {str(profile)[:150] if profile else None}')
    
    # Check care schedules
    schedules = await db.execute_fetchall('SELECT * FROM care_schedules WHERE is_active = 1')
    print(f'Active schedules: {len(schedules)}')
    for s in schedules[:10]:
        print(f'  plant_id={s["plant_id"]} care_type={s["care_type"]} next_due={s.get("next_due")} last_done={s.get("last_done")}')
    
    await db.close()

asyncio.run(test())
