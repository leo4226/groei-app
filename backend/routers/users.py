from fastapi import APIRouter, Depends, HTTPException
from database import db_dep
from auth import get_current_account
from models import UserOut, UserLanguageUpdate

router = APIRouter(tags=["users"])


@router.get("/users", response_model=list[UserOut])
async def list_users(db = Depends(db_dep), account = Depends(get_current_account)):
    cursor = await db.execute(
        "SELECT id, name, avatar, language FROM users WHERE household_id = ? ORDER BY id",
        (account["household_id"],)
    )
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]


@router.patch("/users/{user_id}/language", response_model=UserOut)
async def update_user_language(
    user_id: int,
    body: UserLanguageUpdate,
    db = Depends(db_dep),
    account = Depends(get_current_account),
):
    await db.execute(
        "UPDATE users SET language = ? WHERE id = ? AND household_id = ?",
        (body.language, user_id, account["household_id"])
    )
    await db.commit()
    cursor = await db.execute(
        "SELECT id, name, avatar, language FROM users WHERE id = ? AND household_id = ?",
        (user_id, account["household_id"])
    )
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    return dict(row)
