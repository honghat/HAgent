import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '..', '..', 'data', 'hagent.db');
const DATA_DIR = path.dirname(DB_PATH);

import { mkdirSync } from 'node:fs';
import { existsSync } from 'node:fs';
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export const DEFAULT_USERNAME = 'hat';
export const DEFAULT_SESSION_TOKEN = 'hat';
const DEFAULT_PASSWORD = 'Thaco@2018';

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS wiki_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT DEFAULT '',
    content TEXT NOT NULL,
    topics TEXT DEFAULT '[]',
    source TEXT DEFAULT 'chat',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_wiki_user ON wiki_entries(user_id);
  CREATE INDEX IF NOT EXISTS idx_wiki_updated ON wiki_entries(updated_at DESC);

  CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT DEFAULT 'New Chat',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_chat_session_user ON chat_sessions(user_id);

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    provider TEXT DEFAULT 'local',
    usage_json TEXT DEFAULT '',
    tool_results TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

  CREATE TABLE IF NOT EXISTS wiki_embeddings (
    entry_id TEXT PRIMARY KEY,
    embedding TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (entry_id) REFERENCES wiki_entries(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    model TEXT DEFAULT 'local',
    soul_content TEXT DEFAULT '',
    is_public BOOLEAN DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS run_journals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    type TEXT NOT NULL,
    event_name TEXT,
    content TEXT,
    status TEXT,
    count INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS session_todos (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_session_todos_session ON session_todos(session_id, created_at ASC);
`);

// Migration for messages usage
try {
  db.exec('ALTER TABLE messages ADD COLUMN usage_json TEXT');
  console.log('[DB] Added usage_json column to messages');
} catch (e) {}

// Migration for agents tool_groups and skills
try {
  db.exec('ALTER TABLE agents ADD COLUMN tool_groups TEXT DEFAULT \'[]\'');
  console.log('[DB] Added tool_groups column to agents');
} catch (e) {}
try {
  db.exec('ALTER TABLE agents ADD COLUMN skills TEXT DEFAULT \'[]\'');
  console.log('[DB] Added skills column to agents');
} catch (e) {}

// Migration for agent auto-run
try {
  db.exec("ALTER TABLE agents ADD COLUMN is_active INTEGER DEFAULT 0");
  console.log('[DB] Added is_active column to agents');
} catch (e) {}
try {
  db.exec("ALTER TABLE agents ADD COLUMN auto_start INTEGER DEFAULT 0");
  console.log('[DB] Added auto_start column to agents');
} catch (e) {}
try {
  db.exec("ALTER TABLE agents ADD COLUMN last_run_at TEXT");
  console.log('[DB] Added last_run_at column to agents');
} catch (e) {}
try {
  db.exec("ALTER TABLE agents ADD COLUMN interval_seconds INTEGER DEFAULT 300");
  console.log('[DB] Added interval_seconds column to agents');
} catch (e) {}

// Migration for session processing state
try {
  db.exec("ALTER TABLE chat_sessions ADD COLUMN processing INTEGER DEFAULT 0");
  console.log('[DB] Added processing column to chat_sessions');
} catch (e) {}

// Migration for user provider preference
try {
  db.exec("ALTER TABLE users ADD COLUMN default_provider TEXT DEFAULT 'deepseek'");
  console.log('[DB] Added default_provider column to users');
} catch (e) {}

// Migration for claude proxy mode
try {
  db.exec("ALTER TABLE users ADD COLUMN claude_mode TEXT DEFAULT 'qwen'");
  console.log('[DB] Added claude_mode column to users');
} catch (e) {}

function ensureDefaultUser() {
  let user = db.prepare('SELECT id FROM users WHERE username = ?').get(DEFAULT_USERNAME);
  if (!user) {
    user = { id: DEFAULT_USERNAME };
    db.prepare(`
      INSERT INTO users (id, username, password_hash, display_name, default_provider, claude_mode)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(user.id, DEFAULT_USERNAME, bcrypt.hashSync(DEFAULT_PASSWORD, 10), 'Anh Hạt', 'lmstudio_local', 'lmstudio_local');
  }

  db.prepare(`
    INSERT INTO sessions (id, user_id)
    VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id
  `).run(DEFAULT_SESSION_TOKEN, user.id);
}

ensureDefaultUser();

// Agent todos table
db.exec(`
  CREATE TABLE IF NOT EXISTS agent_todos (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'failed')),
    result TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS video_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_ref TEXT,
    source_lang TEXT DEFAULT 'zh',
    status TEXT NOT NULL DEFAULT 'queued',
    progress TEXT,
    video_file TEXT,
    srt_file TEXT,
    segments_count INTEGER,
    duration REAL,
    voice TEXT DEFAULT 'hoaimy',
    funny INTEGER DEFAULT 0,
    music INTEGER DEFAULT 0,
    yt_desc TEXT,
    yt_tags TEXT,
    script TEXT,
    pencil_scenes TEXT,
    transitions TEXT,
    error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS video_publish_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    platform TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    url TEXT,
    error TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (task_id) REFERENCES video_tasks(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_video_tasks_user ON video_tasks(user_id);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS cv_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    file_name TEXT DEFAULT '',
    file_path TEXT DEFAULT '',
    raw_text TEXT DEFAULT '',
    parsed_data TEXT DEFAULT '{}',
    content TEXT DEFAULT '',
    summary TEXT DEFAULT '',
    skills_json TEXT DEFAULT '[]',
    roles_json TEXT DEFAULT '[]',
    locations_json TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_cv_profiles_user ON cv_profiles(user_id);

  CREATE TABLE IF NOT EXISTS cv_job_searches (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    query TEXT NOT NULL,
    location TEXT DEFAULT '',
    results_json TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (profile_id) REFERENCES cv_profiles(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_cv_job_searches_profile ON cv_job_searches(profile_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS cv_job_applications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    search_id TEXT DEFAULT '',
    job_url TEXT NOT NULL,
    job_title TEXT NOT NULL,
    company TEXT DEFAULT '',
    source TEXT DEFAULT '',
    status TEXT DEFAULT 'pending_review',
    match_score INTEGER DEFAULT 0,
    income_potential INTEGER DEFAULT 0,
    verdict TEXT DEFAULT '',
    job_json TEXT DEFAULT '{}',
    draft_message TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (profile_id) REFERENCES cv_profiles(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_job_applications_user_url ON cv_job_applications(user_id, job_url);
  CREATE INDEX IF NOT EXISTS idx_cv_job_applications_profile_status ON cv_job_applications(profile_id, status, created_at DESC);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS omni_channels (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    platform TEXT NOT NULL,
    access_token TEXT DEFAULT '',
    refresh_token TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1,
    auto_reply INTEGER DEFAULT 0,
    pin TEXT DEFAULT '',
    is_licensed INTEGER DEFAULT 0,
    license_key TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_omni_channels_user ON omni_channels(user_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_omni_channels_user_platform ON omni_channels(user_id, platform);

  CREATE TABLE IF NOT EXISTS omni_conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    external_sender_id TEXT NOT NULL,
    sender_name TEXT DEFAULT '',
    sender_avatar TEXT DEFAULT '',
    last_message TEXT DEFAULT '',
    unread_count INTEGER DEFAULT 0,
    thread_type TEXT DEFAULT 'user',
    is_pinned INTEGER DEFAULT 0,
    auto_reply INTEGER DEFAULT 0,
    auto_provider TEXT DEFAULT '',
    custom_name TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES omni_channels(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_omni_conversations_user ON omni_conversations(user_id, updated_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_omni_conversations_external ON omni_conversations(channel_id, external_sender_id);

  CREATE TABLE IF NOT EXISTS omni_messages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    external_id TEXT DEFAULT '',
    external_cli_id TEXT DEFAULT '',
    external_msg_type TEXT DEFAULT '',
    external_author_id TEXT DEFAULT '',
    external_author_name TEXT DEFAULT '',
    sender_type TEXT NOT NULL CHECK(sender_type IN ('customer', 'agent', 'system')),
    content TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    is_pinned INTEGER DEFAULT 0,
    pinned_at TEXT,
    reply_to_id TEXT DEFAULT '',
    reactions TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (conversation_id) REFERENCES omni_conversations(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_omni_messages_conversation ON omni_messages(conversation_id, created_at ASC);

  CREATE TABLE IF NOT EXISTS omni_sync_codes (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

try {
  db.exec("ALTER TABLE omni_messages ADD COLUMN external_id TEXT DEFAULT ''");
  console.log('[DB] Added external_id column to omni_messages');
} catch (e) {}
try {
  db.exec("ALTER TABLE omni_messages ADD COLUMN external_cli_id TEXT DEFAULT ''");
  console.log('[DB] Added external_cli_id column to omni_messages');
} catch (e) {}
try {
  db.exec("ALTER TABLE omni_messages ADD COLUMN external_msg_type TEXT DEFAULT ''");
  console.log('[DB] Added external_msg_type column to omni_messages');
} catch (e) {}
try {
  db.exec("ALTER TABLE omni_messages ADD COLUMN external_author_id TEXT DEFAULT ''");
  console.log('[DB] Added external_author_id column to omni_messages');
} catch (e) {}
try {
  db.exec("ALTER TABLE omni_messages ADD COLUMN external_author_name TEXT DEFAULT ''");
  console.log('[DB] Added external_author_name column to omni_messages');
} catch (e) {}
try {
  db.exec("ALTER TABLE omni_conversations ADD COLUMN auto_reply INTEGER DEFAULT 0");
  console.log('[DB] Added auto_reply column to omni_conversations');
} catch (e) {}
try {
  db.exec("ALTER TABLE omni_conversations ADD COLUMN auto_provider TEXT DEFAULT ''");
  console.log('[DB] Added auto_provider column to omni_conversations');
} catch (e) {}
try {
  db.exec("ALTER TABLE omni_channels ADD COLUMN auto_reply INTEGER DEFAULT 0");
  console.log('[DB] Added auto_reply column to omni_channels');
} catch (e) {}
try {
  db.exec("ALTER TABLE omni_messages ADD COLUMN is_pinned INTEGER DEFAULT 0");
  console.log('[DB] Added is_pinned column to omni_messages');
} catch (e) {}
try {
  db.exec("ALTER TABLE omni_messages ADD COLUMN pinned_at TEXT");
  console.log('[DB] Added pinned_at column to omni_messages');
} catch (e) {}
try {
  db.exec("ALTER TABLE omni_messages ADD COLUMN reply_to_id TEXT DEFAULT ''");
  console.log('[DB] Added reply_to_id column to omni_messages');
} catch (e) {}
try {
  db.exec("ALTER TABLE omni_messages ADD COLUMN reactions TEXT DEFAULT '{}'");
  console.log('[DB] Added reactions column to omni_messages');
} catch (e) {}
try {
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_omni_messages_external ON omni_messages(conversation_id, external_id) WHERE external_id != ''");
} catch (e) {}
try {
  db.exec("CREATE INDEX IF NOT EXISTS idx_omni_messages_user_day ON omni_messages(user_id, created_at)");
} catch (e) {}
try {
  db.exec("CREATE INDEX IF NOT EXISTS idx_omni_messages_pinned ON omni_messages(user_id, is_pinned, pinned_at DESC)");
} catch (e) {}

// Custom providers table (user-defined LLM providers)
db.exec(`
  CREATE TABLE IF NOT EXISTS custom_providers (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    label TEXT NOT NULL,
    type TEXT DEFAULT 'openai',
    base_url TEXT DEFAULT '',
    api_key TEXT DEFAULT '',
    model TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_providers_user_name ON custom_providers(user_id, name);
`);

export default db;
