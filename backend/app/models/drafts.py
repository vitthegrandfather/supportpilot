"""Reply drafts, retrieval runs, and citations."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.tickets import Ticket


class RetrievalRun(Base):
    __tablename__ = "retrieval_runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    ticket_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    query: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    citations: Mapped[list[RetrievedCitation]] = relationship(back_populates="run", cascade="all, delete-orphan")


class ReplyDraft(Base):
    __tablename__ = "reply_drafts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    public_id: Mapped[str] = mapped_column(String(32), nullable=False)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    state: Mapped[str] = mapped_column(String(32), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    original_body: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    classification_json: Mapped[str] = mapped_column(Text, nullable=False)
    knowledge_gaps_json: Mapped[str] = mapped_column(Text, nullable=False)
    escalate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    escalate_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    insufficient_evidence: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    approved_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    ticket: Mapped[Ticket] = relationship(back_populates="drafts")


class RetrievedCitation(Base):
    __tablename__ = "retrieved_citations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("retrieval_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    draft_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    chunk_id: Mapped[str] = mapped_column(String(64), nullable=False)
    document_id: Mapped[str] = mapped_column(String(64), nullable=False)
    document_title: Mapped[str] = mapped_column(String(300), nullable=False)
    section: Mapped[str] = mapped_column(String(200), nullable=False)
    excerpt: Mapped[str] = mapped_column(Text, nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    marker: Mapped[int] = mapped_column(Integer, nullable=False)
    flagged: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    run: Mapped[RetrievalRun] = relationship(back_populates="citations")
