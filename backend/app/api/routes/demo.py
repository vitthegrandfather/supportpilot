"""Demo reset and operator listing."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, enforce_mutate, get_principal, require_admin
from app.db.session import get_db
from app.models import Operator
from app.seed.runner import reset_demo

router = APIRouter(prefix="/api/v1")


@router.post("/demo/reset")
async def demo_reset(
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(require_admin),
) -> dict[str, bool]:
    enforce_mutate(principal)
    await reset_demo(db)
    await db.commit()
    return {"ok": True}


@router.get("/operators")
async def list_operators(
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[dict[str, str]]:
    rows = (await db.execute(select(Operator).where(Operator.workspace_id == principal.workspace_id))).scalars().all()
    return [
        {
            "id": o.id,
            "workspace_id": o.workspace_id,
            "name": o.name,
            "email": o.email,
            "role": o.role,
            "title": o.title,
        }
        for o in rows
    ]
