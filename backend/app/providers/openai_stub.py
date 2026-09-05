"""Stub OpenAI adapters. They raise if used — this demo never calls paid models."""

from __future__ import annotations

from typing import Any


class OpenAIEmbeddingAdapter:
    name = "openai-adapter"

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key

    def embed(self, text: str) -> list[float]:
        raise RuntimeError("Hosted embedding providers are disabled in this demo.")

    def embed_many(self, texts: list[str]) -> list[list[float]]:
        raise RuntimeError("Hosted embedding providers are disabled in this demo.")


class OpenAIGenerationAdapter:
    name = "openai-adapter"

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key

    def generate(self, req: dict[str, Any]) -> dict[str, Any]:
        raise RuntimeError("Hosted generation providers are disabled in this demo.")
