"""Citation mapping and verification."""

from __future__ import annotations

import re
from typing import Any

from app.core.ids import rid

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")
_GREETING = re.compile(r"^(hi |hello |thanks |thank you|kind regards|we are sorry)", re.I)


def excerpt(text: str, max_len: int = 420) -> str:
    clean = re.sub(r"\s+", " ", text).strip()
    if len(clean) <= max_len:
        return clean
    trimmed = re.sub(r"\s+\S*$", "", clean[:max_len])
    return f"{trimmed}…"


def sentences_of(text: str) -> list[str]:
    raw = [s.strip() for s in _SENTENCE_SPLIT.split(text) if s.strip()]
    merged: list[str] = []
    for part in raw:
        if re.match(r"^\[\d+\]", part) and merged:
            merged[-1] += f" {part}"
        else:
            merged.append(part)
    return [s for s in merged if len(s) > 20]


def map_citations(hits: list[dict[str, Any]], limit: int = 4) -> list[dict[str, Any]]:
    citations: list[dict[str, Any]] = []
    for i, hit in enumerate(hits[:limit]):
        chunk = hit["chunk"]
        text = chunk["text"] if isinstance(chunk, dict) else chunk.text
        citations.append(
            {
                "id": rid("cit"),
                "chunk_id": chunk["id"] if isinstance(chunk, dict) else chunk.id,
                "document_id": chunk["document_id"] if isinstance(chunk, dict) else chunk.document_id,
                "document_title": hit.get("document_title") or "",
                "section": chunk["section"] if isinstance(chunk, dict) else chunk.section,
                "excerpt": excerpt(text, 420),
                "score": round(float(hit["score"]) * 1000) / 1000,
                "marker": i + 1,
                "flagged": bool(chunk["flagged"] if isinstance(chunk, dict) else chunk.flagged),
            }
        )
    return citations


def verify_citations(body: str, citations: list[dict[str, Any]]) -> dict[str, Any]:
    sentences = [s for s in sentences_of(body) if not _GREETING.search(s)]
    if not sentences:
        return {"uncited": [], "ratio": 1.0}
    uncited: list[str] = []
    cited = 0
    for sentence in sentences:
        if re.search(r"\[(\d+)\]", sentence):
            cited += 1
            continue
        lowered = sentence.lower()
        supported = any(_overlap(lowered, c["excerpt"].lower()) >= 0.28 for c in citations)
        if supported:
            cited += 1
        else:
            uncited.append(sentence)
    return {"uncited": uncited, "ratio": cited / len(sentences)}


def _overlap(a: str, b: str) -> float:
    at = {x for x in re.split(r"[^a-z0-9]+", a) if len(x) > 3}
    bt = [x for x in re.split(r"[^a-z0-9]+", b) if len(x) > 3]
    if not at:
        return 0.0
    n = sum(1 for t in bt if t in at)
    return n / len(at)
