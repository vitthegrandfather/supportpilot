"""Async engine and session factory.

Production: PostgreSQL + pgvector for embeddings.
Tests/local: SQLite with embeddings stored as JSON text.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def _build_engine() -> AsyncEngine:
    settings = get_settings()
    kwargs: dict[str, object] = {"echo": False}
    if settings.is_sqlite:
        kwargs["connect_args"] = {"check_same_thread": False}
        url = settings.database_url
        if ":memory:" in url or url.endswith("://") or url.endswith("///"):
            kwargs["poolclass"] = StaticPool
    return create_async_engine(settings.database_url, **kwargs)


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = _build_engine()
        if get_settings().is_sqlite:

            @event.listens_for(_engine.sync_engine, "connect")
            def _fk(dbapi_connection: object, _connection_record: object) -> None:
                cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
                cursor.execute("PRAGMA foreign_keys=ON")
                cursor.close()

    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(get_engine(), expire_on_commit=False, class_=AsyncSession)
    return _session_factory


async def get_db() -> AsyncIterator[AsyncSession]:
    factory = get_session_factory()
    async with factory() as session:
        yield session


async def init_engine() -> AsyncEngine:
    return get_engine()


async def dispose_engine() -> None:
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None


def reset_engine_cache() -> None:
    global _engine, _session_factory
    _engine = None
    _session_factory = None
