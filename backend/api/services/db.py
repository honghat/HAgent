"""
HAgent database layer — PostgreSQL via psycopg2.

Provides a compatibility wrapper so that all existing code using
sqlite3-style API (conn.execute("... ? ...", params)) works unchanged
against PostgreSQL.
"""

from __future__ import annotations

import logging
import os
import re
from contextlib import contextmanager
from urllib.parse import quote_plus
from pathlib import Path

import psycopg2
import psycopg2.extras

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DB_PATH = PROJECT_ROOT / "data" / "hagent.db"
DATA_DIR = DB_PATH.parent

# ── Connection config ──────────────────────────────────────────────────────

_DB_SERVER = os.getenv("DB_SERVER", "localhost")
_DB_DATABASE = os.getenv("DB_DATABASE", "hagent")
_DB_USERNAME = os.getenv("DB_USERNAME", "hatnguyen")
_DB_PASSWORD = os.getenv("DB_PASSWORD", "Thaco@2018")
_DB_PORT = int(os.getenv("DB_PORT", "5432"))


def _get_dsn() -> str:
    return (
        f"host={_DB_SERVER} port={_DB_PORT} "
        f"dbname={_DB_DATABASE} user={_DB_USERNAME} "
        f"password={_DB_PASSWORD}"
    )


# ── SQL Translation ───────────────────────────────────────────────────────

# Pre-compiled regex patterns for SQLite → PostgreSQL translation
_RE_PLACEHOLDER = re.compile(r"\?")
_RE_AUTOINCREMENT = re.compile(
    r"INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT",
    re.IGNORECASE,
)
_RE_DATETIME_NOW_LOCAL = re.compile(
    r"datetime\(\s*'now'\s*,\s*'localtime'\s*\)",
    re.IGNORECASE,
)
_RE_DATETIME_NOW = re.compile(
    r"datetime\(\s*'now'\s*\)",
    re.IGNORECASE,
)
_RE_DATETIME_NOW_OFFSET = re.compile(
    r"datetime\(\s*'now'\s*,\s*([^)]+)\)",
    re.IGNORECASE,
)
_RE_DATE_NOW_LOCAL = re.compile(
    r"date\(\s*'now'\s*,\s*'localtime'\s*\)",
    re.IGNORECASE,
)
_RE_DATE_NOW_LOCAL_OFFSET = re.compile(
    r"date\(\s*'now'\s*,\s*'localtime'\s*,\s*'(-?\d+)\s+day(?:s)?'\s*\)",
    re.IGNORECASE,
)
_RE_DATE_NOW = re.compile(
    r"date\(\s*'now'\s*\)",
    re.IGNORECASE,
)
_RE_DATE_COL = re.compile(
    r"date\(\s*(\w+(?:\.\w+)?)\s*\)",
    re.IGNORECASE,
)
_RE_DATETIME_COL = re.compile(
    r"datetime\(\s*([^\'\")\s]+)\s*\)",
    re.IGNORECASE,
)
_RE_COMPARE_AT_TIMESTAMP_LEFT = re.compile(
    r"\b(\w+(?:\.\w+)?_at|\w+(?:\.\w+)?At|last_active)\s*(<=|>=|<|>)",
    re.IGNORECASE,
)
_RE_COMPARE_AT_TIMESTAMP_RIGHT = re.compile(
    r"\b(<=|>=|<|>)\s*(\w+(?:\.\w+)?_at|\w+(?:\.\w+)?At|last_active)\b",
    re.IGNORECASE,
)
_RE_INSERT_OR_IGNORE = re.compile(
    r"INSERT\s+OR\s+IGNORE\s+INTO",
    re.IGNORECASE,
)
_RE_INSERT_OR_REPLACE = re.compile(
    r"INSERT\s+OR\s+REPLACE\s+INTO",
    re.IGNORECASE,
)
_RE_PRAGMA_TABLE_INFO = re.compile(
    r"PRAGMA\s+table_info\s*\(\s*\"?([^\")]+)\"?\s*\)",
    re.IGNORECASE,
)
_RE_PRAGMA = re.compile(r"^\s*PRAGMA\s+", re.IGNORECASE)
_RE_PRIMARY_KEY_CHECK = re.compile(
    r"PRIMARY\s+KEY\s+CHECK\s*\(\s*(\w+)\s*=\s*(\d+)\s*\)",
    re.IGNORECASE,
)
_RE_REAL_TYPE = re.compile(r"\bREAL\b", re.IGNORECASE)
_RE_USERS_TABLE = re.compile(r"\b(users)\b", re.IGNORECASE)
# Split SQL on string literals and already-quoted identifiers (captured group
# lands at odd indices in re.split output, so those segments are left untouched).
_RE_SQL_SEGMENT = re.compile(r"('(?:[^']|'')*'|\"[^\"]*\")", re.DOTALL)
_RE_BARE_WORD = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


