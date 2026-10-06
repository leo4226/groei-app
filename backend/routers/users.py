from fastapi import APIRouter, Depends, HTTPException
from database import db_dep
from auth import get_current_account, require_editor
from models import UserOut, UserLanguageUpdate, UserUpdate

router = APIRouter(tags=["users"])

_USER_COLUMNS = "id, name, avatar, language, account_id"


async def _own_user_row(db, user_id: int, account: dict) -> None:
    """403 unless `user_id` is the caller's own profile.

    These routes used to accept any profile in the household, so an editor
    could change another member's language or name — and the name route then
    renamed the *caller's* account to match. Changing someone else's profile is
    the owner's job, through PATCH /household/members/{id}.
    """
    rows = await db.execute_fetchall(
        "SELECT account_id FROM users WHERE id = ? AND household_id = ?",
        (user_id, account["household_id"]),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="User not found")
    if rows[0]["account_id"] != account["account_id"]:
        raise HTTPException(status_code=403, detail="Forbidden")


@router.get("/users", response_model=list[UserOut])
async def list_users(db = Depends(db_dep), account = Depends(get_current_account)):
    cursor = await db.execute(
        f"SELECT {_USER_COLUMNS} FROM users WHERE household_id = ? ORDER BY id",
        (account["household_id"],)
    )
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]


@router.patch("/users/{user_id}/language", response_model=UserOut)
async def update_user_language(
    user_id: int,
    body: UserLanguageUpdate,
    db = Depends(db_dep),
    account = Depends(require_editor),
):
    await _own_user_row(db, user_id, account)
    await db.execute(
        "UPDATE users SET language = ? WHERE id = ? AND household_id = ?",
        (body.language, user_id, account["household_id"])
    )
    # Keep the account row in step. `accounts.language` is what the push
    # dispatcher, digest and calendar feed read; it was only ever written at
    # signup, so a user who switched to English kept getting Dutch pushes (#889).
    await db.execute(
        "UPDATE accounts SET language = ? WHERE id = ?",
        (body.language, account["account_id"]),
    )
    await db.commit()
    rows = await db.execute_fetchall(
        f"SELECT {_USER_COLUMNS} FROM users WHERE id = ? AND household_id = ?",
        (user_id, account["household_id"])
    )
    return dict(rows[0])


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    body: UserUpdate,
    db = Depends(db_dep),
    account = Depends(require_editor),
):
    """Update the caller's own name and/or avatar (profile and account alike)."""
    await _own_user_row(db, user_id, account)
    updates = {}
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        updates["name"] = name
    if body.avatar is not None:
        updates["avatar"] = body.avatar.strip()

    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        await db.execute(
            f"UPDATE users SET {set_clause} WHERE id = ? AND household_id = ?",
            (*updates.values(), user_id, account["household_id"]),
        )
        await db.execute(
            f"UPDATE accounts SET {set_clause} WHERE id = ?",
            (*updates.values(), account["account_id"]),
        )
        await db.commit()

    rows = await db.execute_fetchall(
        f"SELECT {_USER_COLUMNS} FROM users WHERE id = ? AND household_id = ?",
        (user_id, account["household_id"])
    )
    return dict(rows[0])
