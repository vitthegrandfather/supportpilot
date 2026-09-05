"""Hybrid lexical + cosine retrieval over sandbox hash embeddings."""

from __future__ import annotations

import json
import math
from typing import Any

from app.providers.base import EmbeddingProvider
from app.rag.tokenize import tokenize


def cosine(a: list[float], b: list[float]) -> float:
    n = min(len(a), len(b))
    dot = 0.0
    for i in range(n):
        dot += a[i] * b[i]
    return max(-1.0, min(1.0, dot))


def lexical_score(query: str, text: str) -> float:
    q = set(tokenize(query, True))
    d = tokenize(text, True)
    if not q or not d:
        return 0.0
    df: dict[str, int] = {}
    for token in d:
        df[token] = df.get(token, 0) + 1
    overlap = 0.0
    for token in q:
        count = df.get(token, 0)
        if count > 0:
            overlap += 1 + math.log(1 + count)
    return overlap / math.sqrt(len(q))


def as_vector(embedding: Any) -> list[float]:
    if isinstance(embedding, str):
        parsed = json.loads(embedding)
        return [float(x) for x in parsed]
    if isinstance(embedding, list):
        return [float(x) for x in embedding]
    return []


def retrieve(
    query: str,
    chunks: list[Any],
    provider: EmbeddingProvider,
    k: int = 6,
) -> list[dict[str, Any]]:
    q_vec = provider.embed(query)
    scored: list[dict[str, Any]] = []
    for chunk in chunks:
        flagged = chunk["flagged"] if isinstance(chunk, dict) else chunk.flagged
        if flagged:
            continue
        embedding = chunk["embedding"] if isinstance(chunk, dict) else chunk.embedding
        text = chunk["text"] if isinstance(chunk, dict) else chunk.text
        cos = cosine(q_vec, as_vector(embedding))
        lex = lexical_score(query, text)
        score = 0.62 * ((cos + 1) / 2) + 0.38 * min(1.0, lex / 4)
        scored.append(
            {
                "chunk": chunk,
                "document_title": "",
                "score": score,
                "lexical": lex,
                "cosine": cos,
            }
        )
    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[:k]