def _quote_camel_identifiers(sql: str) -> str:
    """Quote case-sensitive camelCase identifiers for PostgreSQL.

    PostgreSQL folds unquoted identifiers to lowercase, but the legacy
    (Prisma-style) tables were created with quoted camelCase names, so a query
    like ``SELECT nextReviewAt FROM "EnglishLesson"`` looks for ``nextreviewat``
    and fails. We quote only the exact identifiers the schema stored
    case-sensitively, and only outside of string literals / existing quotes.
    """
    if not _CAMEL_QUOTED_IDENTS:
        return sql

    def _quote(text: str) -> str:
        return _RE_BARE_WORD.sub(
            lambda m: f'"{m.group(0)}"' if m.group(0) in _CAMEL_QUOTED_IDENTS else m.group(0),
            text,
        )

    parts = _RE_SQL_SEGMENT.split(sql)
    return "".join(seg if i % 2 == 1 else _quote(seg) for i, seg in enumerate(parts))


def _translate_sql(sql: str) -> str:
    """Translate SQLite SQL to PostgreSQL-compatible SQL."""
    if not sql or not sql.strip():
        return sql

    # Translate table \'users\' -> \'hagent_users\'
    sql = _RE_USERS_TABLE.sub("hagent_users", sql)

    # Translate PRAGMA table_info(table) -> SELECT column_name AS name ...
    def _replace_pragma_table_info(m) -> str:
        table_name = m.group(1).strip().strip('"\'')
        return f"SELECT column_name AS name FROM information_schema.columns WHERE table_name = '{table_name}'"

    sql = _RE_PRAGMA_TABLE_INFO.sub(_replace_pragma_table_info, sql)

    # Skip general PRAGMA statements
    if _RE_PRAGMA.match(sql):
        return ""

    # AUTOINCREMENT → SERIAL
    result = _RE_AUTOINCREMENT.sub("SERIAL PRIMARY KEY", sql)

    # PRIMARY KEY CHECK(id = 1) → PRIMARY KEY (PostgreSQL doesn't support CHECK in PK definition like this)
    result = _RE_PRIMARY_KEY_CHECK.sub(r"PRIMARY KEY", result)

    # date('now', 'localtime', '-N days') → CURRENT_DATE - INTERVAL 'N days'
    def _replace_date_offset(m):
        days = m.group(1)
        if days.startswith("-"):
            return f"(CURRENT_DATE - INTERVAL '{days[1:]} days')"
        return f"(CURRENT_DATE + INTERVAL '{days} days')"
    result = _RE_DATE_NOW_LOCAL_OFFSET.sub(_replace_date_offset, result)

    # datetime('now', offset) → NOW() + INTERVAL ...
    def _replace_datetime_offset(m):
        offset = m.group(1).strip().strip("'\"")
        if offset == "localtime":
            return "NOW()"
        if offset.startswith("-"):
            return f"(NOW() - INTERVAL '{offset[1:]}')"
        if offset.startswith("+"):
            return f"(NOW() + INTERVAL '{offset[1:]}')"
        return f"(NOW() + INTERVAL '{offset}')"
    result = _RE_DATETIME_NOW_OFFSET.sub(_replace_datetime_offset, result)

    # datetime('now', 'localtime') → NOW()
    result = _RE_DATETIME_NOW_LOCAL.sub("NOW()", result)

    # datetime('now') → NOW()
    result = _RE_DATETIME_NOW.sub("NOW()", result)

    # date('now', 'localtime') → CURRENT_DATE
    result = _RE_DATE_NOW_LOCAL.sub("CURRENT_DATE", result)

    # date('now') → CURRENT_DATE
    result = _RE_DATE_NOW.sub("CURRENT_DATE", result)

    # date(column) → column::date  (for casting)
    result = _RE_DATE_COL.sub(r"\1::date", result)

    # datetime(column) → column::timestamp  (for casting)
    result = _RE_DATETIME_COL.sub(r"\1::timestamp", result)

    # Compare column_at <= NOW() etc. → cast column to ::timestamptz
    result = _RE_COMPARE_AT_TIMESTAMP_LEFT.sub(r"\1::timestamptz \2", result)
    result = _RE_COMPARE_AT_TIMESTAMP_RIGHT.sub(r"\1 \2::timestamptz", result)

    # INSERT OR IGNORE INTO → INSERT INTO ... ON CONFLICT DO NOTHING
    if _RE_INSERT_OR_IGNORE.search(result):
        result = _RE_INSERT_OR_IGNORE.sub("INSERT INTO", result)
        # Append ON CONFLICT DO NOTHING if not already present
        if "ON CONFLICT" not in result.upper():
            result = result.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"

    # INSERT OR REPLACE INTO → handled specially per table
    if _RE_INSERT_OR_REPLACE.search(result):
        result = _handle_insert_or_replace(result)

    # REAL → DOUBLE PRECISION (only in DDL context)
    # Only apply in CREATE TABLE / ALTER TABLE context to avoid breaking data queries
    if any(kw in result.upper() for kw in ("CREATE TABLE", "ALTER TABLE", "ADD COLUMN")):
        result = _RE_REAL_TYPE.sub("DOUBLE PRECISION", result)

    # Translate is_public = 1/0 and completed = 1/0
    result = re.sub(r"\bis_public\s*=\s*1\b", "is_public = TRUE", result, flags=re.IGNORECASE)
    result = re.sub(r"\bis_public\s*=\s*0\b", "is_public = FALSE", result, flags=re.IGNORECASE)
    result = re.sub(r"\bcompleted\s*=\s*1\b", "completed = TRUE", result, flags=re.IGNORECASE)
    result = re.sub(r"\bcompleted\s*=\s*0\b", "completed = FALSE", result, flags=re.IGNORECASE)

    # For EnglishLesson and Lesson insert queries:
    if ("EnglishLesson" in result or "Lesson" in result) and "completed" in result:
        result = re.sub(r",\s*0,\s*0\s*\)$", ", FALSE, 0)", result)

    # Quote camelCase identifiers that PostgreSQL stores case-sensitively.
    result = _quote_camel_identifiers(result)

    # ? → %s  (parameter placeholders)
    result = _RE_PLACEHOLDER.sub("%s", result)

    return result


