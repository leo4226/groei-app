from fastapi import APIRouter, Depends
from database import db_dep
from models import UserOut

router = APIRouter(tags=["users"])


@router.get("/users", response_model=list[UserOut])
async def list_users(db = Depends(db_dep)):
    cursor = await db.execute("SELECT id, name, avatar FROM users ORDER BY id")
    rows = await cursor.fetchall()
    return [dict(row) for row in rows]
