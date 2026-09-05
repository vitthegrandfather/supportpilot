"""Celery eager-mode wiring."""

from app.workers.celery_app import celery_app


def test_celery_eager() -> None:
    assert celery_app.conf.task_always_eager is True
    assert "app.workers.tasks" in (celery_app.conf.include or [])
