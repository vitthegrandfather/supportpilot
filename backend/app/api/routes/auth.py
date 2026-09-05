"""Authentication routes."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_principal
from app.db.session import get_db
from app.services.auth import authenticate

router = APIRouter(prefix="/api/v1")


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


@router.post("/auth/login")
async def login(body: LoginIn, db: AsyncSession = Depends(get_db)) -> dict:
    return await authenticate(db, body.email, body.password)


@router.get("/me")
async def me(principal: Principal = Depends(get_principal)) -> dict:
    return {
        "user_id": principal.user_id,
        "operator_id": principal.operator_id,
        "workspace_id": principal.workspace_id,
        "role": principal.role,
        "name": principal.name,
        "email": principal.email,
    }
