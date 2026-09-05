"""Document lookups scoped to a workspace."""

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models import KnowledgeDocument


async def get_document(session: AsyncSession, workspace_id: str, document_id: str) -> KnowledgeDocument:
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
