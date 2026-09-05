"""Document extractors. Binary PDF/DOCX parsing is stubbed in this demo."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Protocol

from app.core.errors import ApiError
from app.rag.cleanup import cleanup_text


@dataclass
class ExtractionResult:
    text: str
    metadata: dict[str, object]


class TextExtractor(Protocol):
    def supports(self, filename: str, mime: str) -> bool: ...

    def extract(self, filename: str, content: str | bytes, mime: str) -> ExtractionResult: ...


def strip_html(raw: str) -> str:
    if not re.search(r"<[a-z][\s\S]*>", raw, re.I):
        return raw
    text = re.sub(r"<script[\s\S]*?</script>", "", raw, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", "", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("&nbsp;", " ").replace("&", "&")
    return text


def ext_type(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in {"md", "markdown"}:
        return "markdown"
    if ext in {"html", "htm"}:
        return "html"
    return "txt"


class PlainTextExtractor:
    def supports(self, filename: str, mime: str) -> bool:
        return mime.startswith("text/") or bool(re.search(r"\.(txt|md|markdown|html|htm|csv)$", filename, re.I))

    def extract(self, filename: str, content: str | bytes, mime: str = "") -> ExtractionResult:
        raw = content if isinstance(content, str) else content.decode("utf-8", errors="replace")
        text = cleanup_text(strip_html(raw))
        if not text:
            raise ApiError("extraction_failed", "The file did not contain extractable text.", 422)
        return ExtractionResult(text=text, metadata={"title": filename, "pages": 1, "source_type": ext_type(filename)})


class PdfExtractorStub:
    def supports(self, filename: str, mime: str) -> bool:
        return mime == "application/pdf" or filename.lower().endswith(".pdf")

    def extract(self, filename: str, content: str | bytes, mime: str = "") -> ExtractionResult:
        if isinstance(content, str) and not content.startswith("%PDF"):
            return ExtractionResult(
                text=cleanup_text(content),
                metadata={"title": filename, "pages": 1, "source_type": "pdf"},
            )
        raise ApiError(
            "extraction_unavailable",
            "Binary PDF parsing is provided by the production extractor. Paste text or use Markdown/TXT in this demo.",
            422,
        )


class DocxExtractorStub:
    def supports(self, filename: str, mime: str) -> bool:
        return "wordprocessingml" in mime or filename.lower().endswith(".docx")

    def extract(self, filename: str, content: str | bytes, mime: str = "") -> ExtractionResult:
        if isinstance(content, str):
            return ExtractionResult(
                text=cleanup_text(content),
                metadata={"title": filename, "pages": 1, "source_type": "docx"},
            )
        raise ApiError(
            "extraction_unavailable",
            "Binary DOCX parsing is provided by the production extractor. Paste text or use Markdown/TXT in this demo.",
            422,
        )


EXTRACTORS: list[TextExtractor] = [PlainTextExtractor(), PdfExtractorStub(), DocxExtractorStub()]


def extract_document(filename: str, content: str | bytes, mime: str) -> ExtractionResult:
    extractor = next((e for e in EXTRACTORS if e.supports(filename, mime)), None)
    if extractor is None:
        raise ApiError("unsupported_type", "No extractor is registered for this file type.", 415)
    return extractor.extract(filename, content, mime)
