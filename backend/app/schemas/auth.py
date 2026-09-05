"""Auth request/response schemas."""

from pydantic import BaseModel, EmailStr, Field


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class TokenOut(BaseModel):
    access_token: str
    token_type: str
    role: str
    operator_id: str
    workspace_id: str
    name: str
    email: str
