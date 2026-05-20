"""Check calendar data."""
import aiosqlite
import os
from datetime import date, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), "floreren.db")

async def main():
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    
    today = date.today()  # 2026-05-17
    
    from_date = today.replace(day=1)
    next_month = today.replace(day=28) + timedelta(days=4) 
    to_date = next_month.replace(day=1) - timedelta(days=1)
    
    print(f"Today: {today}")
    print(f"Calendar range: {from_date} to {to_date}")
    
    # Active schedules in range
    rows = await db.execute_fetchall(
        "SELECT cs.next_due, cs.care_type, p.name, p.id FROM care_schedules cs JOIN plants p ON p.id=cs.plant_id WHERE cs.is_active=1 AND cs.next_due BETWEEN ? AND ? AND p.household_id=1 ORDER BY cs.next_due",
        (from_date.isoformat(), to_date.isoformat())
    )
    print(f"\nSchedules in range: {len(rows)}")
    for r in rows:
        print(f"  {r['next_due']} | {r['care_type']:15s} | {r['name']}")
    
    # Schedules beyond this month
    rows_future = await db.execute_fetchall(
        "SELECT cs.next_due, cs.care_type, p.name FROM care_schedules cs JOIN plants p ON p.id=cs.plant_id WHERE cs.is_active=1 AND cs.next_due > ? AND p.household_id=1 ORDER BY cs.next_due LIMIT 20",
        (to_date.isoformat(),)
    )
    print(f"\nSchedules beyond range ({to_date}+): {len(rows_future)}")
    for r in rows_future:
        print(f"  {r['next_due']} | {r['care_type']:15s} | {r['name']}")
    
    # Overdue (before this month)
    rows_past = await db.execute_fetchall(
        "SELECT cs.next_due, cs.care_type, p.name FROM care_schedules cs JOIN plants p ON p.id=cs.plant_id WHERE cs.is_active=1 AND cs.next_due < ? AND p.household_id=1 ORDER BY cs.next_due LIMIT 20",
        (from_date.isoformat(),)
    )
    print(f"\nOverdue schedules (before {from_date}): {len(rows_past)}")
    for r in rows_past:
        print(f"  {r['next_due']} | {r['care_type']:15s} | {r['name']}")
    
    # All active schedules total
    all_rows = await db.execute_fetchall(
        "SELECT COUNT(*) as cnt FROM care_schedules WHERE is_active=1"
    )
    print(f"\nTotal active schedules: {all_rows[0]['cnt']}")
    
    # Check what the 'komende_week' water upcoming would be
    # The upcoming water events - find ones with next_due 1-7 days from today
    rows_upcoming = await db.execute_fetchall(
        "SELECT cs.next_due, cs.care_type, p.name FROM care_schedules cs JOIN plants p ON p.id=cs.plant_id WHERE cs.is_active=1 AND cs.next_due BETWEEN ? AND ? AND p.household_id=1 ORDER BY cs.next_due",
        (today.isoformat(), (today + timedelta(days=7)).isoformat())
    )
    print(f"\nUpcoming 7 days ({today} to {today + timedelta(days=7)}): {len(rows_upcoming)}")
    for r in rows_upcoming:
        print(f"  {r['next_due']} | {r['care_type']:15s} | {r['name']}")
    
    await db.close()

import asyncio
asyncio.run(main())
