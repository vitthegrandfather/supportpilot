"""Prompt-injection detection for customer messages and indexed passages."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, TypeVar

T = TypeVar("T")


@dataclass
class InjectionFinding:
    matched: bool
    patterns: list[str]
    excerpt: str | None


_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (
        "ignore_previous",
        re.compile(r"ignore (all )?(previous|prior|above|system) (instructions|rules|policies|prompts)", re.I),
    ),
    ("system_override", re.compile(r"system override|developer mode|unrestricted mode|jailbreak", re.I)),
    ("reveal_secrets", re.compile(r"reveal .{0,48}(api key|secret|token|password|credentials)", re.I)),
    ("disregard_safety", re.compile(r"disregard (your )?(safety|system|content) (rules|policy|prompt)", re.I)),
    ("print_token", re.compile(r"print the internal (api|auth)?\s?(token|key|secret)", re.I)),
    ("always_refund", re.compile(r"always (approve|issue) (full )?refunds without (verification|review)", re.I)),
]


def detect_prompt_injection(text: str) -> InjectionFinding:
    patterns: list[str] = []
    excerpt: str | None = None
    for name, regex in _PATTERNS:
        match = regex.search(text)
        if match:
            patterns.append(name)
            if excerpt is None:
                start = max(0, match.start() - 40)
                excerpt = re.sub(r"\s+", " ", text[start : match.end() + 40]).strip()
    return InjectionFinding(matched=len(patterns) > 0, patterns=patterns, excerpt=excerpt)


def _chunk_text(chunk: Any) -> str:
    if isinstance(chunk, dict):
        return str(chunk.get("text") or "")
    return str(getattr(chunk, "text", "") or "")


def strip_injected_chunks(chunks: list[T]) -> tuple[list[T], list[T]]:
    kept: list[T] = []
    flagged: list[T] = []
    for chunk in chunks:
        finding = detect_prompt_injection(_chunk_text(chunk))
        if finding.matched:
            reason = f"Prompt-injection patterns: {', '.join(finding.patterns)}"
            if isinstance(chunk, dict):
                flagged.append({**chunk, "flagged": True, "flag_reason": reason})  # type: ignore[arg-type]
            else:
                try:
                    chunk.flag_reason = reason  # type: ignore[attr-defined]
                    chunk.flagged = True  # type: ignore[attr-defined]
                except Exception:
                    pass
                flagged.append(chunk)
        else:
            kept.append(chunk)
    return kept, flagged
