"""Check current DB state and test gaps endpoint."""
import asyncio
import os

async def main():
    dsn = os.environ["DATABASE_URL"]
    import asyncpg
    conn = await asyncpg.connect(dsn)
    try:
        # 1. Check icon_requested column
        col = await conn.fetchrow(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='plants' AND column_name='icon_requested'"
        )
        print(f"icon_requested column: {'✅ EXISTS' if col else '❌ MISSING'}")

        # 2. List accounts
        accts = await conn.fetch(
            "SELECT a.id, a.email, a.name, a.household_id, "
            "h.name as household_name FROM accounts a "
            "JOIN households h ON a.household_id = h.id "
            "ORDER BY a.id"
        )
        print(f"\n=== Accounts ({len(accts)}) ===")
        for a in accts:
            print(f"  id={a['id']}, email={a['email']}, name={a['name']}, hh={a['household_id']} ({a['household_name']})")

        # 3. List users
        users = await conn.fetch(
            "SELECT id, name, household_id, language FROM users ORDER BY id"
        )
        print(f"\n=== Users ({len(users)}) ===")
        for u in users:
            print(f"  id={u['id']}, name={u['name']}, hh={u['household_id']}, lang={u['language']}")

        # 4. Accounts without matching user
        print(f"\n=== Accounts WITHOUT user ===")
        for a in accts:
            found = await conn.fetchrow(
                "SELECT id FROM users WHERE household_id=$1 AND name=$2",
                a["household_id"], a["name"]
            )
            if not found:
                print(f"  account_id={a['id']}, email={a['email']}, name={a['name']}")

        # 5. Check if any plants exist
        plants = await conn.fetchval("SELECT COUNT(*) FROM plants WHERE is_active=1")
        print(f"\nActive plants: {plants}")

    finally:
        await conn.close()

asyncio.run(main())
