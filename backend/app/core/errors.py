"""API error types and JSON envelopes."""

from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details


def error_envelope(
    *,
    code: str,
    message: str,
    request_id: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    error: dict[str, Any] = {
        "code": code,
        "message": message,
        "request_id": request_id,
    }
    if details:
        error["details"] = details
    return {"error": error}


def _rid(request: Request) -> str:
    return getattr(request.state, "request_id", "req_unknown")


async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status,
        content=error_envelope(
            code=exc.code,
            message=exc.message,
            request_id=_rid(request),
            details=exc.details,
        ),
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = "http_error"
    if exc.status_code == 401:
        code = "unauthorized"
    elif exc.status_code == 403:
        code = "forbidden"
    elif exc.status_code == 404:
        code = "not_found"
    elif exc.status_code == 429:
        code = "rate_limited"
    message = exc.detail if isinstance(exc.detail, str) else "Request failed."
    return JSONResponse(
        status_code=exc.status_code,
        content=error_envelope(code=code, message=message, request_id=_rid(request)),
    )


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content=error_envelope(
            code="validation_error",
            message="Request validation failed.",
            request_id=_rid(request),
            details={"errors": exc.errors()},
        ),
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content=error_envelope(
            code="internal_error",
            message="An unexpected error occurred.",
            request_id=_rid(request),
        ),
    )
