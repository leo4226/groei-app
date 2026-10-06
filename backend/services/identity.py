"""Who is acting: the caller's own `users` row, derived from the signed-in account.

Care history (`care_log.done_by`, `care_schedules.last_done_by`, garden
operations) points at `users.id`. The client used to send that id itself, from
a device-local "active user" that predates login and defaulted to the
household's *first* member. So a second member on a fresh device logged every
watering as someone else, and the server wrote whatever id it was given.

The account in the token is the only trustworthy answer, and `users.account_id`
(migration 0073) links it to exactly one row.
"""
from fastapi import HTTPException


async def find_caller_user_id(db, account: dict) -> int | None:
    rows = await db.execute_fetchall(
        "SELECT id FROM users WHERE account_id = ? AND household_id = ?",
        (account["account_id"], account["household_id"]),
    )
    return int(rows[0]["id"]) if rows else None


async def caller_user_id(db, account: dict) -> int:
    user_id = await find_caller_user_id(db, account)
    if user_id is None:
        # Every signup and join path creates this row; only a hand-edited
        # database lacks it. Refuse rather than attribute care to nobody.
        raise HTTPException(status_code=409, detail={"code": "user_profile_missing"})
    return user_id
