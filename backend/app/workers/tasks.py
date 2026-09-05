"""Background jobs for ingest, reindex, draft generation, and simulated delivery."""

from __future__ import annotations

import asyncio
from typing import Any

from app.db.session import get_session_factory
from app.seed.people import DEMO_OPERATOR_ID, DEMO_WORKSPACE_ID
from app.services import knowledge as knowledge_service
from app.services import tickets as ticket_service
from app.workers.celery_app import celery_app

ACTOR = {"id": DEMO_OPERATOR_ID, "name": "Elena Voss"}


def _run(coro: Any) -> Any:
    return asyncio.run(coro)


async def _with_session(fn: Any, *args: Any) -> Any:
    factory = get_session_factory()
    async with factory() as session:
        result = await fn(session, *args)
        await session.commit()
        return result


@celery_app.task(name="supportpilot.ingest_document")
def ingest_document(document_id: str, workspace_id: str = DEMO_WORKSPACE_ID) -> str:
    _run(_with_session(knowledge_service.index_document, document_id))
    return document_id


@celery_app.task(name="supportpilot.reindex_document")
def reindex_document(document_id: str, workspace_id: str = DEMO_WORKSPACE_ID) -> str:
    _run(_with_session(knowledge_service.reindex_document, workspace_id, document_id, ACTOR))
    return document_id


@celery_app.task(name="supportpilot.generate_draft")
def generate_draft(ticket_id: str, workspace_id: str = DEMO_WORKSPACE_ID) -> dict[str, Any]:
    return _run(_with_session(ticket_service.generate_draft, workspace_id, ticket_id, ACTOR))


@celery_app.task(bind=True, name="supportpilot.simulated_delivery", max_retries=3)
def simulated_delivery(
    self: Any, ticket_id: str, draft_id: str, workspace_id: str = DEMO_WORKSPACE_ID
) -> dict[str, Any]:
    try:
        return _run(_with_session(ticket_service.send_simulated, workspace_id, ticket_id, draft_id, ACTOR))
    except Exception as exc:  # noqa: BLE001
        raise self.retry(exc=exc, countdown=2) from exc
