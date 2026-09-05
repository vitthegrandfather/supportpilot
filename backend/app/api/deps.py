"""Auth and request dependencies."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.core.rate_limit import enforce, generate_limiter, mutate_limiter
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import Operator, UserAccount


@dataclass
class Principal:
    user_id: str
    operator_id: str
    workspace_id: str
    role: str
    name: str
    email: str

    def as_actor(self) -> dict[str, str]:
        return {"id": self.operator_id, "name": self.name}


async def get_principal(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> Principal:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ApiError("unauthorized", "Authentication required.", 401)
    payload = decode_access_token(authorization.split(" ", 1)[1].strip())
    user = await db.get(UserAccount, str(payload.get("sub") or ""))
    if user is None or not user.is_active:
        raise ApiError("unauthorized", "Unknown or inactive account.", 401)
    operator = await db.get(Operator, user.operator_id)
    if operator is None:
        raise ApiError("unauthorized", "Operator record missing.", 401)
    return Principal(
        user_id=user.id,
        operator_id=operator.id,
        workspace_id=user.workspace_id,
        role=operator.role,
        name=operator.name,
        email=user.email,
    )


async def require_admin(principal: Principal = Depends(get_principal)) -> Principal:
    if principal.role != "admin":
        raise ApiError("forbidden", "Administrator role required.", 403)
    return principal


def enforce_mutate(principal: Principal) -> None:
    enforce(principal.user_id, mutate_limiter())


def enforce_generate(principal: Principal) -> None:
    enforce(f"gen:{principal.user_id}", generate_limiter())
