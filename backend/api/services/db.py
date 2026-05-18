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

            CREATE TABLE IF NOT EXISTS wiki_entries (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                summary TEXT DEFAULT '',
                content TEXT NOT NULL,
                topics TEXT DEFAULT '[]',
                source TEXT DEFAULT 'chat',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS wiki_embeddings (
                entry_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                embedding_json TEXT NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (entry_id) REFERENCES wiki_entries(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS self_evolution_events (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'reflection',
                source_session_id TEXT,
                source_message_id TEXT,
                related_message_id TEXT,
                title TEXT NOT NULL,
                evidence TEXT NOT NULL DEFAULT '',
                lesson TEXT NOT NULL DEFAULT '',
                action TEXT NOT NULL DEFAULT '',
                confidence REAL NOT NULL DEFAULT 0.5,
                status TEXT NOT NULL DEFAULT 'pending',
                metadata_json TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                applied_at TEXT
            );

            CREATE TABLE IF NOT EXISTS message_feedback (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                message_id TEXT NOT NULL,
                rating TEXT NOT NULL,
                comment TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, message_id)
            );

            CREATE TABLE IF NOT EXISTS self_evolution (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT NOT NULL,
                content TEXT NOT NULL,
                metadata_json TEXT,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS agent_goals (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'active',
                priority INTEGER NOT NULL DEFAULT 3,
                deadline TEXT,
                progress INTEGER NOT NULL DEFAULT 0,
                source TEXT NOT NULL DEFAULT 'manual',
                metadata_json TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                completed_at TEXT,
                archived_at TEXT
            );

            CREATE TABLE IF NOT EXISTS goal_tasks (
                id TEXT PRIMARY KEY,
                goal_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                detail TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'pending',
                priority INTEGER NOT NULL DEFAULT 3,
                evidence TEXT NOT NULL DEFAULT '',
                result TEXT NOT NULL DEFAULT '',
                last_attempt_at TEXT,
                completed_at TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (goal_id) REFERENCES agent_goals(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS omni_channels (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                platform TEXT NOT NULL,
                access_token TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS omni_conversations (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                platform TEXT NOT NULL,
                external_id TEXT,
                title TEXT NOT NULL,
                thread_type TEXT DEFAULT 'user',
                avatar_url TEXT DEFAULT '',
                custom_name TEXT,
                last_message_preview TEXT DEFAULT '',
                last_message_sender TEXT DEFAULT '',
                last_message_at TEXT,
                unread_count INTEGER DEFAULT 0,
                pinned INTEGER DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS omni_messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                reply_to_id TEXT,
                platform TEXT,
                external_id TEXT,
                reactions_json TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES omni_conversations(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS omni_contacts (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                platform TEXT NOT NULL,
                external_id TEXT NOT NULL,
                name TEXT NOT NULL,
                avatar_url TEXT DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
        _ensure_column(conn, "chat_sessions", "agent_id", "TEXT")
        _ensure_column(conn, "chat_sessions", "processing", "INTEGER DEFAULT 0")
        _ensure_column(conn, "chat_sessions", "summary", "TEXT")
        _ensure_column(conn, "chat_sessions", "parent_session_id", "TEXT")
        _ensure_column(conn, "messages", "provider", "TEXT")
        _ensure_column(conn, "messages", "usage_json", "TEXT")
        _ensure_column(conn, "self_evolution", "metadata_json", "TEXT")
        _ensure_column(conn, "omni_channels", "access_token", "TEXT")
        _ensure_column(conn, "omni_conversations", "thread_type", "TEXT DEFAULT 'user'")
        _ensure_column(conn, "omni_conversations", "avatar_url", "TEXT DEFAULT ''")
        _ensure_column(conn, "omni_messages", "external_id", "TEXT")
        _ensure_column(conn, "omni_messages", "reactions_json", "TEXT")
        conn.executescript(
            """
            CREATE INDEX IF NOT EXISTS idx_evolution_user_status
                ON self_evolution_events(user_id, status, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_evolution_user_type
                ON self_evolution_events(user_id, event_type, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_feedback_message
                ON message_feedback(user_id, message_id);
            CREATE INDEX IF NOT EXISTS idx_wiki_user
                ON wiki_entries(user_id);
            CREATE INDEX IF NOT EXISTS idx_wiki_updated
                ON wiki_entries(updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_goals_user_status
                ON agent_goals(user_id, status, updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_goal_tasks_goal_status
                ON goal_tasks(goal_id, status, priority ASC);
            CREATE INDEX IF NOT EXISTS idx_omni_channels_user_platform
                ON omni_channels(user_id, platform);
            CREATE INDEX IF NOT EXISTS idx_omni_conversations_user_platform_external
                ON omni_conversations(user_id, platform, external_id);
            CREATE INDEX IF NOT EXISTS idx_omni_messages_conversation_external
                ON omni_messages(conversation_id, external_id);
            CREATE INDEX IF NOT EXISTS idx_omni_contacts_user_platform_external
                ON omni_contacts(user_id, platform, external_id);
            """
        )


def _ensure_column(conn: sqlite3.Connection, table: str, column: str, ddl: str) -> None:
    existing = {
        row["name"]
        for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
    }
    if column not in existing:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
