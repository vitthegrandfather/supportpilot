"""Upload validation and secret redaction (ported from TypeScript safety.ts)."""

from __future__ import annotations

import re

ALLOWED_MIME = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
    "text/html",
    "text/csv",
}
ALLOWED_EXT = {".pdf", ".docx", ".txt", ".md", ".markdown", ".html", ".htm"}
MAX_UPLOAD_BYTES = 8 * 1024 * 1024


def sanitize_filename(name: str) -> str:
    base = name.replace("\\", "/").split("/")[-1] or "document"
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", base)[:120]
    return cleaned or "document"


def validate_upload(filename: str, mime: str, size: int) -> str | None:
    safe = sanitize_filename(filename)
    ext = f".{(safe.split('.')[-1].lower() if '.' in safe else '')}"
    if ext not in ALLOWED_EXT:
        return "Unsupported file type. Allowed: PDF, DOCX, TXT, Markdown, HTML."
    if mime and mime not in ALLOWED_MIME and mime != "application/octet-stream":
        return "MIME type does not match an allowed knowledge format."
    if size > MAX_UPLOAD_BYTES:
        return "File exceeds the 8 MB upload limit."
    return None


def redact_secrets(text: str) -> str:
    text = re.sub(r"sk-[A-Za-z0-9]{10,}", "sk-[redacted]", text)
    text = re.sub(r"(api[_-]?key|secret|token|password)\s*[:=]\s*\S+", r"\1=[redacted]", text, flags=re.I)
    text = re.sub(r"Bearer\s+[A-Za-z0-9\-._]+", "Bearer [redacted]", text)
    return text


def csv_safe(value: str) -> str:
    prefixed = f"'{value}" if re.match(r"^[=+\-@|]", value or "") else (value or "")
    if re.search(r'[",\n]', prefixed):
        escaped = prefixed.replace('"', '""')
        return f'"{escaped}"'
    return prefixed
