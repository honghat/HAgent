import json
import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel


router = APIRouter(prefix="/api/mindmap", tags=["mindmap"])

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = PROJECT_ROOT / "data" / "mindmap"


class MindmapStorePayload(BaseModel):
    user: str = "local"
    notes: list[dict[str, Any]]


def _safe_user_key(user: str) -> str:
    key = re.sub(r"[^a-zA-Z0-9_.-]+", "_", str(user or "local")).strip("._")
    return key[:80] or "local"


def _store_path(user: str) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR / f"{_safe_user_key(user)}.json"


def _read_notes(user: str) -> list[dict[str, Any]]:
    path = _store_path(user)
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="Mindmap data is corrupted") from exc
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get("notes"), list):
        return data["notes"]
    return []


@router.get("")
def list_mindmap_notes(user: str = Query("local")):
    return {"notes": _read_notes(user)}


@router.put("")
def save_mindmap_notes(payload: MindmapStorePayload):
    path = _store_path(payload.user)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(
        json.dumps({"notes": payload.notes}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    tmp.replace(path)
    return {"ok": True, "path": str(path), "count": len(payload.notes)}
