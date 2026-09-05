"""Ticket classification (category, sentiment, urgency, safety flags)."""

from __future__ import annotations

from typing import Any

from app.rag.injection import detect_prompt_injection
from app.rag.tokenize import tokenize

CATEGORY_TERMS: dict[str, list[str]] = {
    "billing": [
        "charge",
        "charged",
        "invoice",
        "refund",
        "billing",
        "payment",
        "subscription",
        "annual",
        "plan",
        "duplicate",
        "credit card",
    ],
    "account_access": ["password", "login", "sign in", "locked", "2fa", "mfa", "access", "reset"],
    "integrations": ["webhook", "api", "zapier", "slack", "integration", "oauth", "sync"],
    "privacy": ["gdpr", "delete my data", "erasure", "export", "dsar", "privacy", "personal data"],
    "security": ["owner", "ownership", "takeover", "compromised", "phishing", "hacked", "transfer account"],
    "outage": ["outage", "production down", "service is down", "unavailable", "status page", "sev1"],
    "product": ["feature", "roadmap", "would be nice", "request", "enhancement"],
    "cancellation": ["cancel", "cancellation", "close my account", "unsubscribe"],
    "other": [],
}


def classify_ticket(subject: str, body: str) -> dict[str, Any]:
    text = f"{subject}\n{body}".lower()
    tokens = set(tokenize(text, True))
    scores = []
    for cat, terms in CATEGORY_TERMS.items():
        score = 0
        for term in terms:
            if term in text:
                score += len(term.split(" ")) + 1
        scores.append((cat, score))
    scores.sort(key=lambda item: item[1], reverse=True)
    category = scores[0][0] if scores[0][1] > 0 else "other"

    sentiment = "neutral"
    if re_search(r"(angry|unacceptable|furious|worst|ridiculous|frustrated|second time)", text):
        sentiment = "frustrated"
    elif re_search(r"(please help|issue|problem|cannot|can't|failed|wrong)", text):
        sentiment = "negative"
    elif re_search(r"(thanks|thank you|appreciate)", text):
        sentiment = "positive"

    urgency = "medium"
    if re_search(r"(urgent|immediately|right now|production down|cannot access|locked out|gdpr|security|hacked)", text):
        urgency = "high"
    elif re_search(r"(whenever|no rush|curious|wondering)", text):
        urgency = "low"

    suggested_priority = "normal"
    if category in {"outage", "security"} or urgency == "high":
        suggested_priority = "urgent"
    elif category in {"privacy", "billing"} or sentiment == "frustrated":
        suggested_priority = "high"
    elif category == "product":
        suggested_priority = "low"

    safety_flags: list[str] = []
    inj = detect_prompt_injection(f"{subject}\n{body}")
    if inj.matched:
        safety_flags.append("prompt_injection_in_customer_message")
    if category == "security":
        safety_flags.append("security_sensitive")
    if category == "privacy":
        safety_flags.append("privacy_request")
    if re_search(r"(ssn|social security|passport|password is|credit card number)", text):
        safety_flags.append("possible_credential_in_message")
    if "owner" in tokens or "ownership" in text:
        safety_flags.append("account_ownership_change")

    reasoning = (
        f"Matched {category.replace('_', ' ')} language with {sentiment} sentiment and {urgency} urgency. "
        "Priority suggestion follows policy: security, outage, and identity changes default to urgent review."
    )
    return {
        "category": category,
        "sentiment": sentiment,
        "urgency": urgency,
        "suggested_priority": suggested_priority,
        "reasoning": reasoning,
        "safety_flags": safety_flags,
    }


def re_search(pattern: str, text: str) -> bool:
    import re

    return re.search(pattern, text) is not None
