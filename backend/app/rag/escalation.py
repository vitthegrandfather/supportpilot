"""Escalation policy and knowledge-gap probes."""

from __future__ import annotations

import re
from typing import Any

CONFIDENCE_ESCALATE_BELOW = 0.55
CONFIDENCE_AUTO_APPROVE_MIN = 0.86


def decide_escalation(
    *,
    confidence: float,
    classification: dict[str, Any],
    insufficient_evidence: bool,
    knowledge_gaps: list[str],
) -> dict[str, Any]:
    flags = classification.get("safety_flags") or classification.get("safetyFlags") or []
    if "security_sensitive" in flags or "account_ownership_change" in flags:
        return {
            "escalate": True,
            "reason": "Security-sensitive request requires Trust & Safety review before any account change.",
            "queue": "trust_safety",
        }
    if "privacy_request" in flags and classification.get("category") == "privacy":
        if insufficient_evidence:
            return {
                "escalate": True,
                "reason": "Privacy request with incomplete policy evidence. Route to Privacy Operations.",
                "queue": "privacy_ops",
            }
    if insufficient_evidence:
        return {
            "escalate": True,
            "reason": "Knowledge base does not contain enough evidence to draft a reliable answer.",
            "queue": "tier2_policy",
        }
    if confidence < CONFIDENCE_ESCALATE_BELOW:
        return {
            "escalate": True,
            "reason": (f"Confidence {confidence:.2f} is below the {CONFIDENCE_ESCALATE_BELOW} review threshold."),
            "queue": "human_review",
        }
    if knowledge_gaps:
        return {
            "escalate": True,
            "reason": f"Open knowledge gaps: {'; '.join(knowledge_gaps)}",
            "queue": "knowledge_ops",
        }
    return {"escalate": False, "reason": None, "queue": "inbox"}


def identify_gaps(query: str, hits: list[dict[str, Any]]) -> list[str]:
    gaps: list[str] = []
    if not hits:
        gaps.append("No indexed passages matched this question.")
        return gaps
    if float(hits[0].get("score") or 0) < 0.48:
        gaps.append("Top retrieved passages are only weakly related to the customer question.")
    q = query.lower()
    titles: list[str] = []
    for hit in hits:
        chunk = hit["chunk"]
        section = chunk["section"] if isinstance(chunk, dict) else chunk.section
        titles.append(f"{hit.get('document_title', '')} {section}")
    blob = " ".join(titles).lower()
    probes: list[tuple[re.Pattern[str], str]] = [
        (re.compile(r"government|fedramp|public sector"), "No public-sector or government tenant policy is indexed."),
        (
            re.compile(r"white-glove|white glove|concierge onboarding"),
            "No white-glove onboarding policy is indexed.",
        ),
        (re.compile(r"hipaa"), "No HIPAA-specific processing policy is indexed."),
        (re.compile(r"soc 2|soc2"), "No SOC 2 evidence package procedure is indexed."),
    ]
    for regex, gap in probes:
        if regex.search(q) and not regex.search(blob):
            gaps.append(gap)
    return gaps
