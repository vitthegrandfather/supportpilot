"""Celery application. Tests and this demo default to eager execution."""

from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "supportpilot",
    broker=settings.broker_url,
    backend=settings.result_backend,
    include=["app.workers.tasks"],
)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_always_eager=settings.celery_task_always_eager or settings.env == "test",
    task_eager_propagates=True,
    task_ignore_result=False,
)
