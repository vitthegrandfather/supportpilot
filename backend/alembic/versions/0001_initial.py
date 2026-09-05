"""Initial SupportPilot schema.

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-05
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    from app.db.base import Base
    from app.models import load_models

    load_models()
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    from app.db.base import Base
    from app.models import load_models

    load_models()
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
