"""Deterministic sandbox embedding + extractive generation providers."""

from __future__ import annotations

from typing import Any

from app.rag.prompts import grounded_reply, insufficient_reply, security_reply
from app.rag.tokenize import hash32, tokenize

EMBED_DIM = 256


def l2_normalize(vec: list[float]) -> list[float]:
    total = sum(v * v for v in vec)
    n = total**0.5 or 1.0
    return [v / n for v in vec]


class SandboxEmbeddingProvider:
    name = "sandbox-hash-v1"

    def embed(self, text: str) -> list[float]:
        vec = [0.0] * EMBED_DIM
        tokens = tokenize(text)
        if not tokens:
            return vec
        for token in tokens:
            h = hash32(token)
            vec[h % EMBED_DIM] += 1
            vec[(h >> 8) % EMBED_DIM] += 0.45
            vec[(h >> 16) % EMBED_DIM] += 0.2
            if len(token) > 4:
                bi = hash32(token[:4])
                vec[bi % EMBED_DIM] += 0.15
        return l2_normalize(vec)

    def embed_many(self, texts: list[str]) -> list[list[float]]:
        return [self.embed(t) for t in texts]


class SandboxGenerationProvider:
    name = "sandbox-extractive-v1"

    def generate(self, req: dict[str, Any]) -> dict[str, Any]:
        notes: list[str] = []
        customer_name = req.get("customer_name") or req.get("customerName") or "there"
        first = customer_name.split(" ")[0] or "there"
        flags = req.get("safety_flags") or req.get("safetyFlags") or []
        citations = req.get("citations") or []
        classification = req.get("classification") or {}
        if "security_sensitive" in flags or "account_ownership_change" in flags:
            notes.append("security_review_required")
            return {"notes": notes, "body": security_reply(first, citations)}
        insufficient = bool(req.get("insufficient_evidence") or req.get("insufficientEvidence"))
        if insufficient or not citations:
            notes.append("insufficient_evidence")
            gaps = req.get("knowledge_gaps") or req.get("knowledgeGaps") or []
            return {"notes": notes, "body": insufficient_reply(first, gaps)}
        category = classification.get("category", "other")
        message = req.get("customer_message") or req.get("customerMessage") or ""
        return {
            "notes": notes,
            "body": grounded_reply(first, category, citations, message),
        }
