"""Knowledge document ingest, listing, reindex, and retrieval testing."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.core.ids import next_public_id, rid
from app.core.safety import sanitize_filename, validate_upload
from app.models import DocumentEvent, KnowledgeChunk, KnowledgeDocument, RetrievalRun
from app.providers.sandbox import SandboxEmbeddingProvider
from app.rag.chunking import chunk_document
from app.rag.extraction import extract_document
from app.rag.injection import detect_prompt_injection
from app.rag.ranking import rank_evidence
from app.rag.retrieval import retrieve
from app.seed.people import DEMO_OPERATOR_ID
from app.services.audit import write_audit
from app.services.serialize import iso, map_chunk, map_document

embedder = SandboxEmbeddingProvider()


def _slug(title: str) -> str:
    return "".join(ch.lower() if ch.isalnum() else "-" for ch in title).strip("-")[:80] or "document"


async def get_document_row(session: AsyncSession, workspace_id: str, document_id: str) -> KnowledgeDocument:
    result = await session.execute(
        select(KnowledgeDocument).where(
            KnowledgeDocument.workspace_id == workspace_id,
            or_(KnowledgeDocument.id == document_id, KnowledgeDocument.public_id == document_id),
        )
    )
    doc = result.scalar_one_or_none()
    if doc is None:
        raise ApiError("not_found", "Document not found.", 404)
    return doc


async def list_documents(
    session: AsyncSession,
    workspace_id: str,
    filters: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    rows = (
        (
            await session.execute(
                select(KnowledgeDocument)
                .where(KnowledgeDocument.workspace_id == workspace_id)
                .order_by(KnowledgeDocument.title)
            )
        )
        .scalars()
        .all()
    )
    docs = [map_document(d) for d in rows]
    filters = filters or {}
    q = (filters.get("q") or "").lower()
    if q:
        docs = [d for d in docs if q in d["title"].lower() or q in d["public_id"].lower() or q in d["filename"].lower()]
    if filters.get("category") and filters["category"] != "all":
        docs = [d for d in docs if d["category"] == filters["category"]]
    if filters.get("status") and filters["status"] != "all":
        docs = [d for d in docs if d["status"] == filters["status"]]
    return docs


async def get_document(session: AsyncSession, workspace_id: str, document_id: str) -> dict[str, Any]:
    doc = await get_document_row(session, workspace_id, document_id)
    chunks = (
        (
            await session.execute(
                select(KnowledgeChunk).where(KnowledgeChunk.document_id == doc.id).order_by(KnowledgeChunk.ordinal)
            )
        )
        .scalars()
        .all()
    )
    events = (
        (
            await session.execute(
                select(DocumentEvent)
                .where(DocumentEvent.document_id == doc.id)
                .order_by(DocumentEvent.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    mapped = map_document(doc)
    return {
        "document": mapped,
        "chunks": [map_chunk(c) for c in chunks],
        "events": [{"id": e.id, "stage": e.stage, "detail": e.detail, "created_at": iso(e.created_at)} for e in events],
        "versions": [
            {
                "version": mapped["version"],
                "status": mapped["status"],
                "indexed_at": mapped["last_indexed_at"],
                "note": "Current indexed version",
            }
        ],
    }


async def add_event(session: AsyncSession, document_id: str, stage: str, detail: str) -> None:
    session.add(
        DocumentEvent(
            id=rid("dov"),
            document_id=document_id,
            stage=stage,
            detail=detail,
            created_at=datetime.now(timezone.utc),
        )
    )


async def index_document(session: AsyncSession, document_id: str) -> None:
    doc = await session.get(KnowledgeDocument, document_id)
    if doc is None:
        raise ApiError("not_found", "Document not found.", 404)
    now = datetime.now(timezone.utc)
    existing = (
        (await session.execute(select(KnowledgeChunk).where(KnowledgeChunk.document_id == document_id))).scalars().all()
    )
    for existing_chunk in existing:
        await session.delete(existing_chunk)
    await add_event(session, document_id, "extracting", "Extracting text")
    await add_event(session, document_id, "chunking", "Splitting into overlapping passages")
    pieces = chunk_document(doc.body) if doc.body else []
    await add_event(session, document_id, "embedding", "Generating sandbox hash embeddings")
    flagged_any = False
    for piece in pieces:
        inj = detect_prompt_injection(piece.text)
        flagged_any = flagged_any or inj.matched
        session.add(
            KnowledgeChunk(
                id=rid("chk"),
                document_id=doc.id,
                workspace_id=doc.workspace_id,
                ordinal=piece.ordinal,
                section=piece.section,
                page=piece.page,
                text=piece.text,
                embedding=json.dumps(embedder.embed(piece.text)),
                token_count=piece.token_count,
                flagged=inj.matched,
                flag_reason=(f"Prompt-injection patterns: {', '.join(inj.patterns)}" if inj.matched else None),
            )
        )
    doc.status = "ready"
    doc.chunk_count = len(pieces)
    doc.last_indexed_at = now
    doc.suspicious = flagged_any or bool(doc.suspicious)
    await add_event(
        session,
        document_id,
        "ready",
        "Indexed by sandbox embedding provider"
        + ("; injection patterns flagged and excluded from retrieval" if flagged_any else ""),
    )


async def create_text_document(
    session: AsyncSession,
    workspace_id: str,
    input_data: dict[str, Any],
    actor: dict[str, str],
) -> dict[str, Any]:
    title = (input_data.get("title") or "").strip()
    body = (input_data.get("body") or "").strip()
    if not title or not body:
        raise ApiError("validation_error", "Title and body are required.", 422)
    count = (await session.execute(select(func.count()).select_from(KnowledgeDocument))).scalar_one()
    doc_id = rid("doc")
    public_id = next_public_id("DOC", int(count or 0) + 21)
    filename = sanitize_filename(input_data.get("filename") or f"{_slug(title)}.md")
    session.add(
        KnowledgeDocument(
            id=doc_id,
            workspace_id=workspace_id,
            public_id=public_id,
            title=title,
            category=input_data.get("category") or "policy",
            version="1.0",
            source_type="markdown",
            status="pending",
            chunk_count=0,
            last_indexed_at=None,
            owner_id=actor.get("id") or DEMO_OPERATOR_ID,
            owner_name=actor.get("name") or "Elena Voss",
            usage_count=0,
            filename=filename,
            body=body,
            failed_reason=None,
            suspicious=False,
        )
    )
    await add_event(session, doc_id, "pending", "Document accepted")
    await session.flush()
    await index_document(session, doc_id)
    await write_audit(
        session,
        "document.created",
        "document",
        doc_id,
        {"publicId": public_id},
        workspace_id=workspace_id,
        actor_id=actor["id"],
        actor_name=actor["name"],
    )
    await session.flush()
    return await get_document(session, workspace_id, doc_id)


async def upload_document(
    session: AsyncSession,
    workspace_id: str,
    filename: str,
    mime: str,
    content: str | bytes,
    size: int,
    actor: dict[str, str],
) -> dict[str, Any]:
    err = validate_upload(filename, mime, size)
    if err:
        raise ApiError("invalid_upload", err, 422)
    extracted = extract_document(filename, content, mime)
    return await create_text_document(
        session,
        workspace_id,
        {
            "title": filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " "),
            "body": extracted.text,
            "category": "policy",
            "filename": filename,
        },
        actor,
    )


async def reindex_document(
    session: AsyncSession, workspace_id: str, document_id: str, actor: dict[str, str]
) -> dict[str, Any]:
    doc = await get_document_row(session, workspace_id, document_id)
    if doc.status == "archived":
        raise ApiError("invalid_state", "Archived documents cannot be reindexed.", 409)
    if doc.status == "failed" and not doc.body:
        raise ApiError("invalid_state", "Failed ingest has no extractable text to reindex.", 409)
    await index_document(session, doc.id)
    await write_audit(
        session,
        "document.reindexed",
        "document",
        doc.id,
        {},
        workspace_id=workspace_id,
        actor_id=actor["id"],
        actor_name=actor["name"],
    )
    await session.flush()
    return await get_document(session, workspace_id, doc.id)


async def archive_document(
    session: AsyncSession, workspace_id: str, document_id: str, actor: dict[str, str]
) -> dict[str, Any]:
    doc = await get_document_row(session, workspace_id, document_id)
    doc.status = "archived"
    await add_event(session, doc.id, "archived", "Archived by operator")
    await write_audit(
        session,
        "document.archived",
        "document",
        doc.id,
        {},
        workspace_id=workspace_id,
        actor_id=actor["id"],
        actor_name=actor["name"],
    )
    await session.flush()
    return await get_document(session, workspace_id, doc.id)


async def test_retrieval(session: AsyncSession, workspace_id: str, question: str) -> dict[str, Any]:
    if not question.strip():
        raise ApiError("validation_error", "Enter a question to test retrieval.", 422)
    docs = (
        (
            await session.execute(
                select(KnowledgeDocument).where(
                    KnowledgeDocument.workspace_id == workspace_id, KnowledgeDocument.status == "ready"
                )
            )
        )
        .scalars()
        .all()
    )
    chunks = (
        (await session.execute(select(KnowledgeChunk).where(KnowledgeChunk.workspace_id == workspace_id)))
        .scalars()
        .all()
    )
    mapped_docs = [map_document(d) for d in docs]
    mapped_chunks = [map_chunk(c) for c in chunks if not c.flagged]
    title_by_doc = {d["id"]: d["title"] for d in mapped_docs}
    hits = rank_evidence(retrieve(question, mapped_chunks, embedder, 8), title_by_doc, question)
    run_id = rid("run")
    session.add(
        RetrievalRun(
            id=run_id,
            workspace_id=workspace_id,
            ticket_id=None,
            query=question,
            created_at=datetime.now(timezone.utc),
        )
    )
    await session.flush()
    return {
        "query": question,
        "run_id": run_id,
        "results": [
            {
                "chunk_id": h["chunk"]["id"] if isinstance(h["chunk"], dict) else h["chunk"].id,
                "document_id": h["chunk"]["document_id"] if isinstance(h["chunk"], dict) else h["chunk"].document_id,
                "document_title": title_by_doc.get(
                    h["chunk"]["document_id"] if isinstance(h["chunk"], dict) else h["chunk"].document_id,
                    "Unknown",
                ),
                "section": h["chunk"]["section"] if isinstance(h["chunk"], dict) else h["chunk"].section,
                "score": float(h["score"]),
                "cosine": float(h.get("cosine") or 0),
                "lexical": float(h.get("lexical") or 0),
                "excerpt": (h["chunk"]["text"] if isinstance(h["chunk"], dict) else h["chunk"].text)[:420],
            }
            for h in hits
        ],
    }
