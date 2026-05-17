"""User and auth store — operates on shared data/hagent.db."""

import sqlite3
import uuid
from typing import Optional, Dict, Any, List

import bcrypt

from api.services.db import get_connection

DEFAULT_USERNAME = "hat"
DEFAULT_SESSION_TOKEN = "hat"
DEFAULT_PASSWORD = "Thaco@2018"


def init_user_tables():
    with get_connection() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL, display_name TEXT DEFAULT '',
                default_provider TEXT DEFAULT 'deepseek',
                claude_mode TEXT DEFAULT 'qwen',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')), expires_at TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS custom_providers (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
                name TEXT NOT NULL, label TEXT NOT NULL,
                type TEXT DEFAULT 'openai', base_url TEXT DEFAULT '',
                api_key TEXT DEFAULT '', model TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id, name)
            );
        """)
        for col, ddl in [("default_provider", "TEXT DEFAULT 'deepseek'"), ("claude_mode", "TEXT DEFAULT 'qwen'"), ("pinned_folders", "TEXT DEFAULT '[]'")]:
            existing = {r["name"] for r in conn.execute("PRAGMA table_info(users)").fetchall()}
            if col not in existing:
                conn.execute(f"ALTER TABLE users ADD COLUMN {col} {ddl}")
    ensure_default_user()


def ensure_default_user():
    """Seed the default user if not exists (matching Node's db.js)."""
    with get_connection() as conn:
        user = conn.execute("SELECT id FROM users WHERE username = ?", (DEFAULT_USERNAME,)).fetchone()
        if not user:
            pw_hash = bcrypt.hashpw(DEFAULT_PASSWORD.encode(), bcrypt.gensalt()).decode()
            conn.execute(
                "INSERT INTO users (id, username, password_hash, display_name, default_provider, claude_mode) VALUES (?,?,?,?,?,?)",
                (DEFAULT_USERNAME, DEFAULT_USERNAME, pw_hash, "Anh Hat", "lmstudio_local", "lmstudio_local"),
            )
            user_id = DEFAULT_USERNAME
        else:
            user_id = user["id"]
        conn.execute(
            "INSERT OR REPLACE INTO sessions (id, user_id) VALUES (?, ?)",
            (DEFAULT_SESSION_TOKEN, user_id),
        )


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(password: str, stored: str) -> bool:
    return bcrypt.checkpw(password.encode(), stored.encode() if isinstance(stored, str) else stored)


def create_user(username: str, password: str, display_name: str = None) -> dict:
    if get_user_by_username(username):
        raise ValueError("Username already exists")
    uid = str(uuid.uuid4())
    with get_connection() as conn:
        conn.execute("INSERT INTO users (id, username, password_hash, display_name) VALUES (?,?,?,?)",
                     (uid, username, _hash_password(password), display_name or username))
    return {"id": uid, "username": username, "displayName": display_name or username}


def get_user_by_username(username: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    return dict(row) if row else None


def get_user_by_id(user_id: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, username, display_name, created_at, default_provider, claude_mode, pinned_folders FROM users WHERE id = ?",
            (user_id,)).fetchone()
    return dict(row) if row else None


def update_user(user_id: str, updates: dict) -> None:
    fields, params = [], []
    for key, val in updates.items():
        if key == "password":
            fields.append("password_hash = ?")
            params.append(_hash_password(val))
        elif key == "displayName":
            fields.append("display_name = ?")
            params.append(val)
        elif key == "username":
            fields.append("username = ?")
            params.append(val)
        elif key in ("default_provider", "claude_mode", "pinned_folders"):
            fields.append(f"{key} = ?")
            params.append(val)
        else:
            fields.append(f"{key} = ?")
            params.append(val)
    if not fields:
        return
    fields.append("updated_at = datetime('now')")
    params.append(user_id)
    with get_connection() as conn:
        conn.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", params)


def authenticate_user(username: str, password: str) -> dict | None:
    user = get_user_by_username(username)
    if user and _verify_password(password, user["password_hash"]):
        return user
    return None


def create_session(user_id: str) -> str:
    token = str(uuid.uuid4())
    with get_connection() as conn:
        conn.execute("INSERT INTO sessions (id, user_id) VALUES (?, ?)", (token, user_id))
    return token


def get_session(token: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM sessions WHERE id = ?", (token,)).fetchone()
    return dict(row) if row else None


def delete_session(token: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM sessions WHERE id = ?", (token,))


def resolve_user_id(token: str, default_token: str = "hat", default_user: str = "hat") -> str | None:
    session = get_session(token)
    if session:
        return session["user_id"]
    if token == default_token:
        user = get_user_by_username(default_user)
        return user["id"] if user else None
    return None


BUILTIN_PROVIDERS = [
    {"name": "deepseek", "label": "DeepSeek", "type": "openai", "baseURL": "https://api.deepseek.com", "model": "deepseek-chat"},
    {"name": "ollama", "label": "Ollama (Remote)", "type": "openai", "baseURL": "http://100.69.50.64:11434/v1", "model": "qwen3.5:4b"},
    {"name": "lmstudio", "label": "LM Studio (Remote)", "type": "openai", "baseURL": "http://100.69.50.64:1234/v1", "model": "qwen/qwen3.5-9b"},
    {"name": "llamacpp", "label": "Llama.cpp (Remote)", "type": "openai", "baseURL": "http://100.69.50.64:8080/v1", "model": "qwen"},
    {"name": "lmstudio_local", "label": "LM Studio (Local)", "type": "openai", "baseURL": "http://127.0.0.1:1234/v1", "model": "google/gemma-4-e2b"},
    {"name": "cx", "label": "CX/9Router", "type": "openai", "baseURL": "http://127.0.0.1:20128/v1", "model": "cx/gpt-5.5"},
    {"name": "gemini", "label": "Gemini", "type": "gemini", "baseURL": "", "model": "gemini-2.0-flash"},
    {"name": "openai", "label": "OpenAI", "type": "openai", "baseURL": "https://api.openai.com/v1", "model": "gpt-4o-mini"},
    {"name": "anthropic", "label": "Anthropic", "type": "anthropic", "baseURL": "https://api.anthropic.com", "model": "claude-3-5-sonnet"},
]


def get_providers(user_id: str) -> list[dict]:
    with get_connection() as conn:
        stored = conn.execute(
            "SELECT name, label, type, base_url, api_key, model FROM custom_providers WHERE user_id = ? ORDER BY created_at ASC",
            (user_id,)).fetchall()
    override = {r["name"]: r for r in stored}
    builtin_names = {p["name"] for p in BUILTIN_PROVIDERS}
    merged = []
    for p in BUILTIN_PROVIDERS:
        ovr = override.get(p["name"])
        merged.append({
            "name": p["name"], "label": ovr["label"] if ovr else p["label"],
            "type": ovr["type"] if ovr else p["type"],
            "baseURL": ovr["base_url"] if ovr and ovr["base_url"] else p["baseURL"],
            "model": ovr["model"] if ovr and ovr["model"] else p["model"],
            "custom": False,
        })
    for r in stored:
        if r["name"] not in builtin_names:
            merged.append({
                "name": r["name"], "label": r["label"], "type": r["type"],
                "baseURL": r["base_url"] or "", "model": r["model"] or "", "custom": True,
            })
    return merged


def upsert_provider(user_id: str, data: dict) -> None:
    with get_connection() as conn:
        existing = conn.execute("SELECT id FROM custom_providers WHERE user_id = ? AND name = ?",
                                (user_id, data["name"])).fetchone()
        if existing:
            conn.execute("""UPDATE custom_providers SET label=?, type=?, base_url=?,
                api_key=CASE WHEN ? != '' THEN ? ELSE api_key END, model=?, updated_at=datetime('now')
                WHERE user_id=? AND name=?""",
                (data.get("label", ""), data.get("type", "openai"),
                 data.get("base_url", "") or data.get("baseURL", ""),
                 data.get("api_key", ""), data.get("api_key", ""),
                 data.get("model", ""), user_id, data["name"]))
        else:
            conn.execute(
                "INSERT INTO custom_providers (id, user_id, name, label, type, base_url, api_key, model) VALUES (?,?,?,?,?,?,?,?)",
                (str(uuid.uuid4()), user_id, data["name"], data.get("label", ""),
                 data.get("type", "openai"), data.get("base_url", "") or data.get("baseURL", ""),
                 data.get("api_key", "") or data.get("apiKey", ""), data.get("model", "")))


def delete_provider(user_id: str, name: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM custom_providers WHERE user_id = ? AND name = ?", (user_id, name))
