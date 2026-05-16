"""Wiki store service -- CRUD, export, synthesis, RAG reindex."""

import json
import sqlite3
from pathlib import Path
from uuid import uuid4

from api.services.db import DB_PATH, get_connection


def get_entry(entry_id: str, user_id: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, user_id, title, summary, content, topics, source, created_at, updated_at FROM wiki_entries WHERE id = ? AND user_id = ?",
            (entry_id, user_id),
        ).fetchone()
    return dict(row) if row else None


def update_entry(entry_id: str, user_id: str, updates: dict) -> dict | None:
    fields, params = [], []
    for key, val in updates.items():
        if val is not None:
            fields.append(f"{key} = ?")
            params.append(val)
    if not fields:
        return get_entry(entry_id, user_id)
    fields.append("updated_at = datetime('now')")
    params.extend([entry_id, user_id])
    with get_connection() as conn:
        conn.execute(
            f"UPDATE wiki_entries SET {', '.join(fields)} WHERE id = ? AND user_id = ?",
            params,
        )
    return get_entry(entry_id, user_id)


def delete_entry(entry_id: str, user_id: str) -> bool:
    with get_connection() as conn:
        cur = conn.execute("DELETE FROM wiki_entries WHERE id = ? AND user_id = ?", (entry_id, user_id))
        return cur.rowcount > 0


def list_topics(user_id: str) -> list[str]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT topics FROM wiki_entries WHERE user_id = ? ORDER BY updated_at DESC",
            (user_id,),
        ).fetchall()
    topics = set()
    for r in rows:
        if r and r[0]:
            try:
                for t in json.loads(r[0]):
                    topics.add(t)
            except (json.JSONDecodeError, TypeError):
                pass
    return sorted(topics)


def export_to_markdown(user_id: str) -> dict | None:
    """Export all wiki entries as markdown files grouped by topic."""
    from api.services.wiki_memory import search_wiki
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, title, summary, content, topics, updated_at FROM wiki_entries WHERE user_id = ? ORDER BY updated_at DESC",
            (user_id,),
        ).fetchall()
    if not rows:
        return None
    files = []
    topics_map = {}
    for r in rows:
        tl = json.loads(r[4]) if r[4] else ["general"]
        safe_title = r[1].replace("/", "-").replace(" ", "-")[:50]
        md = f"# {r[1]}\n\n{r[2]}\n\n---\n\n{r[3]}\n\n_Updated: {r[5]}_"
        for t in tl:
            path = f"{t}/{safe_title}.md"
            files.append({"path": path, "content": md, "topic": t, "title": r[1]})
            topics_map.setdefault(t, []).append({"title": r[1], "path": path})
    return {"files": files, "topics": topics_map, "path": str(DB_PATH.parent / "wiki" / user_id)}


def synthesize_topic(topic: str, user_id: str, provider: str | None = None) -> dict:
    """Merge all entries in a topic using LLM."""
    from api.services.wiki_memory import search_wiki
    entries = search_wiki(user_id, topic, limit=50)
    topic_entries = [e for e in entries if topic in (json.loads(e.get("topics", "[]")) if isinstance(e.get("topics"), str) else e.get("topics", []))]
    if not topic_entries:
        return {"ok": False, "error": f"No entries found for topic: {topic}"}
    from api.services.provider_config import get_provider_config as get_cfg
    cfg = get_cfg(provider)
    content = "\n\n---\n\n".join(f"# {e['title']}\n\n{e.get('content', '')}" for e in topic_entries)
    try:
        from urllib import request, error
        import urllib
        payload = {
            "model": cfg.model,
            "messages": [
                {"role": "system", "content": f"Ban la tro ly AI. Hay tong hop cac bai viet sau day ve chu de '{topic}' thanh mot bai viet hoan chinh, co cau truc, bo sung thong tin. Tra ve JSON: {{\"title\": \"...\", \"content\": \"...\", \"summary\": \"...\"}}"},
                {"role": "user", "content": content[:8000]},
            ],
            "temperature": 0.3,
        }
        req = urllib.request.Request(
            f"{cfg.base_url.rstrip('/')}/chat/completions",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {cfg.api_key}"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
            raw = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    except Exception as e:
        return {"ok": False, "error": str(e)}
    try:
        import re
        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
        parsed = json.loads(m.group(1) if m else raw)
    except Exception:
        parsed = {"title": f"Tong hop: {topic}", "content": raw, "summary": f"Tong hop {len(topic_entries)} entries"}
    return {"ok": True, "entry": parsed, "source_count": len(topic_entries)}


def auto_restructure(user_id: str, provider: str | None = None) -> dict:
    """AI-suggest restructuring of the entire wiki."""
    from api.services.wiki_memory import list_wiki_entries
    entries = list_wiki_entries(user_id, limit=100)
    if not entries:
        return {"ok": False, "error": "No entries"}
    summary = "\n".join(f"- {e['title']} ({', '.join(json.loads(e.get('topics', '[]')) if isinstance(e.get('topics'), str) else e.get('topics', ['general']))})" for e in entries)
    from api.services.provider_config import get_provider_config as get_cfg
    cfg = get_cfg(provider)
    try:
        from urllib import request, error
        import urllib
        payload = {
            "model": cfg.model,
            "messages": [
                {"role": "system", "content": "Ban la tro ly AI. Phan tich wiki entries va de xuat cau truc lai: gop topics, merge entries trung, xoa entries cu. Tra ve JSON: {\"suggestions\": [{\"action\": \"merge|move|delete|rename\", \"source\": \"...\", \"target\": \"...\", \"reason\": \"...\"}]}"},
                {"role": "user", "content": summary[:6000]},
            ],
            "temperature": 0.3,
        }
        req = urllib.request.Request(
            f"{cfg.base_url.rstrip('/')}/chat/completions",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {cfg.api_key}"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
            raw = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    except Exception as e:
        return {"ok": False, "error": str(e)}
    try:
        import re
        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
        parsed = json.loads(m.group(1) if m else raw)
    except Exception:
        parsed = {"suggestions": []}
    return {"ok": True, "suggestions": parsed.get("suggestions", []), "entry_count": len(entries)}


def reindex_all(user_id: str) -> dict:
    """Rebuild RAG embeddings for all entries."""
    return {"ok": True, "message": "Reindex not implemented -- will use fastembed in future", "entries": 0}
