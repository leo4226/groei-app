"""Reproduce the GET /warnings/summary error directly."""
import asyncio
import json
import os
import sys
from datetime import date

os.environ['JWT_SECRET'] = 'dev-secret-change-me'
sys.path.insert(0, '.')

import aiosqlite
from auth import create_token
from services.warnings import compute_plant_warnings

DB_PATH = os.path.join(os.path.dirname(__file__), "floreren.db")
HOUSEHOLD_ID = 1
ENV = "all"

async def test():
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    
    # Step 1: Fetch plants (same query as endpoint)
    plant_rows = await db.execute_fetchall(
        """SELECT p.id, p.map_id, p.container_id, p.ground_zone_id,
                  p.care_thresholds, p.care_profile, p.name, p.icon_variant,
                  m.map_type, m.name as map_name
           FROM plants p
           LEFT JOIN maps m ON p.map_id = m.id
           WHERE p.household_id = ? AND p.is_active = 1
           ORDER BY p.id""",
        (HOUSEHOLD_ID,),
    )
    all_plants = [dict(r) for r in plant_rows]
    print(f"Plants found: {len(all_plants)}")
    
    # Step 2: Filter by env
    if ENV == "tuin":
        plants = [p for p in all_plants if p.get("map_type") != "indoor"]
    elif ENV == "huis":
        plants = [p for p in all_plants if p.get("map_type") == "indoor"]
    else:
        plants = all_plants
    print(f"After env filter ({ENV}): {len(plants)} plants")
    
    plant_ids = [p["id"] for p in plants]
    print(f"Plant IDs: {plant_ids}")
    
    # Step 3: Fetch schedules
    placeholders = ",".join("?" * len(plant_ids))
    schedule_rows = await db.execute_fetchall(
        f"""SELECT cs.id as schedule_id, cs.plant_id, cs.care_type, cs.next_due, cs.last_done
            FROM care_schedules cs
            WHERE cs.plant_id IN ({placeholders}) AND cs.is_active = 1""",
        plant_ids,
    )
    print(f"Schedules found: {len(schedule_rows)}")
    
    # Group by plant_id
    schedules_by_plant = {}
    for r in schedule_rows:
        d = dict(r)
        schedules_by_plant.setdefault(d["plant_id"], []).append(d)
    
    today = date.today()
    print(f"Today: {today}")
    
    # Step 4: Run compute_plant_warnings for each plant
    for plant in plants[:3]:  # Test first 3 plants
        pid = plant["id"]
        schedules = schedules_by_plant.get(pid, [])
        print(f"\nPlant {pid} ({plant.get('name')}):")
        print(f"  map_type: {plant.get('map_type')}")
        print(f"  care_profile type: {type(plant.get('care_profile'))}")
        print(f"  care_profile: {str(plant.get('care_profile'))[:100]}")
        print(f"  schedules: {len(schedules)}")
        for s in schedules:
            print(f"    {s['care_type']}: next_due={s.get('next_due')}")
        
        try:
            state = compute_plant_warnings(plant, schedules, weather=None, today=today)
            print(f"  OK: {len(state.warnings)} warnings, top={state.top_warning}")
        except Exception as e:
            print(f"  ERROR: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
    
    await db.close()

asyncio.run(test())
