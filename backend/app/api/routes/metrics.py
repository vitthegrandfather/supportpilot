"""Dashboard and analytics routes."""

from typing import Any, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_principal
from app.db.session import get_db
from app.services import metrics as metrics_service

router = APIRouter(prefix="/api/v1")


@router.get("/dashboard")
async def dashboard(
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    return await metrics_service.dashboard_metrics(db, principal.workspace_id)


@router.get("/analytics")
async def analytics(
    range_days: Literal[7, 30, 90] = Query(30),
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    return await metrics_service.analytics(db, principal.workspace_id, int(range_days))
