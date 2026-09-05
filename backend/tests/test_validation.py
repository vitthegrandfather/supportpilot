"""Upload, note, and CSV safety validation."""

from fastapi.testclient import TestClient

from app.core.safety import csv_safe, sanitize_filename, validate_upload


def test_empty_note_422(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.post(
        "/api/v1/tickets/tkt_dup_charge/notes",
        headers=admin_headers,
        json={"body": ""},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_invalid_upload_extension() -> None:
    err = validate_upload("malware.exe", "application/octet-stream", 100)
    assert err is not None
    assert "Unsupported" in err


def test_filename_sanitization() -> None:
    assert ".." not in sanitize_filename("../../etc/passwd")
    assert "/" not in sanitize_filename("a/b/c.md")


def test_csv_formula_injection() -> None:
    assert csv_safe("=CMD()").startswith("'")
    assert csv_safe("+1+1").startswith("'")
    assert csv_safe("hello") == "hello"
