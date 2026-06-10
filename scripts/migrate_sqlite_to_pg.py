#!/usr/bin/env python3
"""
Migrate data from SQLite (data/hagent.db) + PostgreSQL (hatai) → PostgreSQL (hagent).

Usage:
    python scripts/migrate_sqlite_to_pg.py

This script:
1. Runs init_db() to create all tables in hagent DB
2. Copies all data from SQLite → hagent PostgreSQL
3. Copies finance tables from hatai → hagent PostgreSQL
"""

import os
import sys
import sqlite3
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

os.environ.setdefault("DB_DATABASE", "hagent")

import psycopg2
import psycopg2.extras
from urllib.parse import quote_plus


# ── Config ─────────────────────────────────────────────────────────────────

SQLITE_DB = PROJECT_ROOT / "data" / "hagent.db"

PG_HAGENT = {
    "host": os.getenv("DB_SERVER", "localhost"),
    "port": int(os.getenv("DB_PORT", "5432")),
    "dbname": "hagent",
    "user": os.getenv("DB_USERNAME", "hatnguyen"),
    "password": os.getenv("DB_PASSWORD", "Thaco@2018"),
}

PG_HATAI = {
    "host": os.getenv("DB_SERVER", "localhost"),
    "port": int(os.getenv("DB_PORT", "5432")),
    "dbname": "hatai",
    "user": os.getenv("DB_USERNAME", "hatnguyen"),
    "password": os.getenv("DB_PASSWORD", "Thaco@2018"),
}

# Tables to migrate from SQLite, in dependency order
SQLITE_TABLES = [
    "chat_sessions",
    "messages",
    "run_journals",
    "session_todos",
    "wiki_entries",
    "wiki_embeddings",
    "workflows",
    "workflow_runs",
    "workflow_run_steps",
    "workflow_artifacts",
    "workflow_nodes",
    "workflow_edges",
    "workflow_schedules",
    "auto_fetch_sources",
    "auto_fetch_seen",
    "user_cv_profile",
    "user_job_preferences",
    "cv_documents",
    "cached_jobs",
    "deleted_jobs",
    "self_evolution_events",
    "message_feedback",
    "self_evolution",
    "agent_goals",
    "goal_tasks",
    "omni_channels",
    "omni_conversations",
    "omni_messages",
    "omni_contacts",
    "omni_hidden_contacts",
    "omni_agent_auto_reply",
    "learn_lessons",
    "english_items",
    "cv_match_scores",
    "coach_reminders",
    "video_tasks",
    "entertainment_videos",
    "entertainment_video_captions",
    "entertainment_video_categories",
    "stories",
    "story_chapters",
    "editor_projects",
    "editor_assets",
    "editor_render_jobs",
    "auto_video_jobs",
    "learn_day_logs",
    "learn_mission",
    "learn_pomodoro",
    "learn_roadmap",
    "learn_ai_reports",
    "learn_code_sessions",
    "learn_settings",
    "reup_jobs",
    "agents",
    "music_tracks",
    "agent_todos",
    "audit_log",
    "scrape_runs",
    "task_results",
    "role_permissions",
    "service_port_labels",
    "video_publish_log",
    "state_meta",
    "omni_sync_codes",
    "telegram_config",
    "telegram_chat_links",
    "telegram_qr_sessions",
    "zalo_config",
    "google_accounts",
    "google_account_inventory",
    "google_oauth_pending",
    "google_oauth_results",
    "google_email_keepalive_config",
    "google_email_keepalive_deliveries",
    "cv_profiles",
    "cv_job_searches",
    "cv_job_applications",
    "drive_backup_maps",
    "drive_backup_runs",
]

# Finance tables to copy from hatai
FINANCE_TABLES = [
    "expenses",
    "diennuoc",
    "anuong",
    "accounts",
    "balance_records",
    "savings_books",
]


def get_sqlite_tables(conn):
    """Get list of actual tables in SQLite DB."""
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    return {row[0] for row in rows}


def get_sqlite_columns(conn, table):
    """Get column names for a SQLite table."""
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return [row[1] for row in rows]


def get_pg_columns(conn, table):
    """Get column names for a PostgreSQL table."""
    cur = conn.cursor()
    cur.execute(
        """SELECT column_name FROM information_schema.columns
           WHERE table_name = %s ORDER BY ordinal_position""",
        (table,),
    )
    cols = [row[0] for row in cur.fetchall()]
    cur.close()
    return cols


