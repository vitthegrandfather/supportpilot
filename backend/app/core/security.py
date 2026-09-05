"""Password hashing and JWT helpers. Demo secrets only."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.core.config import get_settings
from app.core.errors import ApiError


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=10)).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(
    subject: str,
    claims: dict[str, Any] | None = None,
    expires_minutes: int | None = None,
) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expires_minutes if expires_minutes is not None else settings.access_token_expire_minutes
    )
    payload: dict[str, Any] = {"sub": subject, "exp": expire}
    if claims:
        payload.update(claims)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise ApiError("token_expired", "Access token has expired.", 401) from exc
    except jwt.InvalidTokenError as exc:
        raise ApiError("invalid_token", "Invalid access token.", 401) from exc
