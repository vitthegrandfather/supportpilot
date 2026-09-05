"""Environment-driven settings. Fictional defaults only — never a real secret."""

from __future__ import annotations

from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables.

    Production uses PostgreSQL + pgvector. Tests and local preview default to
    SQLite with embeddings stored as JSON text so pgvector is not required.
    """

    model_config = SettingsConfigDict(
        env_file=None,
        extra="ignore",
        case_sensitive=False,
    )

    env: str = Field(default="development", validation_alias=AliasChoices("SUPPORTPILOT_ENV", "ENV"))
    database_url: str = Field(
        default="sqlite+aiosqlite:///./supportpilot.db",
        validation_alias=AliasChoices("DATABASE_URL", "SUPPORTPILOT_DATABASE_URL"),
    )
    redis_url: str = Field(
        default="redis://localhost:6379/0",
        validation_alias=AliasChoices("REDIS_URL", "SUPPORTPILOT_REDIS_URL"),
    )
    celery_broker_url: str = Field(
        default="",
        validation_alias=AliasChoices("CELERY_BROKER_URL", "SUPPORTPILOT_CELERY_BROKER_URL"),
    )
    celery_result_backend: str = Field(
        default="",
        validation_alias=AliasChoices("CELERY_RESULT_BACKEND", "SUPPORTPILOT_CELERY_RESULT_BACKEND"),
    )
    celery_task_always_eager: bool = Field(
        default=False,
        validation_alias=AliasChoices("CELERY_TASK_ALWAYS_EAGER", "SUPPORTPILOT_CELERY_TASK_ALWAYS_EAGER"),
    )
    secret_key: str = Field(
        default="dev-only-not-a-real-secret",
        validation_alias=AliasChoices("SECRET_KEY", "SUPPORTPILOT_SECRET_KEY"),
    )
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(
        default=480,
        validation_alias=AliasChoices("ACCESS_TOKEN_EXPIRE_MINUTES", "SUPPORTPILOT_ACCESS_TOKEN_EXPIRE_MINUTES"),
    )
    embedding_provider: str = Field(
        default="sandbox",
        validation_alias=AliasChoices("EMBEDDING_PROVIDER", "SUPPORTPILOT_EMBEDDING_PROVIDER"),
    )
    generation_provider: str = Field(
        default="sandbox",
        validation_alias=AliasChoices("GENERATION_PROVIDER", "SUPPORTPILOT_GENERATION_PROVIDER"),
    )
    demo_auto_login: bool = Field(
        default=False,
        validation_alias=AliasChoices("SUPPORTPILOT_DEMO_AUTO_LOGIN", "DEMO_AUTO_LOGIN"),
    )
    cors_origins: str = Field(default="*", validation_alias=AliasChoices("CORS_ORIGINS"))
    generate_rate_limit: int = Field(default=20, validation_alias=AliasChoices("GENERATE_RATE_LIMIT"))
    mutate_rate_limit: int = Field(default=80, validation_alias=AliasChoices("MUTATE_RATE_LIMIT"))
    rate_limit_window_ms: int = Field(default=60_000, validation_alias=AliasChoices("RATE_LIMIT_WINDOW_MS"))
    auto_create_tables: bool = Field(default=True, validation_alias=AliasChoices("AUTO_CREATE_TABLES"))
    auto_seed: bool = Field(default=True, validation_alias=AliasChoices("AUTO_SEED"))
    openai_api_key: str = Field(default="", validation_alias=AliasChoices("OPENAI_API_KEY"))
    openai_embedding_model: str = Field(
        default="text-embedding-3-small",
        validation_alias=AliasChoices("OPENAI_EMBEDDING_MODEL"),
    )
    openai_generation_model: str = Field(
        default="gpt-4.1-mini",
        validation_alias=AliasChoices("OPENAI_GENERATION_MODEL"),
    )
    demo_admin_email: str = Field(
        default="admin@heliodesk.example",
        validation_alias=AliasChoices("DEMO_ADMIN_EMAIL"),
    )
    demo_admin_password: str = Field(
        default="DemoAdmin!2026",
        validation_alias=AliasChoices("DEMO_ADMIN_PASSWORD"),
    )
    demo_operator_email: str = Field(
        default="operator@heliodesk.example",
        validation_alias=AliasChoices("DEMO_OPERATOR_EMAIL"),
    )
    demo_operator_password: str = Field(
        default="DemoOperator!2026",
        validation_alias=AliasChoices("DEMO_OPERATOR_PASSWORD"),
    )
    log_level: str = Field(default="INFO", validation_alias=AliasChoices("LOG_LEVEL"))

    @property
    def broker_url(self) -> str:
        return self.celery_broker_url or self.redis_url

    @property
    def result_backend(self) -> str:
        return self.celery_result_backend or self.redis_url

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def cors_origin_list(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [part.strip() for part in self.cors_origins.split(",") if part.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


def clear_settings_cache() -> None:
    get_settings.cache_clear()