def get_pg_columns_with_types(conn, table):
    """Get column names and types for a PostgreSQL table."""
    cur = conn.cursor()
    cur.execute(
        """SELECT column_name, data_type FROM information_schema.columns
           WHERE table_name = %s ORDER BY ordinal_position""",
        (table,),
    )
    cols = {row[0]: row[1] for row in cur.fetchall()}
    cur.close()
    return cols


def migrate_sqlite_table(sqlite_conn, pg_conn, table, pg_columns_dict):
    """Migrate one table from SQLite to PostgreSQL."""
    # Get SQLite columns
    sqlite_cols = get_sqlite_columns(sqlite_conn, table)
    
    # Only migrate columns that exist in both
    common_cols = [c for c in sqlite_cols if c in pg_columns_dict]
    if not common_cols:
        print(f"  ⚠️  No common columns for {table}, skipping")
        return 0

    # Read all rows from SQLite
    col_list = ", ".join(f'"{c}"' for c in common_cols)
    rows = sqlite_conn.execute(f'SELECT {col_list} FROM "{table}"').fetchall()
    if not rows:
        print(f"  ⏭️  {table}: 0 rows (empty)")
        return 0

    # Batch insert into PostgreSQL
    placeholders = ", ".join(["%s"] * len(common_cols))
    pg_col_list = ", ".join(f'"{c}"' for c in common_cols)
    insert_sql = f'INSERT INTO "{table}" ({pg_col_list}) VALUES ({placeholders}) ON CONFLICT DO NOTHING'

    cur = pg_conn.cursor()
    batch_size = 500
    inserted = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        for row in batch:
            # Cast values based on PostgreSQL column types (especially booleans)
            val_list = []
            for c, val in zip(common_cols, row):
                col_type = pg_columns_dict[c].lower() if pg_columns_dict[c] else ""
                if "bool" in col_type:
                    val_list.append(bool(val) if val is not None else None)
                else:
                    val_list.append(val)
            try:
                cur.execute(insert_sql, tuple(val_list))
                inserted += 1
            except Exception as e:
                pg_conn.rollback()
                print(f"  ❌ Error inserting into {table}: {e}")
                pg_conn.commit()
                cur = pg_conn.cursor()
        pg_conn.commit()

    # Reset serial sequences for tables with SERIAL columns
    _reset_serial(pg_conn, table)

    print(f"  ✅ {table}: {inserted}/{len(rows)} rows migrated")
    return inserted


def migrate_finance_table(hatai_conn, hagent_conn, table):
    """Copy a finance table from hatai → hagent."""
    cur_src = hatai_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur_src.execute(f'SELECT * FROM "{table}"')
    rows = cur_src.fetchall()
    cur_src.close()

    if not rows:
        print(f"  ⏭️  {table}: 0 rows (empty)")
        return 0

    # Get columns from first row
    cols = list(rows[0].keys())
    placeholders = ", ".join(["%s"] * len(cols))
    col_list = ", ".join(f'"{c}"' for c in cols)
    insert_sql = f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders}) ON CONFLICT DO NOTHING'

    cur_dst = hagent_conn.cursor()
    inserted = 0
    for row in rows:
        try:
            cur_dst.execute(insert_sql, tuple(row[c] for c in cols))
            inserted += 1
        except Exception as e:
            hagent_conn.rollback()
            print(f"  ❌ Error inserting into {table}: {e}")
            hagent_conn.commit()
            cur_dst = hagent_conn.cursor()
    hagent_conn.commit()
    cur_dst.close()

    _reset_serial(hagent_conn, table)
    print(f"  ✅ {table} (from hatai): {inserted}/{len(rows)} rows migrated")
    return inserted


def _reset_serial(conn, table):
    """Reset SERIAL sequence to max(id) + 1 for a table."""
    cur = conn.cursor()
    try:
        # Check if table has an 'id' column that is serial
        cur.execute(
            """SELECT column_name, column_default FROM information_schema.columns
               WHERE table_name = %s AND column_default LIKE 'nextval%%'""",
            (table,),
        )
        serial_cols = cur.fetchall()
        for col_name, col_default in serial_cols:
            # Extract sequence name from default: nextval('tablename_id_seq'::regclass)
            import re
            m = re.search(r"nextval\('([^']+)'", col_default)
            if m:
                seq_name = m.group(1)
                cur.execute(f'SELECT MAX("{col_name}") FROM "{table}"')
                max_val = cur.fetchone()[0]
                if max_val is not None:
                    cur.execute(f"SELECT setval('{seq_name}', {max_val})")
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"  ⚠️  Could not reset serial for {table}: {e}")
    cur.close()


