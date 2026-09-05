"""In-memory sliding-window rate limiter (ported from the TypeScript preview)."""

from __future__ import annotations

import time

from app.core.config import get_settings
from app.core.errors import ApiError


class SlidingWindowLimiter:
    def __init__(self, max_hits: int, window_ms: int) -> None:
        self.max_hits = max_hits
        self.window_ms = window_ms
        self._hits: dict[str, list[float]] = {}

    def allow(self, key: str, now: float | None = None) -> bool:
        current = time.time() * 1000 if now is None else now
        cut = current - self.window_ms
        prev = [t for t in self._hits.get(key, []) if t > cut]
        if len(prev) >= self.max_hits:
            self._hits[key] = prev
            return False
        prev.append(current)
        self._hits[key] = prev
        return True

    def reset(self) -> None:
        self._hits.clear()


_generate: SlidingWindowLimiter | None = None
_mutate: SlidingWindowLimiter | None = None


def generate_limiter() -> SlidingWindowLimiter:
    global _generate
    if _generate is None:
        settings = get_settings()
        _generate = SlidingWindowLimiter(settings.generate_rate_limit, settings.rate_limit_window_ms)
    return _generate


def mutate_limiter() -> SlidingWindowLimiter:
    global _mutate
    if _mutate is None:
        settings = get_settings()
        _mutate = SlidingWindowLimiter(settings.mutate_rate_limit, settings.rate_limit_window_ms)
    return _mutate


def reset_limiters() -> None:
    generate_limiter().reset()
    mutate_limiter().reset()


def enforce(key: str, limiter: SlidingWindowLimiter | None = None) -> None:
    chosen = limiter or mutate_limiter()
    if not chosen.allow(key):
        raise ApiError("rate_limited", "Too many requests. Wait a moment and retry.", 429)
