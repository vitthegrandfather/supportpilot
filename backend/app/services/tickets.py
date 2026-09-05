"""Ticket listing, drafting, approval, and simulated send."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.core.ids import rid
from app.models import (
    ConversationMessage,
    Customer,
    EscalationRecord,
    InternalNote,
    KnowledgeChunk,
    KnowledgeDocument,
    Operator,
    ReplyDraft,
    RetrievalRun,
    RetrievedCitation,
    SafetyEvent,
    Ticket,
)
from app.providers.sandbox import SandboxEmbeddingProvider
from app.rag.pipeline import run_grounded_pipeline
from app.services.audit import write_audit
from app.services.serialize import (
    customer_out,
    iso,
    map_audit,
    map_draft,
    map_message,
    map_note,
    parse_json,
    ticket_list_item,
)

embedder = SandboxEmbeddingProvider()
PRIORITY_RANK = {"urgent": 0, "high": 1, "normal": 2, "low": 3}


async def get_ticket_row(session: AsyncSession, workspace_id: str, ticket_id: str) -> Ticket:
    result = await session.execute(
        select(Ticket).where(
            Ticket.workspace_id == workspace_id,
            or_(Ticket.id == ticket_id, Ticket.public_id == ticket_id),
        )
    )
    ticket = result.scalar_one_or_none()
    if ticket is None:
        raise ApiError("not_found", "Ticket not found.", 404)
    return ticket


def apply_ticket_filters(items: list[dict[str, Any]], filters: dict[str, Any]) -> list[dict[str, Any]]:
    next_items = items
    q = (filters.get("q") or "").lower()
    if q:
        next_items = [
            t
            for t in next_items
            if q in t["subject"].lower()
            or q in t["customer_name"].lower()
            or q in t["public_id"].lower()
            or q in (t.get("snippet") or "").lower()
        ]
    if filters.get("status") and filters["status"] != "all":
        next_items = [t for t in next_items if t["status"] == filters["status"]]
    if filters.get("priority") and filters["priority"] != "all":
        next_items = [t for t in next_items if t["priority"] == filters["priority"]]
    if filters.get("category") and filters["category"] != "all":
        next_items = [t for t in next_items if t["category"] == filters["category"]]
    assignee = filters.get("assignee")
    if assignee == "unassigned":
        next_items = [t for t in next_items if not t["assignee_id"]]
    elif assignee and assignee != "all":
        next_items = [t for t in next_items if t["assignee_id"] == assignee]
    if filters.get("needs_review"):
        next_items = [
            t
            for t in next_items
            if "needs-review" in (t.get("tags") or [])
            or t["status"] == "escalated"
            or t.get("showcase") in {"low_confidence", "security"}
            or t.get("unread")
        ]
    sort = filters.get("sort") or "newest"

    def key(item: dict[str, Any]) -> tuple:
        if sort == "oldest":
            return (item["created_at"],)
        if sort == "priority":
            return (PRIORITY_RANK.get(item["priority"], 9),)
        if sort == "sla":
            return (item["sla_deadline_at"],)
        return (item["created_at"],)

    reverse = sort not in {"oldest", "priority", "sla"}
    return sorted(next_items, key=key, reverse=reverse)


async def list_tickets(
    session: AsyncSession, workspace_id: str, filters: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    result = await session.execute(
        select(Ticket, Customer, Operator.name)
        .join(Customer, Customer.id == Ticket.customer_id)
        .outerjoin(Operator, Operator.id == Ticket.assignee_id)
        .where(Ticket.workspace_id == workspace_id)
    )
    last_result = await session.execute(select(ConversationMessage).order_by(ConversationMessage.created_at.desc()))
    last_map: dict[str, ConversationMessage] = {}
    for msg in last_result.scalars():
        last_map.setdefault(msg.ticket_id, msg)
    items = [
        ticket_list_item(ticket, customer, assignee_name, last_map.get(ticket.id))
        for ticket, customer, assignee_name in result.all()
    ]
    return apply_ticket_filters(items, filters or {})


async def get_ticket_detail(session: AsyncSession, workspace_id: str, ticket_id: str) -> dict[str, Any]:
    ticket = await get_ticket_row(session, workspace_id, ticket_id)
    customer = await session.get(Customer, ticket.customer_id)
    if customer is None:
        raise ApiError("not_found", "Customer not found.", 404)
    assignee = await session.get(Operator, ticket.assignee_id) if ticket.assignee_id else None
    messages = (
        (
            await session.execute(
                select(ConversationMessage)
                .where(ConversationMessage.ticket_id == ticket.id)
                .order_by(ConversationMessage.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    notes = (
        (
            await session.execute(
                select(InternalNote).where(InternalNote.ticket_id == ticket.id).order_by(InternalNote.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    drafts = (
        (
            await session.execute(
                select(ReplyDraft).where(ReplyDraft.ticket_id == ticket.id).order_by(ReplyDraft.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    citations_by_draft: dict[str, list[RetrievedCitation]] = {d.id: [] for d in drafts}
    if drafts:
        cits = (
            (
                await session.execute(
                    select(RetrievedCitation)
                    .where(RetrievedCitation.draft_id.in_([d.id for d in drafts]))
                    .order_by(RetrievedCitation.marker)
                )
            )
            .scalars()
            .all()
        )
        for cit in cits:
            if cit.draft_id:
                citations_by_draft.setdefault(cit.draft_id, []).append(cit)
    escalations = (
        (
            await session.execute(
                select(EscalationRecord)
                .where(EscalationRecord.ticket_id == ticket.id)
                .order_by(EscalationRecord.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    from app.models import AuditEvent

    audit_rows = (
        (
            await session.execute(
                select(AuditEvent)
                .where(
                    or_(
                        AuditEvent.entity_id == ticket.id,
                        AuditEvent.entity_id.in_(select(ReplyDraft.id).where(ReplyDraft.ticket_id == ticket.id)),
                        AuditEvent.metadata_json.like(f"%{ticket.id}%"),
                    )
                )
                .order_by(AuditEvent.created_at.desc())
                .limit(20)
            )
        )
        .scalars()
        .all()
    )
    safety_rows = (
        (
            await session.execute(
                select(SafetyEvent)
                .where(SafetyEvent.ticket_id == ticket.id)
                .order_by(SafetyEvent.created_at.desc())
                .limit(10)
            )
        )
        .scalars()
        .all()
    )
    return {
        "ticket": ticket_list_item(
            ticket, customer, assignee.name if assignee else None, messages[-1] if messages else None
        ),
        "customer": customer_out(customer),
        "messages": [map_message(m) for m in messages],
        "notes": [map_note(n) for n in notes],
        "drafts": [map_draft(d, citations_by_draft.get(d.id, [])) for d in drafts],
        "escalations": [
            {
                "id": e.id,
                "ticket_id": e.ticket_id,
                "reason": e.reason,
                "recommended_queue": e.recommended_queue,
                "created_at": iso(e.created_at),
                "created_by": e.created_by,
            }
            for e in escalations
        ],
        "audit": [map_audit(a) for a in audit_rows],
        "safety_events": [
            {
                "id": s.id,
                "type": s.event_type,
                "detail": s.detail,
                "created_at": iso(s.created_at),
            }
            for s in safety_rows
        ],
    }


async def patch_ticket(
    session: AsyncSession,
    workspace_id: str,
    ticket_id: str,
    patch: dict[str, Any],
    actor: dict[str, str],
) -> dict[str, Any]:
    ticket = await get_ticket_row(session, workspace_id, ticket_id)
    now = datetime.now(timezone.utc)
    if "status" in patch and patch["status"]:
        ticket.status = patch["status"]
        ticket.resolved_at = now if patch["status"] == "resolved" else ticket.resolved_at
    if "priority" in patch and patch["priority"]:
        ticket.priority = patch["priority"]
    if "assignee_id" in patch:
        ticket.assignee_id = patch["assignee_id"]
    ticket.updated_at = now
    ticket.unread = False
    await write_audit(
        session,
        "ticket.updated",
        "ticket",
        ticket.id,
        {
            "status": patch.get("status"),
            "priority": patch.get("priority"),
            "assignee_id": patch.get("assignee_id"),
        },
        workspace_id=workspace_id,
        actor_id=actor["id"],
        actor_name=actor["name"],
    )
    await session.flush()
    return await get_ticket_detail(session, workspace_id, ticket.id)


async def add_internal_note(
    session: AsyncSession,
    workspace_id: str,
    ticket_id: str,
    body: str,
    actor: dict[str, str],
) -> dict[str, Any]:
    if not body.strip():
        raise ApiError("validation_error", "Note body is required.", 422)
    ticket = await get_ticket_row(session, workspace_id, ticket_id)
    now = datetime.now(timezone.utc)
    note = InternalNote(
        id=rid("nte"),
        ticket_id=ticket.id,
        author_id=actor["id"],
        author_name=actor["name"],
        body=body.strip(),
        created_at=now,
    )
    session.add(note)
    ticket.updated_at = now
    await write_audit(
        session,
        "ticket.internal_note",
        "ticket",
        ticket.id,
        {"note_id": note.id},
        workspace_id=workspace_id,
        actor_id=actor["id"],
        actor_name=actor["name"],
    )
    await session.flush()
    return map_note(note)


async def generate_draft(
    session: AsyncSession,
    workspace_id: str,
    ticket_id: str,
    actor: dict[str, str],
) -> dict[str, Any]:
    detail = await get_ticket_detail(session, workspace_id, ticket_id)
    docs = (
        (await session.execute(select(KnowledgeDocument).where(KnowledgeDocument.workspace_id == workspace_id)))
        .scalars()
        .all()
    )
    chunks = (
        (await session.execute(select(KnowledgeChunk).where(KnowledgeChunk.workspace_id == workspace_id)))
        .scalars()
        .all()
    )
    customer_msg = next((m for m in reversed(detail["messages"]) if m["author_type"] == "customer"), None)
    seq = (await session.execute(select(func.count()).select_from(ReplyDraft))).scalar_one()
    output = run_grounded_pipeline(
        {
            "ticket_id": detail["ticket"]["id"],
            "public_id": detail["ticket"]["public_id"],
            "subject": detail["ticket"]["subject"],
            "customer_name": detail["customer"]["name"],
            "customer_message": customer_msg["body"] if customer_msg else detail["ticket"]["subject"],
            "documents": [{"id": d.id, "title": d.title, "status": d.status} for d in docs],
            "chunks": [
                {
                    "id": c.id,
                    "document_id": c.document_id,
                    "workspace_id": c.workspace_id,
                    "ordinal": c.ordinal,
                    "section": c.section,
                    "page": c.page,
                    "text": c.text,
                    "embedding": parse_json(c.embedding, []),
                    "token_count": c.token_count,
                    "flagged": c.flagged,
                    "flag_reason": c.flag_reason,
                }
                for c in chunks
            ],
            "draft_seq": int(seq or 0) + 231,
        },
        embedder,
    )
    now = datetime.now(timezone.utc)
    run = RetrievalRun(
        id=rid("run"),
        workspace_id=workspace_id,
        ticket_id=detail["ticket"]["id"],
        query=detail["ticket"]["subject"],
        created_at=now,
    )
    session.add(run)
    draft_data = output["draft"]
    draft = ReplyDraft(
        id=draft_data["id"],
        public_id=draft_data["public_id"],
        ticket_id=detail["ticket"]["id"],
        state=draft_data["state"],
        body=draft_data["body"],
        original_body=draft_data["original_body"],
        confidence=draft_data["confidence"],
        classification_json=json.dumps(draft_data["classification"]),
        knowledge_gaps_json=json.dumps(draft_data["knowledge_gaps"]),
        escalate=bool(draft_data["escalate"]),
        escalate_reason=draft_data["escalate_reason"],
        insufficient_evidence=bool(draft_data["insufficient_evidence"]),
        created_at=now,
        updated_at=now,
    )
    session.add(draft)
    for cit in draft_data["citations"]:
        session.add(
            RetrievedCitation(
                id=cit["id"],
                run_id=run.id,
                draft_id=draft.id,
                chunk_id=cit["chunk_id"],
                document_id=cit["document_id"],
                document_title=cit["document_title"],
                section=cit["section"],
                excerpt=cit["excerpt"],
                score=cit["score"],
                marker=cit["marker"],
                flagged=bool(cit.get("flagged")),
            )
        )
        doc = await session.get(KnowledgeDocument, cit["document_id"])
        if doc:
            doc.usage_count = int(doc.usage_count or 0) + 1
    for ev in output["safety_events"]:
        session.add(
            SafetyEvent(
                id=rid("saf"),
                workspace_id=workspace_id,
                ticket_id=detail["ticket"]["id"],
                document_id=None,
                event_type=ev["type"],
                detail=ev["detail"],
                created_at=now,
            )
        )
    ticket = await get_ticket_row(session, workspace_id, detail["ticket"]["id"])
    if draft_data["escalate"]:
        session.add(
            EscalationRecord(
                id=rid("esc"),
                ticket_id=ticket.id,
                reason=draft_data["escalate_reason"] or "Escalation recommended",
                recommended_queue="tier2_policy" if draft_data["insufficient_evidence"] else "human_review",
                created_at=now,
                created_by="sandbox-pipeline",
            )
        )
        if ticket.status != "escalated" and draft_data["insufficient_evidence"]:
            ticket.status = "escalated"
    ticket.unread = False
    ticket.updated_at = now
    await write_audit(
        session,
        "draft.generated",
        "draft",
        draft.id,
        {
            "ticketId": ticket.id,
            "confidence": draft.confidence,
            "escalate": draft.escalate,
            "insufficientEvidence": draft.insufficient_evidence,
            "safetyEventCount": len(output["safety_events"]),
        },
        workspace_id=workspace_id,
        actor_id=actor["id"],
        actor_name=actor["name"],
    )
    await session.flush()
    return {
        "draft": draft_data,
        "safety_events": output["safety_events"],
        "uncited_sentences": output["uncited_sentences"],
    }


async def edit_draft(
    session: AsyncSession,
    workspace_id: str,
    ticket_id: str,
    draft_id: str,
    body: str,
    actor: dict[str, str],
) -> dict[str, Any]:
    ticket = await get_ticket_row(session, workspace_id, ticket_id)
    draft = await session.get(ReplyDraft, draft_id)
    if draft is None or draft.ticket_id != ticket.id:
        raise ApiError("not_found", "Draft not found.", 404)
    if draft.state == "simulated_sent":
        raise ApiError("invalid_state", "A simulated sent reply cannot be edited.", 409)
    draft.body = body
    draft.state = "edited"
    draft.updated_at = datetime.now(timezone.utc)
    draft.approved_by = None
    draft.approved_at = None
    await write_audit(
        session,
        "draft.edited",
        "draft",
        draft.id,
        {"ticketId": ticket.id},
        workspace_id=workspace_id,
        actor_id=actor["id"],
        actor_name=actor["name"],
    )
    await session.flush()
    return await get_ticket_detail(session, workspace_id, ticket.id)


async def approve_draft(
    session: AsyncSession,
    workspace_id: str,
    ticket_id: str,
    draft_id: str,
    actor: dict[str, str],
) -> dict[str, Any]:
    ticket = await get_ticket_row(session, workspace_id, ticket_id)
    draft = await session.get(ReplyDraft, draft_id)
    if draft is None or draft.ticket_id != ticket.id:
        raise ApiError("not_found", "Draft not found.", 404)
    if draft.insufficient_evidence:
        raise ApiError(
            "insufficient_evidence",
            "The knowledge base does not contain enough evidence to draft a reliable answer.",
            409,
        )
    if draft.state in {"blocked", "simulated_sent"}:
        raise ApiError("invalid_state", "This draft cannot be approved.", 409)
    now = datetime.now(timezone.utc)
    draft.state = "approved"
    draft.approved_by = actor["id"]
    draft.approved_at = now
    draft.updated_at = now
    await write_audit(
        session,
        "draft.approved",
        "draft",
        draft.id,
        {"ticketId": ticket.id},
        workspace_id=workspace_id,
        actor_id=actor["id"],
        actor_name=actor["name"],
    )
    await session.flush()
    return await get_ticket_detail(session, workspace_id, ticket.id)


async def send_simulated(
    session: AsyncSession,
    workspace_id: str,
    ticket_id: str,
    draft_id: str,
    actor: dict[str, str],
) -> dict[str, Any]:
    ticket = await get_ticket_row(session, workspace_id, ticket_id)
    draft = await session.get(ReplyDraft, draft_id)
    if draft is None or draft.ticket_id != ticket.id:
        raise ApiError("not_found", "Draft not found.", 404)
    if draft.state != "approved":
        raise ApiError("not_approved", "A draft must be approved by an operator before simulated send.", 409)
    now = datetime.now(timezone.utc)
    session.add(
        ConversationMessage(
            id=rid("msg"),
            ticket_id=ticket.id,
            author_type="operator",
            author_name=actor["name"],
            body=draft.body,
            created_at=now,
            channel=ticket.channel,
            is_internal=False,
            simulated=True,
        )
    )
    draft.state = "simulated_sent"
    draft.sent_at = now
    draft.updated_at = now
    if ticket.status == "new":
        ticket.status = "in_progress"
    if ticket.first_response_at is None:
        ticket.first_response_at = now
    ticket.updated_at = now
    ticket.unread = False
    await write_audit(
        session,
        "draft.simulated_send",
        "draft",
        draft.id,
        {
            "ticketId": ticket.id,
            "disclaimer": "Simulated delivery only. No email or messaging provider was contacted.",
        },
        workspace_id=workspace_id,
        actor_id=actor["id"],
        actor_name=actor["name"],
    )
    await session.flush()
    return await get_ticket_detail(session, workspace_id, ticket.id)


async def escalate_ticket(
    session: AsyncSession,
    workspace_id: str,
    ticket_id: str,
    reason: str,
    actor: dict[str, str],
) -> dict[str, Any]:
    ticket = await get_ticket_row(session, workspace_id, ticket_id)
    now = datetime.now(timezone.utc)
    session.add(
        EscalationRecord(
            id=rid("esc"),
            ticket_id=ticket.id,
            reason=reason or "Operator escalation",
            recommended_queue="human_review",
            created_at=now,
            created_by=actor["id"],
        )
    )
    ticket.status = "escalated"
    ticket.updated_at = now
    await write_audit(
        session,
        "ticket.escalated",
        "ticket",
        ticket.id,
        {"reason": reason},
        workspace_id=workspace_id,
        actor_id=actor["id"],
        actor_name=actor["name"],
    )
    await session.flush()
    return await get_ticket_detail(session, workspace_id, ticket.id)