def _handle_insert_or_replace(sql: str) -> str:
    """Convert INSERT OR REPLACE to PostgreSQL upsert.

    This is a best-effort translation. It tries to extract the table name
    and use ON CONFLICT on the primary key columns.
    """
    result = _RE_INSERT_OR_REPLACE.sub("INSERT INTO", sql)

    # Extract table name
    m = re.search(r"INSERT\s+INTO\s+(\w+)", result, re.IGNORECASE)
    if not m:
        return result

    table = m.group(1).lower()

    # Known table primary keys for upsert
    pk_map = {
        "self_evolution": "id",
        "state_meta": "key",
        "learn_settings": "id",
        "learn_roadmap": "user_id, id",
        "google_accounts": "email",
    }

    pk = pk_map.get(table)
    if pk:
        # Extract column names from VALUES clause
        col_match = re.search(
            r"INSERT\s+INTO\s+\w+\s*\(([^)]+)\)\s*VALUES",
            result,
            re.IGNORECASE,
        )
        if col_match:
            cols = [c.strip().strip('"') for c in col_match.group(1).split(",")]
            pk_cols = [c.strip() for c in pk.split(",")]
            update_cols = [c for c in cols if c not in pk_cols]
            if update_cols:
                update_clause = ", ".join(f"{c} = EXCLUDED.{c}" for c in update_cols)
                result = (
                    result.rstrip().rstrip(";")
                    + f" ON CONFLICT ({pk}) DO UPDATE SET {update_clause}"
                )
            else:
                result = result.rstrip().rstrip(";") + f" ON CONFLICT ({pk}) DO NOTHING"
        else:
            result = result.rstrip().rstrip(";") + f" ON CONFLICT ({pk}) DO NOTHING"
    else:
        # Fallback: just do nothing on conflict
        result = result.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"

    return result


