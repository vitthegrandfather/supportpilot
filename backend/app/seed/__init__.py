"""Idempotent fictional seed data for the HelioDesk demo workspace."""

from app.seed.runner import reset_demo, seed_if_empty

__all__ = ["reset_demo", "seed_if_empty"]
