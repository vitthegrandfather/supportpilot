"""Model-to-dict helpers used by API services."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from app.models import (
    AuditEvent,
    ConversationMessage,
    Customer,
    InternalNote,
    KnowledgeChunk,
    KnowledgeDocument,
    ReplyDraft,
    RetrievedCitation,
    Ticket,
)


def iso(value: datetime | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.isoformat() + "Z"
        return value.isoformat().replace("+00:00", "Z")
    return str(value)


def parse_json(value: Any, fallback: Any) -> Any:
    if isinstance(value, (dict, list)):
        return value
    if not isinstance(value, str):
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def sla_state(deadline: datetime | str, status: str, now: datetime | None = None) -> str:
    if status == "resolved":
        return "met"
    current = now or datetime.now(deadline.tzinfo if isinstance(deadline, datetime) else None)
    end = deadline if isinstance(deadline, datetime) else datetime.fromisoformat(str(deadline).replace("Z", "+00:00"))
    if current.tzinfo is None and end.tzinfo is not None:
        current = current.replace(tzinfo=timezone.utc)
    delta = (end - current).total_seconds()
    if delta < 0:
        return "breached"
    if delta < 2 * 3600:
        return "warning"
    return "ok"


def ticket_list_item(
    ticket: Ticket, customer: Customer, assignee_name: str | None, last: ConversationMessage | None
) -> dict[str, Any]:
    return {
        "id": ticket.id,
        "workspace_id": ticket.workspace_id,
        "public_id": ticket.public_id,
        "customer_id": ticket.customer_id,
        "subject": ticket.subject,
        "category": ticket.category,
        "priority": ticket.priority,
        "status": ticket.status,
        "assignee_id": ticket.assignee_id,
        "channel": ticket.channel,
        "tags": parse_json(ticket.tags, []),
        "created_at": iso(ticket.created_at),
        "updated_at": iso(ticket.updated_at),
        "first_response_at": iso(ticket.first_response_at),
        "resolved_at": iso(ticket.resolved_at),
        "sla_deadline_at": iso(ticket.sla_deadline_at),
        "unread": bool(ticket.unread),
        "showcase": ticket.showcase,
        "customer_name": customer.name,
        "customer_company": customer.company,
        "assignee_name": assignee_name,
        "sla_state": sla_state(ticket.sla_deadline_at, ticket.status),
        "last_activity_at": iso(last.created_at if last else ticket.updated_at),
        "snippet": (last.body[:140] if last else ""),
    }


def map_message(row: ConversationMessage) -> dict[str, Any]:
    return {
        "id": row.id,
        "ticket_id": row.ticket_id,
        "author_type": row.author_type,
        "author_name": row.author_name,
        "body": row.body,
        "created_at": iso(row.created_at),
        "channel": row.channel,
        "is_internal": bool(row.is_internal),
        "simulated": bool(row.simulated),
    }


def map_note(row: InternalNote) -> dict[str, Any]:
    return {
        "id": row.id,
        "ticket_id": row.ticket_id,
        "author_id": row.author_id,
        "author_name": row.author_name,
        "body": row.body,
        "created_at": iso(row.created_at),
    }


def map_draft(row: ReplyDraft, citations: list[RetrievedCitation]) -> dict[str, Any]:
    return {
        "id": row.id,
        "public_id": row.public_id,
        "ticket_id": row.ticket_id,
        "state": row.state,
        "body": row.body,
        "original_body": row.original_body,
        "confidence": float(row.confidence),
        "classification": parse_json(
            row.classification_json,
            {
                "category": "other",
                "sentiment": "neutral",
                "urgency": "medium",
                "suggested_priority": "normal",
                "reasoning": "",
                "safety_flags": [],
            },
        ),
        "citations": [map_citation(c) for c in citations],
        "knowledge_gaps": parse_json(row.knowledge_gaps_json, []),
        "escalate": bool(row.escalate),
        "escalate_reason": row.escalate_reason,
        "insufficient_evidence": bool(row.insufficient_evidence),
        "created_at": iso(row.created_at),
        "updated_at": iso(row.updated_at),
        "approved_by": row.approved_by,
        "approved_at": iso(row.approved_at),
        "sent_at": iso(row.sent_at),
    }


def map_citation(row: RetrievedCitation) -> dict[str, Any]:
    return {
        "id": row.id,
        "chunk_id": row.chunk_id,
        "document_id": row.document_id,
        "document_title": row.document_title,
        "section": row.section,
        "excerpt": row.excerpt,
        "score": float(row.score),
        "marker": int(row.marker),
        "flagged": bool(row.flagged),
    }


def map_audit(row: AuditEvent) -> dict[str, Any]:
    return {
        "id": row.id,
        "workspace_id": row.workspace_id,
        "actor_id": row.actor_id,
        "actor_name": row.actor_name,
        "action": row.action,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "metadata": parse_json(row.metadata_json, {}),
        "created_at": iso(row.created_at),
    }


def map_document(row: KnowledgeDocument) -> dict[str, Any]:
    return {
        "id": row.id,
        "workspace_id": row.workspace_id,
        "public_id": row.public_id,
        "title": row.title,
        "category": row.category,
        "version": row.version,
        "source_type": row.source_type,
        "status": row.status,
        "chunk_count": row.chunk_count,
        "last_indexed_at": iso(row.last_indexed_at),
        "owner_id": row.owner_id,
        "owner_name": row.owner_name,
        "usage_count": row.usage_count,
        "filename": row.filename,
        "body": row.body,
        "failed_reason": row.failed_reason,
        "suspicious": bool(row.suspicious),
    }


def map_chunk(row: KnowledgeChunk) -> dict[str, Any]:
    return {
        "id": row.id,
        "document_id": row.document_id,
        "workspace_id": row.workspace_id,
        "ordinal": row.ordinal,
        "section": row.section,
        "page": row.page,
        "text": row.text,
        "embedding": parse_json(row.embedding, []),
        "token_count": row.token_count,
        "flagged": bool(row.flagged),
        "flag_reason": row.flag_reason,
    }


def customer_out(row: Customer) -> dict[str, Any]:
    return {
        "id": row.id,
        "workspace_id": row.workspace_id,
        "name": row.name,
        "email": row.email,
        "company": row.company,
        "plan": row.plan,
        "region": row.region,
        "created_at": iso(row.created_at),
        "account_id": row.account_id,
        "health": row.health,
    }
