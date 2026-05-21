"""Delete test accounts (test@groei.nl) from the database."""
import asyncio
import os

async def main():
    dsn = os.environ["DATABASE_URL"]
    import asyncpg
    conn = await asyncpg.connect(dsn)
    try:
        # Find all test@groei.nl accounts
        rows = await conn.fetch(
            "SELECT id, household_id, name FROM accounts WHERE email = 'test@groei.nl'"
        )
        print(f"Found {len(rows)} test@groei.nl account(s):")
        for r in rows:
            print(f"  id={r['id']}, household={r['household_id']}, name={r['name']}")

        for r in rows:
            aid = r["id"]
            hh = r["household_id"]
            name = r["name"]

            # Delete related data
            await conn.execute("DELETE FROM plants WHERE household_id = $1", hh)
            await conn.execute("DELETE FROM care_logs WHERE household_id = $1", hh)
            await conn.execute("DELETE FROM care_schedules WHERE household_id = $1", hh)
            await conn.execute("DELETE FROM users WHERE household_id = $1", hh)
            await conn.execute("DELETE FROM locations WHERE household_id = $1", hh)
            await conn.execute("DELETE FROM accounts WHERE id = $1", aid)
            await conn.execute("DELETE FROM households WHERE id = $1", hh)
            print(f"✅ Deleted account #{aid} '{name}' + household #{hh}")

        await conn.execute("COMMIT")
        print("\n✅ All test@groei.nl accounts removed!")

        # Verify
        remaining = await conn.fetchval("SELECT COUNT(*) FROM accounts")
        print(f"  Accounts remaining: {remaining}")
    finally:
        await conn.close()

asyncio.run(main())
