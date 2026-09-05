"""Login against fictional demo accounts."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.core.security import create_access_token, verify_password
from app.models import Operator, UserAccount


async def authenticate(session: AsyncSession, email: str, password: str) -> dict[str, str]:
    result = await session.execute(select(UserAccount).where(UserAccount.email == email.lower().strip()))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active or not verify_password(password, user.password_hash):
        raise ApiError("unauthorized", "Invalid email or password.", 401)
    operator = await session.get(Operator, user.operator_id)
    if operator is None:
        raise ApiError("unauthorized", "Operator record missing.", 401)
    token = create_access_token(
        user.id,
        {
            "workspace_id": user.workspace_id,
            "operator_id": user.operator_id,
            "role": operator.role,
            "name": operator.name,
            "email": user.email,
        },
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": operator.role,
        "operator_id": operator.id,
        "workspace_id": user.workspace_id,
        "name": operator.name,
        "email": user.email,
        "user_id": user.id,
    }
