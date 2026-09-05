"""JWT and role checks."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.security import create_access_token


def test_bad_token(client: TestClient) -> None:
    response = client.get("/api/v1/tickets", headers={"Authorization": "Bearer not-a-token"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] in {"invalid_token", "unauthorized"}


def test_expired_token(client: TestClient) -> None:
    token = create_access_token("acct_admin", {"workspace_id": "ws_heliodesk_demo"}, expires_minutes=-1)
    response = client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] in {"token_expired", "unauthorized"}


def test_operator_cannot_archive(client: TestClient, operator_headers: dict[str, str]) -> None:
    response = client.post("/api/v1/documents/doc_billing_refund/archive", headers=operator_headers)
    assert response.status_code == 403
