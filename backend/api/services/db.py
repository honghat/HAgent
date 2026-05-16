from __future__ import annotations

import sqlite3
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = Path(os.getenv("HAGENT_DATA_DIR") or PROJECT_ROOT / "data")
DB_PATH = DATA_DIR / "hagent.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def get_db() -> sqlite3.Connection:
    """Alias for get_connection for FastAPI dependency injection or common use."""
    return get_connection()


def init_db() -> None:
    with get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                agent_id TEXT,
                processing INTEGER DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                provider TEXT,
                usage_json TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS run_journals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id TEXT,
                session_id TEXT NOT NULL,
                type TEXT NOT NULL,
                content TEXT,
                event_name TEXT,
                status TEXT,
                count INTEGER DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS session_todos (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                content TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
            );
            """
        )
        _ensure_column(conn, "chat_sessions", "agent_id", "TEXT")
        _ensure_column(conn, "chat_sessions", "processing", "INTEGER DEFAULT 0")
        _ensure_column(conn, "chat_sessions", "summary", "TEXT")
        _ensure_column(conn, "chat_sessions", "parent_session_id", "TEXT")
        _ensure_column(conn, "messages", "provider", "TEXT")
        _ensure_column(conn, "messages", "usage_json", "TEXT")


def _ensure_column(conn: sqlite3.Connection, table: str, column: str, ddl: str) -> None:
    existing = {
        row["name"]
        for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
    }
    if column not in existing:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
