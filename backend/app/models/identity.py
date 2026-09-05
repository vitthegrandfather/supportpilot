"""Workspace, operators, login users, and customers."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    operators: Mapped[list[Operator]] = relationship(back_populates="workspace", cascade="all, delete-orphan")
    customers: Mapped[list[Customer]] = relationship(back_populates="workspace", cascade="all, delete-orphan")


class Operator(Base):
    __tablename__ = "operators"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)

    workspace: Mapped[Workspace] = relationship(back_populates="operators")


class UserAccount(Base):
    """Login identity mapped to an operator. Passwords are bcrypt hashes of fictional demo creds."""

    __tablename__ = "user_accounts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    operator_id: Mapped[str] = mapped_column(ForeignKey("operators.id", ondelete="CASCADE"), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    company: Mapped[str] = mapped_column(String(200), nullable=False)
    plan: Mapped[str] = mapped_column(String(64), nullable=False)
    region: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    account_id: Mapped[str] = mapped_column(String(64), nullable=False)
    health: Mapped[str] = mapped_column(String(32), nullable=False)

    workspace: Mapped[Workspace] = relationship(back_populates="customers")
