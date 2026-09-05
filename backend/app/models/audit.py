"""Audit events, safety events, and provider configuration."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    actor_id: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_name: Mapped[str] = mapped_column(String(200), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False)
    metadata_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SafetyEvent(Base):
    __tablename__ = "safety_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    ticket_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    document_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    detail: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ProviderConfiguration(Base):
    __tablename__ = "provider_configurations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    embedding_provider: Mapped[str] = mapped_column(String(64), nullable=False)
    generation_provider: Mapped[str] = mapped_column(String(64), nullable=False)
    confidence_escalate_below: Mapped[float] = mapped_column(Float, nullable=False, default=0.55)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
