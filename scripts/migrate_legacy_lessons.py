#!/usr/bin/env python3
"""One-off: migrate legacy "EnglishLesson" + "Lesson" rows SQLite → PostgreSQL.

The main migration (migrate_sqlite_to_pg.py) omitted the Prisma-style camelCase
tables "User", "EnglishLesson" and "Lesson", so the Tiếng Anh / Learn Code tabs
were empty after the cutover. This copies those lesson rows, remapping userId
from the SQLite User.id to the matching PostgreSQL "User".id (by name), and lets
SERIAL assign fresh row ids. It refuses to run if the target table is non-empty,
to avoid duplicates.
"""
import os
import sys
import sqlite3
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "backend"))
os.environ.setdefault("DB_DATABASE", "hagent")

import psycopg2

SQLITE_DB = PROJECT_ROOT / "data" / "hagent.db"
PG = {
    "host": os.getenv("DB_SERVER", "localhost"),
    "port": int(os.getenv("DB_PORT", "5432")),
    "dbname": os.getenv("DB_DATABASE", "hagent"),
    "user": os.getenv("DB_USERNAME", "hatnguyen"),
    "password": os.getenv("DB_PASSWORD", "Thaco@2018"),
}

TABLES = ["EnglishLesson", "Lesson"]
BOOL_COLS = {"completed"}


def build_user_map(sq, pg):
    """Map SQLite User.id -> PostgreSQL "User".id by name (create PG user if missing)."""
    cur = pg.cursor()
    mapping = {}
    for r in sq.execute('SELECT id, name, email, role, status FROM "User"').fetchall():
        cur.execute('SELECT id FROM "User" WHERE name = %s ORDER BY id LIMIT 1', (r["name"],))
        row = cur.fetchone()
        if row:
            mapping[r["id"]] = row[0]
        else:
            cur.execute(
                'INSERT INTO "User" (name, email, password, role, status) VALUES (%s,%s,%s,%s,%s) RETURNING id',
                (r["name"], r["email"] or f'{r["name"]}@legacy.local', "legacy",
                 r["role"] or "user", r["status"] or "approved"),
            )
            mapping[r["id"]] = cur.fetchone()[0]
    pg.commit()
    cur.close()
    return mapping


def pg_actual_columns(pg, table):
    """Return {lowercased_name: actual_name} for a PostgreSQL table."""
    cur = pg.cursor()
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name=%s", (table,))
    cols = {r[0].lower(): r[0] for r in cur.fetchall()}
    cur.close()
    return cols


def migrate(sq, pg, table, user_map):
    sq_cols = [r[1] for r in sq.execute(f'PRAGMA table_info("{table}")').fetchall()]
    pg_actual = pg_actual_columns(pg, table)

    cur = pg.cursor()
    cur.execute(f'SELECT COUNT(*) FROM "{table}"')
    existing = cur.fetchone()[0]
    if existing:
        print(f"  {table}: target has {existing} rows, skipping to avoid duplicates")
        cur.close()
        return 0

    # Map each SQLite column (except id) to its PG actual column name (case-insensitive).
    pairs = [(c, pg_actual[c.lower()]) for c in sq_cols
             if c != "id" and c.lower() in pg_actual]
    src_cols = [s for s, _ in pairs]
    dst_cols = [d for _, d in pairs]

    src_list = ", ".join(f'"{c}"' for c in src_cols)
    rows = sq.execute(f'SELECT {src_list} FROM "{table}"').fetchall()
    if not rows:
        print(f"  {table}: 0 source rows")
        cur.close()
        return 0

    placeholders = ", ".join(["%s"] * len(dst_cols))
    dst_list = ", ".join(f'"{c}"' for c in dst_cols)
    insert = f'INSERT INTO "{table}" ({dst_list}) VALUES ({placeholders})'

    n = 0
    for row in rows:
        vals = []
        for s in src_cols:
            v = row[s]
            if s == "userId":
                v = user_map.get(v, v)
            elif s in BOOL_COLS:
                v = bool(v) if v is not None else None
            vals.append(v)
        cur.execute(insert, vals)
        n += 1
    pg.commit()
    cur.close()
    print(f"  {table}: {n} rows migrated")
    return n


def main():
    sq = sqlite3.connect(str(SQLITE_DB))
    sq.row_factory = sqlite3.Row
    pg = psycopg2.connect(**PG)
    pg.autocommit = False
    try:
        umap = build_user_map(sq, pg)
        print("user map (sqlite -> pg):", umap)
        for t in TABLES:
            migrate(sq, pg, t, umap)
    finally:
        sq.close()
        pg.close()
    print("done.")


if __name__ == "__main__":
    main()
