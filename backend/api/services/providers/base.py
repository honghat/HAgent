from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ProviderConfig:
    name: str
    type: str
    model: str
    base_url: str | None = None
    api_key: str | None = None
