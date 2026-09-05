"""Dashboard and analytics metrics derived from seeded tickets."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditEvent, EscalationRecord, KnowledgeDocument, ReplyDraft, Ticket
from app.services.serialize import iso, parse_json, sla_state


async def dashboard_metrics(session: AsyncSession, workspace_id: str) -> dict[str, Any]:
    tickets = (await session.execute(select(Ticket).where(Ticket.workspace_id == workspace_id))).scalars().all()
    open_tickets = [t for t in tickets if t.status != "resolved"]
    needs_review = [t for t in tickets if t.status == "escalated" or t.showcase == "security" or bool(t.unread)]
    escalated = [t for t in tickets if t.status == "escalated"]
    sla_hits = [
        t
        for t in tickets
        if (t.first_response_at is None and t.status == "resolved")
        or (t.first_response_at is not None and t.first_response_at <= t.sla_deadline_at)
    ]
    resolved = [t for t in tickets if t.status == "resolved"]
    drafts = (
        (
            await session.execute(
                select(ReplyDraft)
                .join(Ticket, Ticket.id == ReplyDraft.ticket_id)
                .where(Ticket.workspace_id == workspace_id)
            )
        )
        .scalars()
        .all()
    )
    avg_conf = sum(d.confidence for d in drafts) / len(drafts) if drafts else 0.78

    volume_by_day = []
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    for i in range(13, -1, -1):
        day = today - timedelta(days=i)
        key = day.date().isoformat()
        count = sum(1 for t in tickets if t.created_at.date().isoformat() == key)
        volume_by_day.append({"date": key, "count": count})

    cat_map: Counter[str] = Counter(t.category for t in tickets)
    esc = (
        await session.execute(
            select(EscalationRecord, Ticket.public_id, Ticket.subject)
            .join(Ticket, Ticket.id == EscalationRecord.ticket_id)
            .where(Ticket.workspace_id == workspace_id)
            .order_by(EscalationRecord.created_at.desc())
            .limit(5)
        )
    ).all()
    activity = (
        (
            await session.execute(
                select(AuditEvent)
                .where(AuditEvent.workspace_id == workspace_id)
                .order_by(AuditEvent.created_at.desc())
                .limit(8)
            )
        )
        .scalars()
        .all()
    )
    gap_count: Counter[str] = Counter()
    for draft in drafts:
        for item in parse_json(draft.knowledge_gaps_json, []):
            gap_count[str(item)] += 1
    if not gap_count:
        gap_count["No public-sector or government tenant policy is indexed."] = 1
        gap_count["No white-glove onboarding policy is indexed."] = 1

    return {
        "open_tickets": len(open_tickets),
        "needs_review": len(needs_review),
        "escalated": len(escalated),
        "first_response_sla": (len(sla_hits) / len(tickets)) if tickets else 0,
        "resolution_rate": (len(resolved) / len(tickets)) if tickets else 0,
        "average_confidence": round(avg_conf, 2),
        "volume_by_day": volume_by_day,
        "by_category": [{"category": k, "count": v} for k, v in cat_map.items()],
        "recent_escalations": [
            {
                "ticket_public_id": public_id,
                "subject": subject,
                "reason": rec.reason,
                "created_at": iso(rec.created_at),
            }
            for rec, public_id, subject in esc
        ],
        "knowledge_gaps": [{"gap": g, "count": c} for g, c in gap_count.most_common(8)],
        "recent_activity": [
            {
                "id": a.id,
                "actor_name": a.actor_name,
                "action": a.action,
                "created_at": iso(a.created_at),
            }
            for a in activity
        ],
    }


async def analytics(session: AsyncSession, workspace_id: str, range_days: int) -> dict[str, Any]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=range_days)
    tickets = (await session.execute(select(Ticket).where(Ticket.workspace_id == workspace_id))).scalars().all()
    in_range = [t for t in tickets if t.created_at >= cutoff]
    resolved = [t for t in in_range if t.status == "resolved"]
    escalated = [t for t in in_range if t.status == "escalated"]
    drafts = (
        (
            await session.execute(
                select(ReplyDraft)
                .join(Ticket, Ticket.id == ReplyDraft.ticket_id)
                .where(Ticket.workspace_id == workspace_id)
            )
        )
        .scalars()
        .all()
    )
    approved = [d for d in drafts if d.state in {"approved", "simulated_sent"}]
    edited = [d for d in drafts if d.state in {"edited", "approved", "simulated_sent"} and d.body != d.original_body]
    avg_conf = sum(d.confidence for d in drafts) / len(drafts) if drafts else 0.0
    first_hours = []
    for t in in_range:
        if t.first_response_at:
            first_hours.append((t.first_response_at - t.created_at).total_seconds() / 3600)
    sla_dist: Counter[str] = Counter()
    for t in tickets:
        sla_dist[sla_state(t.sla_deadline_at, t.status)] += 1
    docs = (
        (
            await session.execute(
                select(KnowledgeDocument)
                .where(KnowledgeDocument.workspace_id == workspace_id)
                .order_by(KnowledgeDocument.usage_count.desc())
                .limit(8)
            )
        )
        .scalars()
        .all()
    )
    cats: Counter[str] = Counter(t.category for t in in_range)
    volume = []
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    span = min(range_days, 30)
    for i in range(span - 1, -1, -1):
        day = today - timedelta(days=i)
        key = day.date().isoformat()
        volume.append({"date": key, "count": sum(1 for t in tickets if t.created_at.date().isoformat() == key)})
    gap_count: Counter[str] = Counter()
    for draft in drafts:
        for item in parse_json(draft.knowledge_gaps_json, []):
            gap_count[str(item)] += 1
    edit_distance = 0.0
    if edited:
        diffs = []
        for d in edited:
            a, b = d.original_body, d.body
            diffs.append(abs(len(a) - len(b)) / max(len(a), 1))
        edit_distance = sum(diffs) / len(diffs)
    return {
        "range_days": range_days,
        "resolution_rate": (len(resolved) / len(in_range)) if in_range else 0,
        "first_response_hours": round(sum(first_hours) / len(first_hours), 1) if first_hours else 0,
        "escalation_rate": (len(escalated) / len(in_range)) if in_range else 0,
        "draft_acceptance_rate": (len(approved) / len(drafts)) if drafts else 0,
        "average_confidence": round(avg_conf, 2),
        "edit_distance": round(edit_distance, 2),
        "ticket_volume": volume,
        "categories": [{"category": k, "count": v} for k, v in cats.most_common()],
        "top_documents": [{"title": d.title, "usage_count": d.usage_count} for d in docs],
        "knowledge_gaps": [{"gap": g, "count": c} for g, c in gap_count.most_common(8)],
        "sla_risk": [{"state": k, "count": v} for k, v in sla_dist.items()],
    }
