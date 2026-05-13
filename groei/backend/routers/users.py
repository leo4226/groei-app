from fastapi import APIRouter, Depends
from database import db_dep
from auth import get_current_account
from models import UserOut

router = APIRouter(tags=["users"])


@router.get("/users", response_model=list[UserOut])
async def list_users(db = Depends(db_dep), account = Depends(get_current_account)):
    cursor = await db.execute(
        "SELECT id, name, avatar FROM users WHERE household_id = ? ORDER BY id",
        (account["household_id"],)
    )
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]
