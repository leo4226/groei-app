"""One-time migration: create a Household for existing data and one Account for the owner.

Usage:
    python migrate_auth.py --email you@example.com --password yourpass --name "Leon" --household "Korbee Garden"
"""
import asyncio
import argparse
import sys

sys.path.insert(0, ".")
from database import get_db
from auth import hash_password


async def run(email: str, password: str, name: str, household: str):
    async with get_db() as db:
        # Check if household_id 1 already exists (idempotent)
        existing_hh = await db.execute_fetchall("SELECT id FROM households WHERE id = 1")
        if not existing_hh:
            await db.execute(
                "INSERT INTO households (id, name) VALUES (1, ?)", (household,)
            )
            print(f"Created household: {household}")
        else:
            print("Household 1 already exists — skipping household creation")

        # Assign all unowned data to household 1
        for table in ("maps", "plants", "locations", "users"):
            result = await db.execute(
                f"UPDATE {table} SET household_id = 1 WHERE household_id IS NULL"
            )
            print(f"  {table}: updated {result.rowcount} rows")

        # Create owner account (skip if email already exists)
        existing_acc = await db.execute_fetchall(
            "SELECT id FROM accounts WHERE email = ?", (email.lower(),)
        )
        if not existing_acc:
            pw_hash = hash_password(password)
            await db.execute(
                "INSERT INTO accounts (household_id, email, name, password_hash) VALUES (1, ?, ?, ?)",
                (email.lower(), name, pw_hash),
            )
            print(f"Created account: {email}")
        else:
            print(f"Account {email} already exists — skipping")

        await db.commit()
        print("Migration complete.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--name", default="Leon")
    parser.add_argument("--household", default="Korbee Garden")
    args = parser.parse_args()
    asyncio.run(run(args.email, args.password, args.name, args.household))
