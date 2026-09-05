"""Fictional HelioDesk support tickets used by the demo seed."""

from __future__ import annotations

import json
from pathlib import Path

_JSON = Path(__file__).with_name("tickets.json")
SEED_TICKETS: list[dict] = json.loads(_JSON.read_text(encoding="utf-8"))