def _translate_ddl_script(script: str) -> str:
    """Translate a full DDL script (multiple statements) for PostgreSQL."""
    statements = []
    for stmt in script.split(";"):
        stmt = stmt.strip()
        if not stmt:
            continue
        translated = _translate_sql(stmt)
        if translated and translated.strip():
            statements.append(translated)
    return ";\n".join(statements) + ";" if statements else ""


# ── Cursor Compat ──────────────────────────────────────────────────────────

_CAMEL_CASE_MAP = {}
_CAMEL_QUOTED_IDENTS = set()  # identifiers stored case-sensitively (quoted in DDL)
try:
    from api.services.pg_schema import SCHEMA_STATEMENTS
    for stmt in SCHEMA_STATEMENTS:
        for match in re.findall(r'\b[a-zA-Z0-9_]+\b', stmt):
            if any(c.isupper() for c in match) and any(c.islower() for c in match):
                _CAMEL_CASE_MAP[match.lower()] = match
        # Identifiers quoted in the DDL keep their case in PostgreSQL, so queries
        # must quote them too. Columns added unquoted (e.g. gapNotes, strength)
        # are folded to lowercase and must NOT be quoted — they are excluded here.
        for ident in re.findall(r'"([A-Za-z_][A-Za-z0-9_]*)"', stmt):
            if any(c.isupper() for c in ident) and any(c.islower() for c in ident):
                _CAMEL_QUOTED_IDENTS.add(ident)
except Exception:
    pass
_CAMEL_CASE_MAP.update({
    "gapnotes": "gapNotes",
})

class RowCompat:
    """
    A compatibility wrapper that mimics sqlite3.Row.
    It supports:
      - Key-based access: row["col_name"] (case-insensitive fallback)
      - Index-based access: row[0]
      - Unpacking: val1, val2 = row (iterates over values)
      - Conversion to dict: dict(row) (uses keys() and __getitem__)
    """
    def __init__(self, data: dict, description):
        self._keys = []
        if description:
            mapped_data = {}
            for col in description:
                orig_name = col[0]
                mapped_name = _CAMEL_CASE_MAP.get(orig_name.lower(), orig_name)
                mapped_data[mapped_name] = data.get(orig_name)
                self._keys.append(mapped_name)
            self._data = mapped_data
        else:
            mapped_data = {}
            for k, v in data.items():
                mapped_name = _CAMEL_CASE_MAP.get(k.lower(), k)
                mapped_data[mapped_name] = v
                self._keys.append(mapped_name)
            self._data = mapped_data

    def __getitem__(self, key):
        if isinstance(key, int):
            if 0 <= key < len(self._keys):
                return self._data[self._keys[key]]
            raise IndexError("Index out of range")
        if key in self._data:
            return self._data[key]
        lower_key = key.lower()
        if lower_key in self._data:
            return self._data[lower_key]
        mapped_key = _CAMEL_CASE_MAP.get(lower_key)
        if mapped_key and mapped_key in self._data:
            return self._data[mapped_key]
        return self._data[key]

    def keys(self):
        return self._keys

    def values(self):
        return [self._data[k] for k in self._keys]

    def items(self):
        return [(k, self._data[k]) for k in self._keys]

    def get(self, key, default=None):
        if key in self._data:
            return self._data[key]
        lower_key = key.lower()
        if lower_key in self._data:
            return self._data[lower_key]
        mapped_key = _CAMEL_CASE_MAP.get(lower_key)
        if mapped_key and mapped_key in self._data:
            return self._data[mapped_key]
        return default

    def __iter__(self):
        return iter(self.values())

    def __len__(self):
        return len(self._keys)

    def __str__(self):
        return str(self._data)

    def __repr__(self):
        return repr(self._data)


