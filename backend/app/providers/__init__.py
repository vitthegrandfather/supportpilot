"""Embedding and generation providers. Preview never calls paid models."""

from app.core.config import get_settings
from app.core.errors import ApiError
from app.providers.base import EmbeddingProvider, GenerationProvider
from app.providers.openai_stub import OpenAIEmbeddingAdapter, OpenAIGenerationAdapter
from app.providers.sandbox import SandboxEmbeddingProvider, SandboxGenerationProvider


def get_embedding_provider(name: str | None = None) -> EmbeddingProvider:
    chosen = (name or get_settings().embedding_provider or "sandbox").lower()
    if chosen in {"sandbox", "sandbox-hash-v1"}:
        return SandboxEmbeddingProvider()
    if chosen in {"openai", "openai-adapter"}:
        return OpenAIEmbeddingAdapter(get_settings().openai_api_key or None)
    raise ApiError("invalid_provider", f"Unknown embedding provider '{chosen}'.", 400)


def get_generation_provider(name: str | None = None) -> GenerationProvider:
    chosen = (name or get_settings().generation_provider or "sandbox").lower()
    if chosen in {"sandbox", "sandbox-extractive-v1"}:
        return SandboxGenerationProvider()
    if chosen in {"openai", "openai-adapter"}:
        return OpenAIGenerationAdapter(get_settings().openai_api_key or None)
    raise ApiError("invalid_provider", f"Unknown generation provider '{chosen}'.", 400)
