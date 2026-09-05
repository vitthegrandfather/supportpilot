"""Shared fixtures. Environment is set before the app is imported."""

from __future__ import annotations

import os

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["CELERY_TASK_ALWAYS_EAGER"] = "true"
os.environ["SECRET_KEY"] = "test-not-a-real-secret-use-only-in-ci"
os.environ["AUTO_CREATE_TABLES"] = "true"
os.environ["AUTO_SEED"] = "true"
os.environ["GENERATE_RATE_LIMIT"] = "1000"
os.environ["MUTATE_RATE_LIMIT"] = "1000"
os.environ["SUPPORTPILOT_ENV"] = "test"

from collections.abc import Generator  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import clear_settings_cache  # noqa: E402
from app.core.rate_limit import reset_limiters  # noqa: E402
from app.db.session import reset_engine_cache  # noqa: E402

clear_settings_cache()
reset_engine_cache()
reset_limiters()

from app.main import app  # noqa: E402


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    reset_limiters()
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def admin_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@heliodesk.example", "password": "DemoAdmin!2026"},
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def operator_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "operator@heliodesk.example", "password": "DemoOperator!2026"},
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
