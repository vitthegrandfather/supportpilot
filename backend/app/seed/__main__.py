"""python -m app.seed — create tables and load the fictional demo workspace."""

from __future__ import annotations

import asyncio

from app.db.base import Base
from app.db.session import get_session_factory, init_engine
from app.models import load_models
from app.seed.runner import seed_if_empty


async def main() -> None:
    load_models()
    engine = await init_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = get_session_factory()
    async with factory() as session:
        await seed_if_empty(session)
        await session.commit()


if __name__ == "__main__":
    asyncio.run(main())
