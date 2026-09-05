"""Tickets, conversation, notes, and escalations."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.drafts import ReplyDraft


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    public_id: Mapped[str] = mapped_column(String(32), nullable=False)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    priority: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    assignee_id: Mapped[str | None] = mapped_column(ForeignKey("operators.id"), nullable=True)
    channel: Mapped[str] = mapped_column(String(32), nullable=False)
    tags: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    first_response_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sla_deadline_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    unread: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    showcase: Mapped[str | None] = mapped_column(String(64), nullable=True)

    messages: Mapped[list[ConversationMessage]] = relationship(back_populates="ticket", cascade="all, delete-orphan")
    notes: Mapped[list[InternalNote]] = relationship(back_populates="ticket", cascade="all, delete-orphan")
    drafts: Mapped[list[ReplyDraft]] = relationship("ReplyDraft", back_populates="ticket", cascade="all, delete-orphan")
    escalations: Mapped[list[EscalationRecord]] = relationship(back_populates="ticket", cascade="all, delete-orphan")


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    author_type: Mapped[str] = mapped_column(String(32), nullable=False)
    author_name: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    channel: Mapped[str] = mapped_column(String(32), nullable=False)
    is_internal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    simulated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    ticket: Mapped[Ticket] = relationship(back_populates="messages")


class InternalNote(Base):
    __tablename__ = "internal_notes"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id: Mapped[str] = mapped_column(String(64), nullable=False)
    author_name: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    ticket: Mapped[Ticket] = relationship(back_populates="notes")


class EscalationRecord(Base):
    __tablename__ = "escalations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    recommended_queue: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[str] = mapped_column(String(64), nullable=False)

    ticket: Mapped[Ticket] = relationship(back_populates="escalations")