def _adjust_params(sql: str, params):
    if not params:
        return params

    if isinstance(params, dict):
        new_params = dict(params)
        for key in ("completed", "is_public"):
            if key in new_params:
                val = new_params[key]
                if val == 1 and not isinstance(val, bool):
                    new_params[key] = True
                elif val == 0 and not isinstance(val, bool):
                    new_params[key] = False
                elif isinstance(val, int) and not isinstance(val, bool):
                    new_params[key] = bool(val)
        return new_params

    # Sequence type (list or tuple)
    is_tuple = isinstance(params, tuple)
    new_params = list(params)
    placeholders = list(re.finditer(r"\?|%s", sql))
    matches = list(re.finditer(r"\b(completed|is_public)\s*=\s*(?:\?|%s)", sql, re.IGNORECASE))
    for m in matches:
        start_pos = m.start()
        idx = sum(1 for p in placeholders if p.start() < start_pos)
        if idx < len(new_params):
            val = new_params[idx]
            if val == 1 and not isinstance(val, bool):
                new_params[idx] = True
            elif val == 0 and not isinstance(val, bool):
                new_params[idx] = False
            elif isinstance(val, int) and not isinstance(val, bool):
                new_params[idx] = bool(val)

    return tuple(new_params) if is_tuple else new_params


class _PgCursorCompat:
    """Wraps psycopg2 RealDictCursor to provide sqlite3-compatible API."""

    def __init__(self, conn, cursor):
        self._conn = conn
        self._cursor = cursor
        self.lastrowid = None
        self.rowcount = 0
        self.description = None
        self._executed = False

    def execute(self, sql: str, params=None):
        translated = _translate_sql(sql)
        if not translated or not translated.strip():
            self._executed = False
            self.rowcount = 0
            self.description = None
            return self
        try:
            if params:
                adjusted_params = _adjust_params(sql, params)
                self._cursor.execute(translated, adjusted_params)
            else:
                self._cursor.execute(translated)
        except Exception:
            logger.error("SQL error on: %s (params=%s)", translated[:200], params)
            raise
        self._executed = True
        self.lastrowid = getattr(self._cursor, "lastrowid", None)
        self.rowcount = self._cursor.rowcount
        self.description = self._cursor.description

        # Try to get lastrowid for INSERT statements
        if (
            self.lastrowid is None
            and translated.strip().upper().startswith("INSERT")
            and "RETURNING" not in translated.upper()
        ):
            try:
                temp_cur = self._conn.cursor()
                try:
                    temp_cur.execute("SELECT lastval()")
                    row = temp_cur.fetchone()
                    if row:
                        self.lastrowid = row[0]
                finally:
                    temp_cur.close()
            except Exception:
                pass

        return self

    def executemany(self, sql: str, seq_of_params):
        translated = _translate_sql(sql)
        if not translated or not translated.strip():
            self._executed = False
            self.rowcount = 0
            self.description = None
            return self
        try:
            self._cursor.executemany(translated, seq_of_params)
        except Exception:
            logger.error("SQL error on executemany: %s", translated[:200])
            raise
        self._executed = True
        self.rowcount = self._cursor.rowcount
        self.description = self._cursor.description
        return self

    def _wrap_row(self, row):
        if row is None:
            return None
        return RowCompat(row, self.description or self._cursor.description)

    def fetchone(self):
        if not self._executed:
            return None
        row = self._cursor.fetchone()
        return self._wrap_row(row)

    def fetchall(self):
        if not self._executed:
            return []
        rows = self._cursor.fetchall()
        desc = self.description or self._cursor.description
        return [RowCompat(r, desc) for r in rows] if rows else []

    def fetchmany(self, size=None):
        if not self._executed:
            return []
        if size is None:
            rows = self._cursor.fetchmany()
        else:
            rows = self._cursor.fetchmany(size)
        desc = self.description or self._cursor.description
        return [RowCompat(r, desc) for r in rows] if rows else []

    def close(self):
        self._cursor.close()

    def __iter__(self):
        return self

    def __next__(self):
        if not self._executed:
            raise StopIteration
        row = self._cursor.fetchone()
        if row is None:
            raise StopIteration
        return self._wrap_row(row)


# ── Connection Compat ──────────────────────────────────────────────────────

