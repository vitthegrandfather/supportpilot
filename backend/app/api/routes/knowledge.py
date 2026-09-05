"""Knowledge document routes."""

from typing import Any

from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, enforce_mutate, get_principal, require_admin
from app.db.session import get_db
from app.services import knowledge as knowledge_service

router = APIRouter(prefix="/api/v1")


class DocumentCreate(BaseModel):
    title: str = Field(min_length=1)
    body: str = Field(min_length=1)
    category: str = "policy"
    filename: str | None = None


class RetrieveTestIn(BaseModel):
    question: str = Field(min_length=1)


@router.get("/documents")
async def list_documents(
    q: str | None = None,
    category: str | None = None,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> list[dict[str, Any]]:
    return await knowledge_service.list_documents(
        db, principal.workspace_id, {"q": q, "category": category, "status": status}
    )


@router.post("/documents")
async def create_document(
    body: DocumentCreate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    enforce_mutate(principal)
    result = await knowledge_service.create_text_document(
        db, principal.workspace_id, body.model_dump(), principal.as_actor()
    )
    await db.commit()
    return result


@router.post("/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    enforce_mutate(principal)
    content = await file.read()
    result = await knowledge_service.upload_document(
        db,
        principal.workspace_id,
        file.filename or "upload.txt",
        file.content_type or "application/octet-stream",
        content,
        len(content),
        principal.as_actor(),
    )
    await db.commit()
    return result


@router.get("/documents/{document_id}")
async def get_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    return await knowledge_service.get_document(db, principal.workspace_id, document_id)


@router.post("/documents/{document_id}/reindex")
async def reindex_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    enforce_mutate(principal)
    result = await knowledge_service.reindex_document(db, principal.workspace_id, document_id, principal.as_actor())
    await db.commit()
    return result


@router.post("/documents/{document_id}/archive")
async def archive_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(require_admin),
) -> dict[str, Any]:
    enforce_mutate(principal)
    result = await knowledge_service.archive_document(db, principal.workspace_id, document_id, principal.as_actor())
    await db.commit()
    return result


@router.post("/retrieval/test")
async def retrieval_test(
    body: RetrieveTestIn,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> dict[str, Any]:
    result = await knowledge_service.test_retrieval(db, principal.workspace_id, body.question)
    await db.commit()
    return result
