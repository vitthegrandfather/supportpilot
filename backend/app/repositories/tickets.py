"""Ticket lookups scoped to a workspace."""

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models import Ticket


async def get_ticket(session: AsyncSession, workspace_id: str, ticket_id: str) -> Ticket:
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
