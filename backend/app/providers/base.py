"""Provider protocols. Hosted adapters must not be used in this demo."""

from __future__ import annotations

from typing import Any, Protocol


class EmbeddingProvider(Protocol):
    name: str

    def embed(self, text: str) -> list[float]: ...

    def embed_many(self, texts: list[str]) -> list[list[float]]: ...


class GenerationProvider(Protocol):
    name: str

    def generate(self, req: dict[str, Any]) -> dict[str, Any]: ...
