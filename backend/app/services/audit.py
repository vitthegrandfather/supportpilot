"""Audit event writer."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ids import rid
from app.models import AuditEvent
from app.seed.people import DEMO_OPERATOR_ID, DEMO_WORKSPACE_ID


async def write_audit(
    session: AsyncSession,
    action: str,
    entity_type: str,
    entity_id: str,
    metadata: dict[str, Any] | None = None,
    *,
    workspace_id: str = DEMO_WORKSPACE_ID,
    actor_id: str = DEMO_OPERATOR_ID,
    actor_name: str = "Elena Voss",
) -> None:
    session.add(
        AuditEvent(
            id=rid("aud"),
            workspace_id=workspace_id,
            actor_id=actor_id,
            actor_name=actor_name,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            metadata_json=json.dumps(metadata or {}),
            created_at=datetime.now(timezone.utc),
        )
    )
