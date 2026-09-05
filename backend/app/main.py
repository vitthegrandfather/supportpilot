"""SupportPilot FastAPI application."""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes import auth, demo, health, knowledge, metrics, tickets
from app.core.config import get_settings
from app.core.errors import (
    ApiError,
    api_error_handler,
    http_exception_handler,
    unhandled_error_handler,
    validation_error_handler,
)
from app.core.ids import request_id
from app.core.logging import configure_logging
from app.db.base import Base
from app.db.session import get_session_factory, init_engine
from app.models import load_models
from app.seed.runner import seed_if_empty


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)
    load_models()
    engine = await init_engine()
    if settings.auto_create_tables:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    if settings.auto_seed:
        factory = get_session_factory()
        async with factory() as session:
            await seed_if_empty(session)
            await session.commit()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title="SupportPilot",
        version="1.0.0",
        description="Grounded support copilot for the fictional HelioDesk Cloud workspace.",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.middleware("http")
    async def add_request_id(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        rid = request.headers.get("x-request-id") or request_id()
        request.state.request_id = rid
        response = await call_next(request)
        response.headers["x-request-id"] = rid
        return response

    application.add_exception_handler(ApiError, api_error_handler)  # type: ignore[arg-type]
    application.add_exception_handler(StarletteHTTPException, http_exception_handler)  # type: ignore[arg-type]
    application.add_exception_handler(RequestValidationError, validation_error_handler)  # type: ignore[arg-type]
    application.add_exception_handler(Exception, unhandled_error_handler)
    application.include_router(health.router)
    application.include_router(auth.router)
    application.include_router(tickets.router)
    application.include_router(knowledge.router)
    application.include_router(metrics.router)
    application.include_router(demo.router)
    return application


app = create_app()
