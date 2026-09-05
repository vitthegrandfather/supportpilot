"""Evidence ranking and sufficiency checks."""

from __future__ import annotations

from typing import Any

from app.rag.tokenize import tokenize


def rank_evidence(
    hits: list[dict[str, Any]],
    title_by_doc: dict[str, str],
    query: str = "",
) -> list[dict[str, Any]]:
    q = set(tokenize(query, True))
    ranked = []
    for hit in hits:
        item = dict(hit)
        chunk = item["chunk"]
        doc_id = chunk["document_id"] if isinstance(chunk, dict) else chunk.document_id
        item["document_title"] = title_by_doc.get(doc_id, item.get("document_title", ""))
        if q:
            title_tok = tokenize(item["document_title"], True)
            hit_count = sum(1 for t in title_tok if t in q)
            item["score"] = float(item["score"]) + min(0.12, hit_count * 0.04)
        ranked.append(item)

    def sort_key(item: dict[str, Any]) -> tuple[float, int]:
        chunk = item["chunk"]
        ordinal = chunk["ordinal"] if isinstance(chunk, dict) else chunk.ordinal
        return (-float(item["score"]), ordinal)

    ranked.sort(key=sort_key)
    seen: set[str] = set()
    diversified: list[dict[str, Any]] = []
    for hit in ranked:
        chunk = hit["chunk"]
        doc_id = chunk["document_id"] if isinstance(chunk, dict) else chunk.document_id
        section = chunk["section"] if isinstance(chunk, dict) else chunk.section
        key = f"{doc_id}:{section}"
        if key in seen and len(diversified) >= 2:
            continue
        seen.add(key)
        diversified.append(hit)
    return diversified


def evidence_sufficient(hits: list[dict[str, Any]], min_score: float = 0.48, min_hits: int = 1) -> bool:
    strong = [h for h in hits if float(h["score"]) >= min_score]
    return len(strong) >= min_hits
