"""Ticket REST routes."""

from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, enforce_generate, enforce_mutate, get_principal
from app.db.session import get_db
from app.services import tickets as ticket_service

router = APIRouter(prefix="/api/v1")


class TicketPatch(BaseModel):
    status: str | None = None
    priority: str | None = None
    assignee_id: str | None = None


class NoteIn(BaseModel):
    body: str = Field(min_length=1)


class DraftEditIn(BaseModel):
    body: str = Field(min_length=1)


class EscalateIn(BaseModel):
    reason: str = "Operator requested escalation."


@router.get("/tickets")
async def list_tickets(
    q: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    category: str | None = None,
    assignee: str | None = None,
    needs_review: bool = False,
    sort: str = "newest",
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    items = await ticket_service.list_tickets(
        db,
        principal.workspace_id,
        {
            "q": q,
            "status": status,
            "priority": priority,
            "category": category,
            "assignee": assignee,
            "needs_review": needs_review,
            "sort": sort,
        },
    )
    start = (page - 1) * page_size
    return {
        "items": items[start : start + page_size],
        "page": page,
        "page_size": page_size,
        "total": len(items),
    }


@router.get("/tickets/{ticket_id}")
async def get_ticket(
    ticket_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    return await ticket_service.get_ticket_detail(db, principal.workspace_id, ticket_id)


@router.patch("/tickets/{ticket_id}")
async def patch_ticket(
    ticket_id: str,
    body: TicketPatch,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    enforce_mutate(principal)
    result = await ticket_service.patch_ticket(
        db, principal.workspace_id, ticket_id, body.model_dump(), principal.as_actor()
    )
    await db.commit()
    return result


@router.post("/tickets/{ticket_id}/notes")
async def add_note(
    ticket_id: str,
    body: NoteIn,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    enforce_mutate(principal)
    result = await ticket_service.add_internal_note(
        db, principal.workspace_id, ticket_id, body.body, principal.as_actor()
    )
    await db.commit()
    return result


@router.post("/tickets/{ticket_id}/generate")
async def generate(
    ticket_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    enforce_generate(principal)
    result = await ticket_service.generate_draft(db, principal.workspace_id, ticket_id, principal.as_actor())
    await db.commit()
    return result


@router.post("/tickets/{ticket_id}/drafts/{draft_id}/edit")
async def edit_draft(
    ticket_id: str,
    draft_id: str,
    body: DraftEditIn,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    enforce_mutate(principal)
    result = await ticket_service.edit_draft(
        db, principal.workspace_id, ticket_id, draft_id, body.body, principal.as_actor()
    )
    await db.commit()
    return result


@router.post("/tickets/{ticket_id}/drafts/{draft_id}/approve")
async def approve_draft(
    ticket_id: str,
    draft_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    enforce_mutate(principal)
    result = await ticket_service.approve_draft(db, principal.workspace_id, ticket_id, draft_id, principal.as_actor())
    await db.commit()
    return result


@router.post("/tickets/{ticket_id}/drafts/{draft_id}/send")
async def send_draft(
    ticket_id: str,
    draft_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    enforce_mutate(principal)
    result = await ticket_service.send_simulated(db, principal.workspace_id, ticket_id, draft_id, principal.as_actor())
    await db.commit()
    return result


@router.post("/tickets/{ticket_id}/escalate")
async def escalate(
    ticket_id: str,
    body: EscalateIn,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    enforce_mutate(principal)
    result = await ticket_service.escalate_ticket(
        db, principal.workspace_id, ticket_id, body.reason, principal.as_actor()
    )
    await db.commit()
    return result