class PgConnectionCompat:
    """
    Wraps a psycopg2 connection to provide sqlite3-compatible API.

    Usage mirrors sqlite3:
        with get_connection() as conn:
            row = conn.execute("SELECT * FROM t WHERE id = ?", (some_id,)).fetchone()
            print(row["column_name"])
    """

    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql: str, params=None):
        compat = _PgCursorCompat(self._conn, self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor))
        return compat.execute(sql, params)

    def executescript(self, sql: str):
        """Execute a multi-statement SQL script (DDL)."""
        translated = _translate_ddl_script(sql)
        if not translated or not translated.strip():
            return
        cursor = self._conn.cursor()
        try:
            cursor.execute(translated)
        except Exception:
            logger.error("DDL script error: %s", translated[:500])
            raise
        cursor.close()

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()

    def cursor(self):
        return _PgCursorCompat(self._conn, self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor))

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is None:
            self._conn.commit()
        else:
            self._conn.rollback()
        self._conn.close()
        return False


# ── Public API (unchanged interface) ───────────────────────────────────────

def get_connection() -> PgConnectionCompat:
    conn = psycopg2.connect(_get_dsn())
    conn.autocommit = False
    return PgConnectionCompat(conn)


def get_db() -> PgConnectionCompat:
    """Alias for get_connection for FastAPI dependency injection or common use."""
    return get_connection()


def get_raw_connection(dbname: str | None = None):
    """Raw psycopg2 connection (KHÔNG dịch SQL) — dùng cho công cụ quản trị DB.

    Trả về connection psycopg2 nguyên bản để chạy SQL tuỳ ý từ admin mà không
    bị lớp tương thích SQLite biến đổi (vd '?', date(...)). Tự quản lý đóng/mở.
    `dbname` cho phép kết nối tới database khác trên cùng server (giữ host/user/pass).
    """
    conn = psycopg2.connect(
        host=_DB_SERVER, port=_DB_PORT,
        dbname=dbname or _DB_DATABASE,
        user=_DB_USERNAME, password=_DB_PASSWORD,
        connect_timeout=5,
    )
    conn.autocommit = False
    return conn


# ── DDL (init_db) ──────────────────────────────────────────────────────────

def init_db() -> None:
    try:
        from api.services.finance_db import Base, engine
        import api.services.finance_models
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        logger.error("Error creating SQLAlchemy tables: %s", e, exc_info=True)

    from api.services.pg_schema import SCHEMA_STATEMENTS
    with get_connection() as conn:
        for stmt in SCHEMA_STATEMENTS:
            if stmt.strip():
                cur = conn.cursor()
                try:
                    cur.execute(stmt)
                    conn.commit()
                except Exception as e:
                    pg_code = getattr(e, "pgcode", None)
                    if pg_code in ("42P07", "42710", "42701"):
                        conn.rollback()
                        continue
                    logger.error("Error executing DDL statement: %s. Error: %s", stmt[:300], e, exc_info=True)
                    raise
                finally:
                    cur.close()
        _migrate_personal_notes(conn)

def _migrate_personal_notes(conn) -> None:
    """Add pinned column to personal_notes if missing."""
    try:
        cursor = conn._conn.cursor()
        cursor.execute(
            """SELECT 1 FROM information_schema.columns
               WHERE table_name = 'personal_notes' AND column_name = 'pinned'"""
        )
        if not cursor.fetchone():
            cursor.execute("ALTER TABLE personal_notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0")
            conn.commit()
        cursor.close()
    except Exception as e:
        logger.info("_migrate_personal_notes: %s", e)

def _ensure_column(conn, table: str, column: str, ddl: str) -> None:
    """Add column if it doesn't exist (PostgreSQL version)."""
    try:
        cursor = conn._conn.cursor()
        cursor.execute(
            """SELECT 1 FROM information_schema.columns
               WHERE table_name = %s AND column_name = %s""",
            (table, column),
        )
        if not cursor.fetchone():
            # Translate DDL types
            pg_ddl = ddl.replace("REAL", "DOUBLE PRECISION")
            conn._conn.cursor().execute(
                f'ALTER TABLE {table} ADD COLUMN {column} {pg_ddl}'
            )
        cursor.close()
    except Exception as e:
        logger.warning("_ensure_column(%s, %s) failed: %s", table, column, e)
