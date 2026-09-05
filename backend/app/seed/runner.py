"""Idempotent fictional seed for the HelioDesk demo workspace."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.ids import rid
from app.core.security import hash_password
from app.models import (
    AuditEvent,
    ConversationMessage,
    Customer,
    DocumentEvent,
    EscalationRecord,
    InternalNote,
    KnowledgeChunk,
    KnowledgeDocument,
    Operator,
    ProviderConfiguration,
    ReplyDraft,
    RetrievalRun,
    RetrievedCitation,
    SafetyEvent,
    Ticket,
    UserAccount,
    Workspace,
)
from app.providers.sandbox import SandboxEmbeddingProvider
from app.rag.chunking import chunk_document
from app.rag.injection import detect_prompt_injection
from app.seed.documents import SEED_DOCUMENTS
from app.seed.people import CUSTOMERS, DEMO_OPERATOR_ID, DEMO_WORKSPACE_ID, OPERATORS
from app.seed.tickets import SEED_TICKETS

embedder = SandboxEmbeddingProvider()


def _parse_dt(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


async def seed_if_empty(session: AsyncSession) -> None:
    existing = await session.get(Workspace, DEMO_WORKSPACE_ID)
    if existing is not None:
        return
    await seed_all(session)


async def reset_demo(session: AsyncSession) -> None:
    """Wipe demo rows in FK-safe order, then reseed. SQLite has no deferred FKs."""
    for table in (
        RetrievedCitation,
        RetrievalRun,
        ReplyDraft,
        EscalationRecord,
        InternalNote,
        ConversationMessage,
        SafetyEvent,
        AuditEvent,
        KnowledgeChunk,
        DocumentEvent,
        Ticket,
        KnowledgeDocument,
        ProviderConfiguration,
        UserAccount,
        Customer,
        Operator,
        Workspace,
    ):
        await session.execute(delete(table))
    await session.flush()
    await seed_all(session)


async def seed_all(session: AsyncSession) -> None:
    now = datetime.now(timezone.utc)
    session.add(
        Workspace(
            id=DEMO_WORKSPACE_ID,
            name="HelioDesk Support",
            slug="heliodesk-demo",
            product_name="HelioDesk Cloud",
            timezone="UTC",
            created_at=now,
        )
    )
    await session.flush()
    for op in OPERATORS:
        session.add(
            Operator(
                id=op["id"],
                workspace_id=op["workspace_id"],
                name=op["name"],
                email=op["email"],
                role=op["role"],
                title=op["title"],
            )
        )
    await session.flush()
    for customer in CUSTOMERS:
        session.add(
            Customer(
                id=customer["id"],
                workspace_id=customer["workspace_id"],
                name=customer["name"],
                email=customer["email"],
                company=customer["company"],
                plan=customer["plan"],
                region=customer["region"],
                created_at=_parse_dt(str(customer["created_at"])),
                account_id=customer["account_id"],
                health=customer["health"],
            )
        )
    await session.flush()

    settings = get_settings()
    session.add(
        UserAccount(
            id="acct_admin",
            workspace_id=DEMO_WORKSPACE_ID,
            operator_id=DEMO_OPERATOR_ID,
            email=settings.demo_admin_email,
            password_hash=hash_password(settings.demo_admin_password),
            is_active=True,
        )
    )
    session.add(
        UserAccount(
            id="acct_operator",
            workspace_id=DEMO_WORKSPACE_ID,
            operator_id="usr_marcus_pell",
            email=settings.demo_operator_email,
            password_hash=hash_password(settings.demo_operator_password),
            is_active=True,
        )
    )
    session.add(
        ProviderConfiguration(
            id="cfg_demo",
            workspace_id=DEMO_WORKSPACE_ID,
            embedding_provider="sandbox-hash-v1",
            generation_provider="sandbox-extractive-v1",
            confidence_escalate_below=0.55,
            updated_at=now,
        )
    )

    for doc in SEED_DOCUMENTS:
        status = str(doc.get("status") or "ready")
        body = str(doc.get("body") or "")
        chunks = chunk_document(body) if status == "ready" and body else []
        session.add(
            KnowledgeDocument(
                id=doc["id"],
                workspace_id=DEMO_WORKSPACE_ID,
                public_id=doc["public_id"],
                title=doc["title"],
                category=doc["category"],
                version=doc["version"],
                source_type=doc["source_type"],
                status=status,
                chunk_count=len(chunks),
                last_indexed_at=now if status == "ready" else None,
                owner_id=DEMO_OPERATOR_ID,
                owner_name=str(doc.get("owner_name") or "Elena Voss"),
                usage_count=int(doc.get("usage_count") or 0),
                filename=doc["filename"],
                body=body,
                failed_reason=doc.get("failed_reason"),
                suspicious=bool(doc.get("suspicious")),
            )
        )
        session.add(
            DocumentEvent(
                id=rid("dov"),
                document_id=doc["id"],
                stage="failed" if status == "failed" else "ready",
                detail=(
                    str(doc.get("failed_reason") or "failed")
                    if status == "failed"
                    else "Indexed by sandbox embedding provider"
                ),
                created_at=now,
            )
        )
        for chunk in chunks:
            inj = detect_prompt_injection(chunk.text)
            session.add(
                KnowledgeChunk(
                    id=rid("chk"),
                    document_id=doc["id"],
                    workspace_id=DEMO_WORKSPACE_ID,
                    ordinal=chunk.ordinal,
                    section=chunk.section,
                    page=chunk.page,
                    text=chunk.text,
                    embedding=json.dumps(embedder.embed(chunk.text)),
                    token_count=chunk.token_count,
                    flagged=inj.matched,
                    flag_reason=(f"Prompt-injection patterns: {', '.join(inj.patterns)}" if inj.matched else None),
                )
            )

    for ticket in SEED_TICKETS:
        created = now - timedelta(hours=float(ticket["hours_ago"]))
        updated = created + timedelta(minutes=5)
        sla = created + timedelta(hours=float(ticket["sla_hours"]))
        first = (
            now - timedelta(hours=float(ticket["first_response_hours_ago"]))
            if ticket.get("first_response_hours_ago") is not None
            else None
        )
        resolved = (
            now - timedelta(hours=float(ticket["resolved_hours_ago"]))
            if ticket.get("resolved_hours_ago") is not None
            else None
        )
        session.add(
            Ticket(
                id=ticket["id"],
                workspace_id=DEMO_WORKSPACE_ID,
                public_id=ticket["public_id"],
                customer_id=ticket["customer_id"],
                subject=ticket["subject"],
                category=ticket["category"],
                priority=ticket["priority"],
                status=ticket["status"],
                assignee_id=ticket.get("assignee_id"),
                channel=ticket["channel"],
                tags=json.dumps(ticket.get("tags") or []),
                created_at=created,
                updated_at=updated,
                first_response_at=first,
                resolved_at=resolved,
                sla_deadline_at=sla,
                unread=bool(ticket.get("unread")),
                showcase=ticket.get("showcase"),
            )
        )
        for msg in ticket.get("messages") or []:
            session.add(
                ConversationMessage(
                    id=rid("msg"),
                    ticket_id=ticket["id"],
                    author_type=msg["author_type"],
                    author_name=msg["author_name"],
                    body=msg["body"],
                    created_at=now - timedelta(minutes=float(msg["minutes_ago"])),
                    channel=msg["channel"],
                    is_internal=bool(msg.get("is_internal")),
                    simulated=False,
                )
            )
        for note in ticket.get("notes") or []:
            session.add(
                InternalNote(
                    id=rid("nte"),
                    ticket_id=ticket["id"],
                    author_id=note["author_id"],
                    author_name=note["author_name"],
                    body=note["body"],
                    created_at=now - timedelta(minutes=float(note["minutes_ago"])),
                )
            )

    session.add(
        AuditEvent(
            id=rid("aud"),
            workspace_id=DEMO_WORKSPACE_ID,
            actor_id="system",
            actor_name="SupportPilot",
            action="demo.seeded",
            entity_type="workspace",
            entity_id=DEMO_WORKSPACE_ID,
            metadata_json=json.dumps({"tickets": len(SEED_TICKETS), "documents": len(SEED_DOCUMENTS)}),
            created_at=now,
        )
    )
    await session.flush()


async def workspace_exists(session: AsyncSession) -> bool:
    result = await session.execute(select(Workspace.id).where(Workspace.id == DEMO_WORKSPACE_ID))
    return result.scalar_one_or_none() is not None


def dump_seed_summary() -> dict[str, Any]:
    return {"tickets": len(SEED_TICKETS), "documents": len(SEED_DOCUMENTS), "customers": len(CUSTOMERS)}
