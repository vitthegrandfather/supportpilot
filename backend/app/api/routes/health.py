"""Unauthenticated health checks."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
@router.get("/api/v1/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "supportpilot", "provider": "sandbox"}
