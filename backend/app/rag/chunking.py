"""Section-aware chunking: 500–800 tokens with ~100-token overlap."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.rag.cleanup import cleanup_text
from app.rag.tokenize import estimate_tokens

_HEADING_MD = re.compile(r"^(#{1,3})\s+(.+)$")
_HEADING_PLAIN = re.compile(r"^([A-Z][A-Za-z0-9 /&-]{3,80})$")


@dataclass
class ChunkDraft:
    ordinal: int
    section: str
    page: int | None
    text: str
    token_count: int


@dataclass
class ChunkOptions:
    min_tokens: int = 500
    max_tokens: int = 800
    overlap_tokens: int = 100


DEFAULTS = ChunkOptions()


def extract_sections(text: str) -> list[dict[str, str]]:
    lines = text.replace("\r\n", "\n").split("\n")
    sections: list[dict[str, str]] = []
    current = "Introduction"
    buf: list[str] = []

    def flush() -> None:
        nonlocal buf
        body = "\n".join(buf).strip()
        if body:
            sections.append({"section": current, "body": body})
        buf = []

    for line in lines:
        heading = _HEADING_MD.match(line) or _HEADING_PLAIN.match(line)
        if heading and len(line.strip()) < 90:
            flush()
            current = heading.group(2) if heading.lastindex and heading.lastindex >= 2 else heading.group(1)
            current = re.sub(r"^#+\s*", "", current).strip()
        else:
            buf.append(line)
    flush()
    return sections if sections else [{"section": "Body", "body": text.strip()}]


def overlap_tail(text: str, overlap_tokens: int) -> str:
    words = text.split()
    if len(words) <= overlap_tokens:
        return text
    return " ".join(words[-overlap_tokens:])


def chunk_document(text: str, options: ChunkOptions | None = None) -> list[ChunkDraft]:
    opts = options or DEFAULTS
    cleaned = cleanup_text(text)
    sections = extract_sections(cleaned)
    chunks: list[ChunkDraft] = []
    ordinal = 0

    def push(raw: str, section: str) -> None:
        nonlocal ordinal
        trimmed = raw.strip()
        if not trimmed:
            return
        ordinal += 1
        chunks.append(
            ChunkDraft(
                ordinal=ordinal,
                section=section,
                page=max(1, (ordinal + 1) // 2),
                text=trimmed,
                token_count=estimate_tokens(trimmed),
            )
        )

    for section in sections:
        paragraphs = [p.strip() for p in re.split(r"\n{2,}", section["body"]) if p.strip()]
        buffer = ""
        for para in paragraphs:
            nxt = f"{buffer}\n\n{para}" if buffer else para
            if estimate_tokens(nxt) > opts.max_tokens and buffer:
                push(buffer, section["section"])
                overlap = overlap_tail(buffer, opts.overlap_tokens)
                buffer = f"{overlap}\n\n{para}" if overlap else para
            else:
                buffer = nxt
        if buffer:
            if estimate_tokens(buffer) < opts.min_tokens and chunks:
                last = chunks[-1]
                if last.section == section["section"] and estimate_tokens(last.text + buffer) <= opts.max_tokens + 80:
                    last.text = f"{last.text}\n\n{buffer}".strip()
                    last.token_count = estimate_tokens(last.text)
                else:
                    push(buffer, section["section"])
            else:
                push(buffer, section["section"])

    if chunks:
        return chunks
    return [
        ChunkDraft(
            ordinal=1,
            section="Body",
            page=1,
            text=cleaned,
            token_count=estimate_tokens(cleaned),
        )
    ]
