"""Human-readable and opaque identifiers."""

from __future__ import annotations

import secrets
import time


def next_public_id(prefix: str, n: int, year: int = 2026) -> str:
    return f"{prefix}-{year}-{str(n).zfill(5)}"


def rid(prefix: str) -> str:
    rand = secrets.token_hex(4)
    stamp = format(int(time.time() * 1000), "x")[-4:]
    return f"{prefix}_{rand}{stamp}"


def request_id() -> str:
    return f"req_{secrets.token_hex(5)}"
