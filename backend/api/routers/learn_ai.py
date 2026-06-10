from __future__ import annotations

import json
import asyncio
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from fastapi import Header
from api.services.user_store import resolve_user_id
from api.services.db import get_db, get_connection

router = APIRouter(prefix="/api/learn/ai", tags=["learn"])


def get_current_user_id(authorization: str = Header(None)) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="No token provided")
    token = authorization.replace("Bearer ", "").strip()
    uid = resolve_user_id(token)
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token")
    return uid


def _get_settings():
    db = get_db()
    try:
        row = db.execute("SELECT * FROM learn_settings WHERE id = 1").fetchone()
        db.close()
        if row:
            return {
                "aiServer": row["ai_server"],
                "aiProvider": row["ai_provider"],
                "aiKey": row["ai_key"],
                "aiModel": row["ai_model"],
            }
    except Exception:
        db.close()
    return {"aiServer": "http://100.69.50.64:8080/v1", "aiProvider": "local", "aiKey": "", "aiModel": "default"}


def _patch_model(model: str, ai_server: str) -> str:
    if not model or model == "default":
        return model
    if "openrouter.ai" in ai_server:
        if model in ("deepseek-chat", "deepseek-reasoner"):
            return f"deepseek/{model}"
        if model.startswith("gpt-"):
            return f"openai/{model}"
        if model.startswith("claude-"):
            return f"anthropic/{model}"
        if model.startswith("gemini-"):
            return f"google/{model}"
    return model


class AICompletion(BaseModel):
    model: str = "default"
    messages: list[dict]
    temperature: float = 0.7


@router.post("/chat")
async def chat_completion(body: AICompletion, user_id: str = Depends(get_current_user_id)):
    import httpx
    settings = _get_settings()
    base_url = settings["aiServer"].rstrip("/")
    url = f"{base_url}/chat/completions"
    headers = {"Content-Type": "application/json", "HTTP-Referer": "https://hatai.io.vn", "X-OpenRouter-Title": "HatAI"}
    if settings["aiKey"]:
        headers["Authorization"] = f"Bearer {settings['aiKey']}"
    final_model = body.model if body.model and body.model != "default" else (settings["aiModel"] or "deepseek/deepseek-chat")
    final_model = _patch_model(final_model, settings["aiServer"])
    payload = {"model": final_model, "temperature": body.temperature, "messages": body.messages}
    try:
        async with httpx.AsyncClient(timeout=600) as client:
            resp = await client.post(url, headers=headers, json=payload)
        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"AI error ({resp.status_code}): {resp.text[:200]}")
        return resp.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="AI request timed out")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── Background AI tasks ─────────────────────────────────────────────────

class AITaskCreate(BaseModel):
    type: str
    prompt: str
    model: str = "default"


@router.post("/task")
async def create_ai_task(body: AITaskCreate, user_id: str = Depends(get_current_user_id)):
    import httpx

    settings = _get_settings()
    task_id = f"task_{datetime.now().timestamp()}_{id(body)}"

    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO english_items (user_id, type, content, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))",
            (user_id, f"{body.type}_pending", task_id, json.dumps({"taskId": task_id, "status": "running"})),
        )
        conn.commit()
    finally:
        conn.close()

    async def run_task():
        nonlocal settings
        try:
            base_url = settings["aiServer"].rstrip("/")
            url = f"{base_url}/chat/completions"
            headers = {"Content-Type": "application/json"}
            if settings["aiKey"]:
                headers["Authorization"] = f"Bearer {settings['aiKey']}"
            final_model = body.model if body.model and body.model != "default" else (settings["aiModel"] or "deepseek/deepseek-chat")
            final_model = _patch_model(final_model, settings["aiServer"])
            async with httpx.AsyncClient(timeout=300) as client:
                resp = await client.post(url, headers=headers, json={
                    "model": final_model, "temperature": 0.7,
                    "messages": [{"role": "user", "content": body.prompt}],
                })
            if resp.status_code >= 400:
                raise Exception(f"AI HTTP {resp.status_code}")
            data = resp.json()
            content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")

            skip_clean = ["grammar", "reading", "writing_sample", "speak_sample", "listen"]
            if body.type not in skip_clean:
                content = _clean_topic(content)

            conn2 = get_connection()
            try:
                if content and len(content) > 5:
                    conn2.execute(
                        "INSERT INTO english_items (user_id, type, content, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))",
                        (user_id, body.type, content, json.dumps({"taskId": task_id, "generated": True})),
                    )
                    conn2.commit()
                conn2.execute("DELETE FROM english_items WHERE user_id = ? AND type = ? AND content = ?",
                              (user_id, f"{body.type}_pending", task_id))
                conn2.commit()
            finally:
                conn2.close()
        except Exception as e:
            import logging
            logging.exception("AI task failed")
            conn3 = get_connection()
            try:
                conn3.execute("UPDATE english_items SET metadata = ? WHERE user_id = ? AND type = ? AND content = ?",
                              (json.dumps({"taskId": task_id, "status": "error", "error": str(e)}),
                               user_id, f"{body.type}_pending", task_id))
                conn3.commit()
            finally:
                conn3.close()

    asyncio.create_task(run_task())
    return {"taskId": task_id}


def _clean_topic(raw: str) -> str:
    t = raw.strip()
    lines = [l.strip() for l in t.split("\n") if l.strip()]
    if not lines:
        return ""
    t = next((l for l in lines if "?" in l), lines[0])
    import re
    t = re.sub(r"^[*#>\-•\d.]+\s*", "", t)
    t = re.sub(r"^(topic|question|prompt|here(?:'s| is))[:\s]+", "", t, flags=re.IGNORECASE)
    t = re.sub(r'^["\'"「『](.*)["\'"」』]$', r"\1", t)
    return t.strip()


@router.get("/task")
def poll_ai_task(taskId: str, type: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        pending = db.execute(
            "SELECT id, metadata FROM english_items WHERE user_id = ? AND type = ? AND content = ?",
            (user_id, f"{type}_pending", taskId),
        ).fetchone()
        if pending:
            meta = json.loads(pending["metadata"] or "{}")
            if meta.get("status") == "error":
                db.execute("DELETE FROM english_items WHERE id = ?", (pending["id"],))
                db.commit()
                return {"status": "error", "error": meta.get("error")}
            return {"status": "running"}
        result = db.execute(
            "SELECT id, content, metadata FROM english_items WHERE user_id = ? AND type = ? ORDER BY created_at DESC LIMIT 1",
            (user_id, type),
        ).fetchone()
        if result and taskId in (result["metadata"] or ""):
            return {"status": "done", "content": result["content"], "id": result["id"]}
        return {"status": "unknown"}
    finally:
        db.close()


@router.delete("/task")
def delete_ai_task(taskId: str | None = None, type: str | None = None, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    try:
        if taskId and type:
            db.execute(
                "DELETE FROM english_items WHERE user_id = ? AND type = ? AND content = ?",
                (user_id, f"{type}_pending", taskId),
            )
        else:
            from datetime import datetime, timedelta
            stale = (datetime.utcnow() - timedelta(minutes=3)).isoformat()
            db.execute(
                "DELETE FROM english_items WHERE user_id = ? AND type LIKE '%_pending' AND created_at < ?",
                (user_id, stale),
            )
        db.commit()
        return {"ok": True}
    finally:
        db.close()