def migrate_users_table(sqlite_conn, pg_conn):
    """Migrate HAgent users table — special handling for auth users."""
    # HAgent SQLite users table has UUID ids, text passwords
    # PostgreSQL hagent has finance-style users table (integer id)
    # We need both: keep finance users table AND create hagent_users for auth

    # Create hagent_users table for auth (separate from finance 'users')
    cur = pg_conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS hagent_users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            display_name TEXT DEFAULT '',
            default_provider TEXT DEFAULT 'deepseek',
            claude_mode TEXT DEFAULT 'qwen',
            default_agent TEXT DEFAULT '',
            email TEXT DEFAULT '',
            avatar TEXT DEFAULT '',
            account_status TEXT DEFAULT 'active',
            expires_at TEXT DEFAULT '',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            expires_at TIMESTAMPTZ,
            FOREIGN KEY (user_id) REFERENCES hagent_users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            secret_hash TEXT DEFAULT '',
            device_name TEXT DEFAULT '',
            user_agent TEXT DEFAULT '',
            first_ip_address TEXT DEFAULT '',
            last_ip_address TEXT DEFAULT '',
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_active TIMESTAMPTZ,
            FOREIGN KEY (user_id) REFERENCES hagent_users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_devices_user_last_active
            ON devices(user_id, last_active DESC);
        CREATE TABLE IF NOT EXISTS custom_providers (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            label TEXT NOT NULL,
            type TEXT DEFAULT 'openai',
            base_url TEXT DEFAULT '',
            api_key TEXT DEFAULT '',
            model TEXT DEFAULT '',
            max_tokens INTEGER DEFAULT 4096,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    """)
    pg_conn.commit()

    # Migrate SQLite users → hagent_users
    sqlite_tables = get_sqlite_tables(sqlite_conn)
    if "users" in sqlite_tables:
        sqlite_cols = get_sqlite_columns(sqlite_conn, "users")
        pg_cols = get_pg_columns(pg_conn, "hagent_users")
        common = [c for c in sqlite_cols if c in pg_cols]
        if common:
            col_list_src = ", ".join(f'"{c}"' for c in common)
            rows = sqlite_conn.execute(f'SELECT {col_list_src} FROM users').fetchall()
            if rows:
                placeholders = ", ".join(["%s"] * len(common))
                col_list_dst = ", ".join(f'"{c}"' for c in common)
                insert_sql = f'INSERT INTO hagent_users ({col_list_dst}) VALUES ({placeholders}) ON CONFLICT DO NOTHING'
                cur2 = pg_conn.cursor()
                for row in rows:
                    try:
                        cur2.execute(insert_sql, tuple(row))
                    except Exception as e:
                        pg_conn.rollback()
                        print(f"  ❌ Error inserting user: {e}")
                        pg_conn.commit()
                        cur2 = pg_conn.cursor()
                pg_conn.commit()
                cur2.close()
                print(f"  ✅ hagent_users: {len(rows)} rows migrated")

    # Migrate sessions, devices, custom_providers
    for tbl in ["sessions", "devices", "custom_providers"]:
        if tbl in sqlite_tables:
            pg_cols_tbl = get_pg_columns_with_types(pg_conn, tbl)
            migrate_sqlite_table(sqlite_conn, pg_conn, tbl, pg_cols_tbl)

    cur.close()


def main():
    print("=" * 60)
    print("HAgent Database Migration: SQLite + hatai → hagent (PostgreSQL)")
    print("=" * 60)

    # Step 1: Init schema
    print("\n📋 Step 1: Creating tables in hagent DB...")
    from api.services.db import init_db
    init_db()
    print("  ✅ Schema created")

    # Step 2: Migrate SQLite data
    print(f"\n📦 Step 2: Migrating SQLite data from {SQLITE_DB}...")
    if not SQLITE_DB.exists():
        print(f"  ⚠️  SQLite DB not found at {SQLITE_DB}, skipping")
    else:
        sqlite_conn = sqlite3.connect(str(SQLITE_DB))
        sqlite_conn.row_factory = sqlite3.Row
        pg_conn = psycopg2.connect(**PG_HAGENT)
        pg_conn.autocommit = False

        actual_tables = get_sqlite_tables(sqlite_conn)
        print(f"  Found {len(actual_tables)} tables in SQLite")

        # Migrate auth users first (special handling)
        print("\n  🔑 Migrating auth users...")
        migrate_users_table(sqlite_conn, pg_conn)

        # Migrate other tables
        print("\n  📊 Migrating data tables...")
        for table in SQLITE_TABLES:
            if table not in actual_tables:
                print(f"  ⏭️  {table}: not in SQLite, skipping")
                continue
            # Skip 'users' — handled separately above
            if table == "users":
                continue
            pg_cols = get_pg_columns_with_types(pg_conn, table)
            if not pg_cols:
                print(f"  ⚠️  {table}: not in PostgreSQL schema, skipping")
                continue
            migrate_sqlite_table(sqlite_conn, pg_conn, table, pg_cols)

        sqlite_conn.close()
        pg_conn.close()

    # Step 3: Copy finance data from hatai
    print(f"\n💰 Step 3: Copying finance tables from hatai → hagent...")
    try:
        hatai_conn = psycopg2.connect(**PG_HATAI)
        hagent_conn = psycopg2.connect(**PG_HAGENT)
        hagent_conn.autocommit = False

        # First copy hatai 'users' table → hagent 'users' table (finance users with integer IDs)
        print("\n  👤 Copying finance users from hatai...")
        try:
            cur_src = hatai_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur_src.execute("SELECT * FROM users")
            users = cur_src.fetchall()
            cur_src.close()

            if users:
                # Create finance users table if not exists
                cur_dst = hagent_conn.cursor()
                cur_dst.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        id SERIAL PRIMARY KEY,
                        username VARCHAR(255) UNIQUE,
                        password VARCHAR(255),
                        email VARCHAR(255) UNIQUE,
                        full_name VARCHAR(255),
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW(),
                        role_id INTEGER DEFAULT 4,
                        is_active BOOLEAN DEFAULT TRUE
                    )
                """)
                hagent_conn.commit()

                cols = list(users[0].keys())
                placeholders = ", ".join(["%s"] * len(cols))
                col_list = ", ".join(f'"{c}"' for c in cols)
                for user in users:
                    try:
                        cur_dst.execute(
                            f'INSERT INTO users ({col_list}) VALUES ({placeholders}) ON CONFLICT DO NOTHING',
                            tuple(user[c] for c in cols),
                        )
                    except Exception:
                        hagent_conn.rollback()
                        hagent_conn.commit()
                        cur_dst = hagent_conn.cursor()
                hagent_conn.commit()
                cur_dst.close()
                _reset_serial(hagent_conn, "users")
                print(f"  ✅ users (finance): {len(users)} rows copied")
        except Exception as e:
            print(f"  ⚠️  Could not copy finance users: {e}")

        # Now copy other finance data from hatai
        for table in FINANCE_TABLES:
            try:
                migrate_finance_table(hatai_conn, hagent_conn, table)
            except Exception as e:
                print(f"  ❌ Error migrating {table}: {e}")

        hatai_conn.close()
        hagent_conn.close()
    except Exception as e:
        print(f"  ❌ Could not connect to hatai DB: {e}")

    # Step 4: Verify
    print(f"\n✅ Step 4: Verification...")
    try:
        pg_conn = psycopg2.connect(**PG_HAGENT)
        cur = pg_conn.cursor()
        
        verify_tables = [
            "chat_sessions", "messages", "omni_messages", "wiki_entries",
            "stories", "story_chapters", "self_evolution_events",
            "expenses", "diennuoc", "anuong", "accounts",
            "hagent_users", "agents",
        ]
        for table in verify_tables:
            try:
                cur.execute(f'SELECT COUNT(*) FROM "{table}"')
                count = cur.fetchone()[0]
                print(f"  {table}: {count} rows")
            except Exception:
                pg_conn.rollback()
                print(f"  {table}: ⚠️ table not found")
        
        cur.close()
        pg_conn.close()
    except Exception as e:
        print(f"  ❌ Verification failed: {e}")

    print("\n" + "=" * 60)
    print("Migration complete! Next steps:")
    print("  1. Update .env: DB_DATABASE=hagent")
    print("  2. pm2 restart hagent-fastapi")
    print("=" * 60)


if __name__ == "__main__":
    main()
