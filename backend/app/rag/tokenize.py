"""Tokenization and FNV-1a hashing, ported from the TypeScript sandbox embedder."""

from __future__ import annotations

import re

STOP = {
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "of",
    "in",
    "on",
    "for",
    "is",
    "are",
    "was",
    "be",
    "as",
    "at",
    "by",
    "it",
    "this",
    "that",
    "with",
    "from",
    "we",
    "you",
    "your",
    "our",
    "if",
    "not",
    "can",
    "will",
    "please",
    "have",
    "has",
}

_NON_ALNUM = re.compile(r"[^a-z0-9\s-]")


def tokenize(text: str, keep_stop: bool = False) -> list[str]:
    cleaned = _NON_ALNUM.sub(" ", text.lower())
    tokens: list[str] = []
    for raw in cleaned.split():
        token = raw.strip()
        if len(token) > 1 and (keep_stop or token not in STOP):
            tokens.append(token)
    return tokens


def estimate_tokens(text: str) -> int:
    words = [w for w in text.strip().split() if w]
    return max(1, round(len(words) * 1.3))


def hash32(s: str) -> int:
    """Unsigned 32-bit FNV-1a, matching JS Math.imul / >>> 0."""
    h = 2166136261
    for ch in s:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h
