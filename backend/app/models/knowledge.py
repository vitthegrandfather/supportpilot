"""Knowledge documents, chunks, and ingestion events."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    public_id: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    version: Mapped[str] = mapped_column(String(32), nullable=False)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    chunk_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    owner_id: Mapped[str] = mapped_column(String(64), nullable=False)
    owner_name: Mapped[str] = mapped_column(String(200), nullable=False)
    usage_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    failed_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    suspicious: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    chunks: Mapped[list[KnowledgeChunk]] = relationship(back_populates="document", cascade="all, delete-orphan")
    events: Mapped[list[DocumentEvent]] = relationship(back_populates="document", cascade="all, delete-orphan")


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    document_id: Mapped[str] = mapped_column(
        ForeignKey("knowledge_documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    workspace_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    section: Mapped[str] = mapped_column(String(200), nullable=False)
    page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    # JSON text so SQLite tests work. Production may switch this column to pgvector.
    embedding: Mapped[str] = mapped_column(Text, nullable=False)
    token_count: Mapped[int] = mapped_column(Integer, nullable=False)
    flagged: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    flag_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    document: Mapped[KnowledgeDocument] = relationship(back_populates="chunks")


class DocumentEvent(Base):
    __tablename__ = "document_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    document_id: Mapped[str] = mapped_column(
        ForeignKey("knowledge_documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stage: Mapped[str] = mapped_column(String(64), nullable=False)
    detail: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    document: Mapped[KnowledgeDocument] = relationship(back_populates="events")
