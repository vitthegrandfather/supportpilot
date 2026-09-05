"""Extractive reply templates used by the sandbox generation provider."""

from __future__ import annotations

import re
from typing import Any

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")
_INTERNAL = re.compile(
    r"^(use this|open the|search the|do not |operators? must|explain the|attach |"
    r"tell the customer|ask for |collect every|advise the)",
    re.I,
)
_INTERNAL_BODY = re.compile(r"do not raise the limit|from a support ticket", re.I)


def cite(citations: list[dict[str, Any]], title_part: str) -> int:
    found = next(
        (c for c in citations if title_part.lower() in c["document_title"].lower()),
        None,
    )
    if found:
        return int(found["marker"])
    return int(citations[0]["marker"]) if citations else 1


def classify_opener(category: str) -> str:
    if category == "billing":
        return (
            "I reviewed your billing ticket against the current Billing and Refund Policy "
            "and the Payment Investigation Procedure. Here is what those sources allow us to do."
        )
    if category == "cancellation":
        return "I checked the Subscription Cancellation Policy for the options that apply to your plan."
    if category == "privacy":
        return "I looked up the Data Privacy and Deletion Procedure so this reply stays within the published process."
    if category == "integrations":
        return "I compared the symptoms you described with the Integration Troubleshooting Guide."
    if category == "outage":
        return "I checked this against the Service-Level Agreement and current incident handling rules."
    return "I retrieved the internal policies that apply to this request. The statements below are limited to those sources."


def sentence_score(sentence: str, query: str) -> int:
    st = {w for w in re.split(r"[^a-z0-9]+", sentence.lower()) if len(w) > 3}
    qt = [w for w in re.split(r"[^a-z0-9]+", query.lower()) if len(w) > 3]
    return sum(1 for t in qt if t in st)


def pick_facts(
    citations: list[dict[str, Any]],
    query: str,
    n: int,
) -> list[dict[str, Any]]:
    q = query.lower()
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for cit in citations:
        sentences = _SENTENCE_SPLIT.split(cit["excerpt"])
        ranked = []
        for raw in sentences:
            s = raw.strip()
            if len(s) > 40 and not _INTERNAL.match(s) and not _INTERNAL_BODY.search(s):
                ranked.append((s, sentence_score(s, q)))
        ranked.sort(key=lambda item: item[1], reverse=True)
        for item, _score in ranked[:2]:
            key = item[:80]
            if key in seen:
                continue
            seen.add(key)
            text = re.sub(r"\[(\d+)\]", "", item).strip()
            out.append({"text": text, "marker": cit["marker"]})
            if len(out) >= n:
                return out
    if not out and citations:
        first = _SENTENCE_SPLIT.split(citations[0]["excerpt"])[0] or citations[0]["excerpt"]
        out.append({"text": first, "marker": 1})
    return out


def security_reply(first_name: str, citations: list[dict[str, Any]]) -> str:
    marker = cite(citations, "Account Verification")
    return "\n".join(
        [
            f"Hi {first_name},",
            "",
            (
                "Thank you for writing in. Requests that change account ownership or recovery controls "
                "are treated as security-sensitive and cannot be completed from this conversation alone. "
                f"[{marker}]"
            ),
            "",
            (
                "We will not provide steps that transfer ownership, disable two-factor authentication, "
                "or reassign billing authority until the registered owner completes verification: a matching "
                "government ID, confirmation from the account recovery email, and the last four digits of the "
                f"payment method on file. [{marker}]"
            ),
            "",
            (
                "A specialist will review this ticket before any change is made. If you are the registered owner, "
                "reply with the verification items listed in the Account Verification Policy — do not send full "
                "card numbers or passwords."
            ),
            "",
            "Kind regards,",
            "HelioDesk Support",
        ]
    )


def insufficient_reply(first_name: str, knowledge_gaps: list[str]) -> str:
    gaps = knowledge_gaps or ["The indexed policies do not cover this request."]
    gap_lines = "\n".join(f"• {g}" for g in gaps)
    return "\n".join(
        [
            f"Hi {first_name},",
            "",
            (
                "Thank you for the question. I do not have enough approved policy evidence in the knowledge base "
                "to answer this reliably, so I am not going to guess at a commitment or invent a process."
            ),
            "",
            "What is missing from the indexed sources:",
            gap_lines,
            "",
            (
                "I am escalating this to a specialist who can confirm the official position. You will receive a "
                "follow-up from a human operator; no change has been made to your account."
            ),
            "",
            "Kind regards,",
            "HelioDesk Support",
        ]
    )


def grounded_reply(
    first_name: str,
    category: str,
    citations: list[dict[str, Any]],
    customer_message: str,
) -> str:
    facts = pick_facts(citations, customer_message, 5)
    fact_lines = [f"{f['text']} [{f['marker']}]" for f in facts]
    return "\n".join(
        [
            f"Hi {first_name},",
            "",
            classify_opener(category),
            "",
            *fact_lines,
            "",
            (
                "If anything here does not match what you see on the account, reply with the invoice or event IDs "
                "involved and an operator will continue the investigation. This draft is not a live change to "
                "billing or access."
            ),
            "",
            "Kind regards,",
            "HelioDesk Support",
        ]
    )
