"""Check existing users and accounts."""
import asyncio
import os

async def main():
    dsn = os.environ["DATABASE_URL"]
    import asyncpg
    conn = await asyncpg.connect(dsn)
    try:
        users = await conn.fetch("SELECT id, name, household_id FROM users ORDER BY id")
        print(f"=== Users ({len(users)}) ===")
        for u in users:
            print(f"  id={u['id']}, name={u['name']}, household_id={u['household_id']}")

        accts = await conn.fetch("SELECT id, name, household_id FROM accounts ORDER BY id")
        print(f"\n=== Accounts ({len(accts)}) ===")
        for a in accts:
            print(f"  id={a['id']}, name={a['name']}, household_id={a['household_id']}")

        # Now cross-check
        print(f"\n=== Accounts without matching user name in same household ===")
        for a in accts:
            found = await conn.fetchrow(
                "SELECT id FROM users WHERE household_id=$1 AND name=$2",
                a["household_id"], a["name"]
            )
            if not found:
                print(f"  account_id={a['id']}, name={a['name']}, hh={a['household_id']}")

        # Check max user id
        max_id = await conn.fetchval("SELECT COALESCE(MAX(id), 0) FROM users")
        print(f"\nMax user id: {max_id}")
        print(f"Next seq: {max_id + 1}")

        # Check the users table sequence
        seq = await conn.fetchval(
            "SELECT nextval(pg_get_serial_sequence('users', 'id'))"
        )
        print(f"Current sequence value: {seq}")

    finally:
        await conn.close()

asyncio.run(main())
