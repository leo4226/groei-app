"""Backfill users for existing accounts.
Links the existing Leon+Lisbeth users to Leon's household (id=3).
Creates users for other accounts that need them."""
import asyncio
import os

async def main():
    dsn = os.environ["DATABASE_URL"]
    import asyncpg
    conn = await asyncpg.connect(dsn)
    try:
        # 1. Link existing Leon (id=1) and Lisbeth (id=2) to Leon's household (id=3)
        await conn.execute("UPDATE users SET household_id=3 WHERE id=1 AND household_id IS NULL")
        print("✅ Linked user Leon (id=1) → household=3")
        
        await conn.execute("UPDATE users SET household_id=3 WHERE id=2 AND household_id IS NULL")
        print("✅ Linked user Lisbeth (id=2) → household=3")

        # 2. For accounts in household 3 that don't have a matching user name, 
        #    create one if the name doesn't already exist in that household
        existing_names = {
            r["name"] for r in await conn.fetch(
                "SELECT name FROM users WHERE household_id=3"
            )
        }
        print(f"Existing users in household 3: {existing_names}")

        # Account id=3 = Leon's account → already exists
        # No other accounts in household 3

        # 3. For remaining orphan accounts (not in household 3), create a default user per household
        rows = await conn.fetch("""
            SELECT a.id as account_id, a.name, a.household_id
            FROM accounts a
            LEFT JOIN users u ON u.household_id = a.household_id
            WHERE u.id IS NULL
            GROUP BY a.id, a.name, a.household_id
        """)
        
        for r in rows:
            # Create a user with the account's name in that household
            await conn.execute(
                "INSERT INTO users (name, household_id, language) VALUES ($1, $2, 'nl')",
                r["name"], r["household_id"]
            )
            print(f"✅ Created user '{r['name']}' in household {r['household_id']}")

        # Now verify
        users = await conn.fetch("SELECT id, name, household_id, language FROM users ORDER BY id")
        print(f"\n=== Final users ({len(users)}) ===")
        for u in users:
            print(f"  id={u['id']}, name={u['name']}, hh={u['household_id']}, lang={u['language']}")

        await conn.execute("COMMIT")
        print("\n✅ All done!")
    finally:
        await conn.close()

asyncio.run(main())
