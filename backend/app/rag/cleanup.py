"""Text cleanup used before chunking and extraction."""

from __future__ import annotations

import re

_COMMENT = re.compile(r"<!--[\s\S]*?-->")


def cleanup_text(text: str) -> str:
    cleaned = text.replace("\u0000", "").replace("\r\n", "\n")
    cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = _COMMENT.sub("", cleaned)
    return cleaned.strip()
