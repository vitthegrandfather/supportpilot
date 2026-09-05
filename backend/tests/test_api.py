"""API tests: auth, isolation, drafts, envelopes, rate limits, ingest."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.core.errors import ApiError
from app.core.rate_limit import SlidingWindowLimiter, enforce
from app.db.session import get_session_factory
from app.models import Customer, Ticket, Workspace


def test_login_success_and_failure(client: TestClient) -> None:
    ok = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@heliodesk.example", "password": "DemoAdmin!2026"},
    )
    assert ok.status_code == 200
    assert ok.json()["role"] == "admin"
    bad = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@heliodesk.example", "password": "wrong"},
    )
    assert bad.status_code == 401
    body = bad.json()
    assert body["error"]["code"] == "unauthorized"
    assert "request_id" in body["error"]


def test_missing_bearer_401(client: TestClient) -> None:
    response = client.get("/api/v1/tickets")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


def test_operator_cannot_reset(client: TestClient, operator_headers: dict[str, str]) -> None:
    response = client.post("/api/v1/demo/reset", headers=operator_headers)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


def test_admin_reset(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.post("/api/v1/demo/reset", headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_workspace_isolation(client: TestClient, admin_headers: dict[str, str]) -> None:
    import asyncio

    async def insert_foreign() -> None:
        factory = get_session_factory()
        async with factory() as session:
            now = datetime.now(timezone.utc)
            session.add(
                Workspace(
                    id="ws_other",
                    name="Other",
                    slug="other",
                    product_name="Other",
                    timezone="UTC",
                    created_at=now,
                )
            )
            await session.flush()
            session.add(
                Customer(
                    id="cus_other",
                    workspace_id="ws_other",
                    name="Hidden Person",
                    email="hidden@other.example",
                    company="Other Co",
                    plan="Starter",
                    region="US",
                    created_at=now,
                    account_id="acc_x",
                    health="good",
                )
            )
            await session.flush()
            session.add(
                Ticket(
                    id="tkt_hidden",
                    workspace_id="ws_other",
                    public_id="TKT-9999-00001",
                    customer_id="cus_other",
                    subject="Should not appear",
                    category="other",
                    priority="low",
                    status="new",
                    assignee_id=None,
                    channel="email",
                    tags="[]",
                    created_at=now,
                    updated_at=now,
                    sla_deadline_at=now,
                    unread=True,
                )
            )
            await session.commit()

    asyncio.run(insert_foreign())
    listed = client.get("/api/v1/tickets", headers=admin_headers)
    assert listed.status_code == 200
    ids = [item["id"] for item in listed.json()["items"]]
    assert "tkt_hidden" not in ids
    hidden = client.get("/api/v1/tickets/tkt_hidden", headers=admin_headers)
    assert hidden.status_code == 404


def test_generate_approve_send_billing(client: TestClient, admin_headers: dict[str, str]) -> None:
    gen = client.post("/api/v1/tickets/tkt_dup_charge/generate", headers=admin_headers)
    assert gen.status_code == 200, gen.text
    draft = gen.json()["draft"]
    assert draft["confidence"] >= 0.55
    assert draft["insufficient_evidence"] is False
    assert "[" in draft["body"]
    draft_id = draft["id"]

    premature = client.post(
        f"/api/v1/tickets/tkt_dup_charge/drafts/{draft_id}/send",
        headers=admin_headers,
    )
    assert premature.status_code == 409
    assert premature.json()["error"]["code"] == "not_approved"

    edited = client.post(
        f"/api/v1/tickets/tkt_dup_charge/drafts/{draft_id}/edit",
        headers=admin_headers,
        json={"body": draft["body"] + "\n\nEdited by Elena."},
    )
    assert edited.status_code == 200

    approved = client.post(
        f"/api/v1/tickets/tkt_dup_charge/drafts/{draft_id}/approve",
        headers=admin_headers,
    )
    assert approved.status_code == 200

    sent = client.post(
        f"/api/v1/tickets/tkt_dup_charge/drafts/{draft_id}/send",
        headers=admin_headers,
    )
    assert sent.status_code == 200, sent.text
    messages = sent.json()["messages"]
    assert any(m.get("simulated") for m in messages)
    actions = [a["action"] for a in sent.json()["audit"]]
    assert "draft.simulated_send" in actions


def test_insufficient_evidence_blocks_approve(client: TestClient, admin_headers: dict[str, str]) -> None:
    gen = client.post("/api/v1/tickets/tkt_missing_policy/generate", headers=admin_headers)
    assert gen.status_code == 200, gen.text
    draft = gen.json()["draft"]
    assert draft["escalate"] is True
    assert draft["insufficient_evidence"] is True or draft["knowledge_gaps"]
    approve = client.post(
        f"/api/v1/tickets/tkt_missing_policy/drafts/{draft['id']}/approve",
        headers=admin_headers,
    )
    assert approve.status_code == 409
    assert approve.json()["error"]["code"] == "insufficient_evidence"


def test_error_envelope_not_found(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.get("/api/v1/tickets/does-not-exist", headers=admin_headers)
    assert response.status_code == 404
    error = response.json()["error"]
    assert error["code"] == "not_found"
    assert error["message"]
    assert error["request_id"].startswith("req_")


def test_rate_limit_envelope() -> None:
    limiter = SlidingWindowLimiter(1, 60_000)
    enforce("k", limiter)
    try:
        enforce("k", limiter)
        raise AssertionError("expected rate limit")
    except ApiError as exc:
        assert exc.code == "rate_limited"
        assert exc.status == 429


def test_document_create_and_reindex(client: TestClient, admin_headers: dict[str, str]) -> None:
    created = client.post(
        "/api/v1/documents",
        headers=admin_headers,
        json={
            "title": "Sandbox Test Policy",
            "body": "Duplicate annual charges are reversed within five business days after invoice verification.",
            "category": "policy",
        },
    )
    assert created.status_code == 200, created.text
    doc_id = created.json()["document"]["id"]
    assert created.json()["document"]["status"] == "ready"
    reindexed = client.post(f"/api/v1/documents/{doc_id}/reindex", headers=admin_headers)
    assert reindexed.status_code == 200
    assert reindexed.json()["document"]["chunk_count"] >= 1


def test_health_unauthenticated(client: TestClient) -> None:
    assert client.get("/api/v1/health").json()["status"] == "ok"
    assert client.get("/health").json()["service"] == "supportpilot"
