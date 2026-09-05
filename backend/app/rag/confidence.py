"""Draft confidence scoring."""

from __future__ import annotations

from typing import Any


def round2(n: float) -> float:
    return round(n * 100) / 100


def calculate_confidence(
    *,
    hits: list[dict[str, Any]],
    cited_sentence_ratio: float,
    classification: dict[str, Any],
    insufficient_evidence: bool,
    security_sensitive: bool,
) -> float:
    if insufficient_evidence:
        top = hits[0]["score"] if hits else 0.0
        return min(0.34, 0.18 + float(top) * 0.2)
    top = hits[0]["score"] if hits else 0.0
    mean = sum(float(h["score"]) for h in hits) / len(hits) if hits else 0.0
    conf = 0.25 + float(top) * 0.45 + mean * 0.15 + cited_sentence_ratio * 0.2
    if security_sensitive:
        conf = min(conf, 0.58)
    flags = classification.get("safety_flags") or classification.get("safetyFlags") or []
    if "prompt_injection_in_customer_message" in flags:
        conf = min(conf, 0.4)
    return max(0.05, min(0.97, round2(conf)))
