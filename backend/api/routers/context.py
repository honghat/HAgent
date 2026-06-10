from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from api.services.context_compaction import get_compaction_status, update_compaction_config


router = APIRouter(prefix="/api/context", tags=["context"])


class CompactionUpdate(BaseModel):
    enabled: bool | None = None
    threshold: float | None = None
    target_ratio: float | None = None
    protect_last_n: int | None = None
    hygiene_hard_message_limit: int | None = None


@router.get("/compaction")
def compaction_status() -> dict[str, Any]:
    return get_compaction_status()


@router.put("/compaction")
def update_compaction(body: CompactionUpdate) -> dict[str, Any]:
    return update_compaction_config(body.model_dump(exclude_none=True))
