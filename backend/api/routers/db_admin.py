"""DB Admin router — công cụ quản lý PostgreSQL kiểu Adminer (chỉ admin).

Có màn hình "đăng nhập" vào SQL server: admin nhập host/user/password/database
(hoặc kết nối nhanh tới DB ứng dụng), backend mở phiên và trả về connId. Các thao
tác sau (liệt kê bảng, xem cấu trúc, đọc dữ liệu, chạy SQL toàn quyền) dùng connId.

Thông tin đăng nhập chỉ giữ trong bộ nhớ server (dict _SESSIONS), không ghi đĩa.
Mọi endpoint yêu cầu rbac.require_admin. Prefix /api/admin/db.
"""

from __future__ import annotations

import datetime
import decimal
import re
import secrets
from typing import Any, Optional

import psycopg2
import psycopg2.extras
from psycopg2 import sql
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from api.services import rbac
from api.services.db import get_raw_connection

router = APIRouter(prefix="/api/admin/db", tags=["db_admin"])

MAX_ROWS = 1000  # trần số dòng trả về cho mỗi câu SELECT để bảo vệ giao diện

# connId -> creds. Chỉ trong RAM; mất khi restart (frontend sẽ tự kết nối lại).
_SESSIONS: dict[str, dict] = {}

_SYSTEM_TABLES = set()
try:
    from api.services.pg_schema import SCHEMA_STATEMENTS
    for stmt in SCHEMA_STATEMENTS:
        m = re.search(r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|([A-Za-z0-9_]+))', stmt, re.IGNORECASE)
        if m:
            tb = m.group(1) or m.group(2)
            _SYSTEM_TABLES.add(tb)
            _SYSTEM_TABLES.add(tb.lower())
except Exception:
    pass

try:
    from api.services.finance_db import Base
    import api.services.finance_models
    for tb in Base.metadata.tables:
        _SYSTEM_TABLES.add(tb)
        _SYSTEM_TABLES.add(tb.lower())
except Exception:
    pass

# Loại bỏ các bảng legacy không còn sử dụng bởi dự án HAgent
_LEGACY_TABLES = {
    "AIReport", "CodeSession", "DayLog", "MindmapNote", "MissionConfig",
    "PomodoroSession", "RoadmapItem", "Settings"
}
for tb in _LEGACY_TABLES:
    _SYSTEM_TABLES.discard(tb)
    _SYSTEM_TABLES.discard(tb.lower())


class ConnectBody(BaseModel):
    useDefault: bool = False
    host: Optional[str] = None
    port: Optional[int] = 5432
    dbname: Optional[str] = None
    user: Optional[str] = None
    password: Optional[str] = None


class QueryBody(BaseModel):
    connId: str
    sql: str


class DisconnectBody(BaseModel):
    connId: str


class RowInsert(BaseModel):
    connId: str
    values: dict


class RowUpdate(BaseModel):
    connId: str
    pk: dict
    set: dict


class RowDelete(BaseModel):
    connId: str
    pk: dict


class TableDrop(BaseModel):
    connId: str
    cascade: bool = False


class TableRename(BaseModel):
    connId: str
    newName: str


_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_TEXT_UDTS = {"text", "varchar", "bpchar", "name", "citext", "char"}


# ── Tiện ích ─────────────────────────────────────────────────────────────
def _coerce(v: Any) -> Any:
    """Chuyển giá trị Postgres về dạng JSON-an toàn cho frontend."""
    if v is None or isinstance(v, (bool, int, float, str, dict, list)):
        return v
    if isinstance(v, decimal.Decimal):
        return float(v)
    if isinstance(v, (datetime.datetime, datetime.date, datetime.time)):
        return v.isoformat()
    if isinstance(v, (bytes, memoryview)):
        return "\\x" + bytes(v).hex()
    return str(v)


def _row(record) -> dict:
    return {k: _coerce(val) for k, val in record.items()}


def _open(creds: dict):
    """Mở connection psycopg2 mới theo creds đã lưu."""
    if creds.get("default"):
        return get_raw_connection(creds.get("dbname"))
    return psycopg2.connect(
        host=creds["host"], port=int(creds.get("port") or 5432),
        dbname=creds["dbname"], user=creds["user"],
        password=creds.get("password") or "", connect_timeout=5,
    )


def _conn(connId: str):
    """Lấy creds theo connId và mở connection; 409 nếu phiên không còn."""
    creds = _SESSIONS.get(connId)
    if not creds:
        raise HTTPException(status_code=409, detail="CONN_EXPIRED")
    try:
        return _open(creds)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Mất kết nối: {str(e).strip()}")


def _table_names(cur) -> set[str]:
    cur.execute(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
    )
    return {r["table_name"] for r in cur.fetchall()}


def _columns_meta(cur, name: str) -> dict[str, str]:
    """{tên cột: udt_name} của bảng — dùng để ép kiểu khi ghi."""
    cur.execute(
        "SELECT column_name, udt_name FROM information_schema.columns "
        "WHERE table_schema = 'public' AND table_name = %s",
        (name,),
    )
    return {r["column_name"]: r["udt_name"] for r in cur.fetchall()}


def _ph(udt: Optional[str]):
    """Placeholder có ép kiểu theo udt (vd %s::int4) để nhận giá trị dạng chuỗi."""
    if udt and _IDENT_RE.match(udt):
        return sql.SQL("%s::" + udt)
    return sql.SQL("%s")


def _coerce_in(val: Any, udt: Optional[str]) -> Any:
    # Chuỗi rỗng cho cột không phải text → NULL (tránh ''::int4 lỗi).
    if isinstance(val, str) and val == "" and udt not in _TEXT_UDTS:
        return None
    return val


def _assign(cols: dict, meta: dict, params: list, sep: str):
    """Dựng 'col = %s::udt' nối bằng sep; bồi tham số vào params."""
    parts = []
    for col, val in cols.items():
        parts.append(sql.SQL("{} = ").format(sql.Identifier(col)) + _ph(meta[col]))
        params.append(_coerce_in(val, meta[col]))
    return sql.SQL(sep).join(parts)


def _check_cols(cols, meta):
    bad = [c for c in cols if c not in meta]
    if bad:
        raise HTTPException(status_code=400, detail=f"Cột không hợp lệ: {', '.join(bad)}")


# ── Kết nối / ngắt ───────────────────────────────────────────────────────
@router.post("/connect")
def connect(body: ConnectBody, request: Request):
    uid, actor = rbac.require_admin(request)
    if body.useDefault:
        creds = {"default": True}
        if body.dbname:
            creds["dbname"] = body.dbname
    else:
        if not (body.host and body.dbname and body.user):
            raise HTTPException(status_code=400, detail="Cần host, database và username")
        creds = {
            "host": body.host, "port": body.port or 5432, "dbname": body.dbname,
            "user": body.user, "password": body.password or "",
        }

    try:
        conn = _open(creds)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Không kết nối được: {str(e).strip()}")
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT current_database() AS db, current_user AS usr, version() AS ver")
        info = cur.fetchone()
        cur.execute(
            "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname"
        )
        databases = [r["datname"] for r in cur.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e).strip())
    finally:
        conn.close()

    connId = secrets.token_hex(16)
    _SESSIONS[connId] = creds
    server = "DB ứng dụng" if creds.get("default") else f"{creds['host']}:{creds['port']}"
    rbac.log_audit(uid, actor.get("username", ""), "db.connect", "database", info["db"],
                   {"server": server, "user": info["usr"]}, rbac.client_ip(request))
    return {
        "connId": connId, "server": server, "dbname": info["db"], "user": info["usr"],
        "version": (info["ver"] or "").split(" on ")[0], "databases": databases,
    }


@router.post("/disconnect")
def disconnect(body: DisconnectBody, request: Request):
    rbac.require_admin(request)
    _SESSIONS.pop(body.connId, None)
    return {"ok": True}


# ── Danh sách bảng ───────────────────────────────────────────────────────
@router.get("/tables")
def list_tables(request: Request, connId: str):
    rbac.require_admin(request)
    conn = _conn(connId)
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT t.table_name,
                   COALESCE(c.reltuples, -1)::bigint AS est_rows,
                   (SELECT count(*) FROM information_schema.columns ic
                    WHERE ic.table_schema = 'public' AND ic.table_name = t.table_name) AS columns
            FROM information_schema.tables t
            LEFT JOIN pg_class c ON c.relname = t.table_name AND c.relkind = 'r'
            WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
            ORDER BY t.table_name
            """
        )
        rows = cur.fetchall()
        # Bản đồ FK: bảng cha (được tham chiếu) -> các bảng con tham chiếu nó.
        cur.execute(
            """
            SELECT c.relname AS parent, ch.relname AS child
            FROM pg_constraint con
            JOIN pg_class ch ON ch.oid = con.conrelid
            JOIN pg_class c ON c.oid = con.confrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE con.contype = 'f' AND n.nspname = 'public'
            """
        )
        refmap: dict[str, set] = {}
        for r in cur.fetchall():
            if r["parent"] != r["child"]:
                refmap.setdefault(r["parent"], set()).add(r["child"])

        tables = []
        for r in rows:
            est = int(r["est_rows"])
            # reltuples = -1 nghĩa là bảng chưa ANALYZE → đếm chính xác (thường bảng nhỏ).
            if est < 0:
                cur.execute(sql.SQL("SELECT count(*) AS n FROM {}").format(sql.Identifier(r["table_name"])))
                est = int(cur.fetchone()["n"])
            is_system = r["table_name"] in _SYSTEM_TABLES or r["table_name"].lower() in _SYSTEM_TABLES
            tables.append({
                "name": r["table_name"], "rows": est, "columns": int(r["columns"]),
                "refs": sorted(refmap.get(r["table_name"], [])),
                "system": is_system,
            })
        return {"tables": tables}
    finally:
        conn.close()


# ── Cấu trúc bảng ────────────────────────────────────────────────────────
@router.get("/tables/{name}/columns")
def table_columns(name: str, request: Request, connId: str):
    rbac.require_admin(request)
    conn = _conn(connId)
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if name not in _table_names(cur):
            raise HTTPException(status_code=404, detail="Bảng không tồn tại")
        cur.execute(
            """
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = %s
            ORDER BY ordinal_position
            """,
            (name,),
        )
        cols = [
            {
                "name": r["column_name"],
                "type": r["data_type"],
                "nullable": r["is_nullable"] == "YES",
                "default": r["column_default"],
            }
            for r in cur.fetchall()
        ]
        # Khoá chính — phải truyền tên bảng đã quote để regclass không fold chữ thường.
        pks: set[str] = set()
        try:
            quoted = '"' + name.replace('"', '""') + '"'
            cur.execute(
                """
                SELECT a.attname AS col
                FROM pg_index i
                JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                WHERE i.indrelid = %s::regclass AND i.indisprimary
                """,
                (quoted,),
            )
            pks = {r["col"] for r in cur.fetchall()}
        except Exception:
            conn.rollback()
        for c in cols:
            c["pk"] = c["name"] in pks
        return {"columns": cols}
    finally:
        conn.close()


# ── Dữ liệu bảng (phân trang) ────────────────────────────────────────────
@router.get("/tables/{name}/rows")
def table_rows(name: str, request: Request, connId: str, limit: int = 50, offset: int = 0):
    rbac.require_admin(request)
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    conn = _conn(connId)
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if name not in _table_names(cur):
            raise HTTPException(status_code=404, detail="Bảng không tồn tại")
        ident = sql.Identifier(name)
        cur.execute(sql.SQL("SELECT count(*) AS n FROM {}").format(ident))
        total = int(cur.fetchone()["n"])
        cur.execute(
            sql.SQL("SELECT * FROM {} LIMIT %s OFFSET %s").format(ident),
            (limit, offset),
        )
        columns = [d.name for d in cur.description]
        rows = [_row(r) for r in cur.fetchall()]
        return {"columns": columns, "rows": rows, "total": total, "limit": limit, "offset": offset}
    finally:
        conn.close()


# ── Chạy SQL tuỳ ý (toàn quyền) ──────────────────────────────────────────
@router.post("/query")
def run_query(body: QueryBody, request: Request):
    uid, actor = rbac.require_admin(request)
    statement = (body.sql or "").strip()
    if not statement:
        raise HTTPException(status_code=400, detail="Câu lệnh SQL trống")
    conn = _conn(body.connId)
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        try:
            cur.execute(statement)
        except Exception as e:
            conn.rollback()
            raise HTTPException(status_code=400, detail=str(e).strip())

        if cur.description is not None:
            columns = [d.name for d in cur.description]
            records = cur.fetchmany(MAX_ROWS + 1)
            truncated = len(records) > MAX_ROWS
            rows = [_row(r) for r in records[:MAX_ROWS]]
            conn.commit()
            result = {"kind": "select", "columns": columns, "rows": rows,
                      "rowCount": len(rows), "truncated": truncated}
        else:
            affected = cur.rowcount
            conn.commit()
            result = {"kind": "write", "columns": [], "rows": [],
                      "rowCount": affected, "message": f"{affected} dòng bị ảnh hưởng"}

        rbac.log_audit(uid, actor.get("username", ""), "db.query", "database", "",
                       {"sql": statement[:500]}, rbac.client_ip(request))
        return result
    finally:
        conn.close()


# ── Sửa dữ liệu: thêm / cập nhật / xoá dòng ──────────────────────────────
@router.post("/tables/{name}/row")
def insert_row(name: str, body: RowInsert, request: Request):
    uid, actor = rbac.require_admin(request)
    values = body.values or {}
    if not values:
        raise HTTPException(status_code=400, detail="Không có dữ liệu để thêm")
    conn = _conn(body.connId)
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        meta = _columns_meta(cur, name)
        if not meta:
            raise HTTPException(status_code=404, detail="Bảng không tồn tại")
        _check_cols(values, meta)
        params: list = []
        cols = [sql.Identifier(c) for c in values]
        phs = []
        for c, v in values.items():
            phs.append(_ph(meta[c]))
            params.append(_coerce_in(v, meta[c]))
        q = sql.SQL("INSERT INTO {} ({}) VALUES ({}) RETURNING *").format(
            sql.Identifier(name), sql.SQL(", ").join(cols), sql.SQL(", ").join(phs))
        try:
            cur.execute(q, params)
            row = cur.fetchone()
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise HTTPException(status_code=400, detail=str(e).strip())
        rbac.log_audit(uid, actor.get("username", ""), "db.insert", "table", name,
                       {"cols": list(values)}, rbac.client_ip(request))
        return {"ok": True, "row": _row(row) if row else None}
    finally:
        conn.close()


@router.patch("/tables/{name}/row")
def update_row(name: str, body: RowUpdate, request: Request):
    uid, actor = rbac.require_admin(request)
    if not body.set:
        raise HTTPException(status_code=400, detail="Không có thay đổi")
    if not body.pk:
        raise HTTPException(status_code=400, detail="Thiếu khoá để xác định dòng")
    conn = _conn(body.connId)
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        meta = _columns_meta(cur, name)
        if not meta:
            raise HTTPException(status_code=404, detail="Bảng không tồn tại")
        _check_cols({**body.set, **body.pk}, meta)
        params: list = []
        set_sql = _assign(body.set, meta, params, ", ")
        where_sql = _assign(body.pk, meta, params, " AND ")
        q = sql.SQL("UPDATE {} SET {} WHERE {} RETURNING *").format(
            sql.Identifier(name), set_sql, where_sql)
        try:
            cur.execute(q, params)
            row = cur.fetchone()
            affected = cur.rowcount
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise HTTPException(status_code=400, detail=str(e).strip())
        rbac.log_audit(uid, actor.get("username", ""), "db.update", "table", name,
                       {"cols": list(body.set)}, rbac.client_ip(request))
        return {"ok": True, "affected": affected, "row": _row(row) if row else None}
    finally:
        conn.close()


@router.post("/tables/{name}/row/delete")
def delete_row(name: str, body: RowDelete, request: Request):
    uid, actor = rbac.require_admin(request)
    if not body.pk:
        raise HTTPException(status_code=400, detail="Thiếu khoá để xác định dòng")
    conn = _conn(body.connId)
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        meta = _columns_meta(cur, name)
        if not meta:
            raise HTTPException(status_code=404, detail="Bảng không tồn tại")
        _check_cols(body.pk, meta)
        params: list = []
        where_sql = _assign(body.pk, meta, params, " AND ")
        q = sql.SQL("DELETE FROM {} WHERE {}").format(sql.Identifier(name), where_sql)
        try:
            cur.execute(q, params)
            affected = cur.rowcount
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise HTTPException(status_code=400, detail=str(e).strip())
        rbac.log_audit(uid, actor.get("username", ""), "db.delete", "table", name,
                       {"pk": body.pk}, rbac.client_ip(request))
        return {"ok": True, "affected": affected}
    finally:
        conn.close()


# ── Đổi tên bảng ─────────────────────────────────────────────────────────
@router.post("/tables/{name}/rename")
def rename_table(name: str, body: TableRename, request: Request):
    uid, actor = rbac.require_admin(request)
    new_name = body.newName.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Tên bảng mới không được để trống")
    if not _IDENT_RE.match(new_name):
        raise HTTPException(status_code=400, detail="Tên bảng không hợp lệ")
    conn = _conn(body.connId)
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if name not in _table_names(cur):
            raise HTTPException(status_code=404, detail="Bảng không tồn tại")
        if new_name in _table_names(cur):
            raise HTTPException(status_code=400, detail="Tên bảng mới đã tồn tại")
        
        q = sql.SQL("ALTER TABLE {} RENAME TO {}").format(
            sql.Identifier(name), sql.Identifier(new_name)
        )
        try:
            cur.execute(q)
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise HTTPException(status_code=400, detail=str(e).strip())
        rbac.log_audit(uid, actor.get("username", ""), "db.rename_table", "table", name,
                       {"newName": new_name}, rbac.client_ip(request))
        return {"ok": True}
    finally:
        conn.close()


# ── Xoá bảng ─────────────────────────────────────────────────────────────
@router.post("/tables/{name}/drop")
def drop_table(name: str, body: TableDrop, request: Request):
    uid, actor = rbac.require_admin(request)
    conn = _conn(body.connId)
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if name not in _table_names(cur):
            raise HTTPException(status_code=404, detail="Bảng không tồn tại")
        q = sql.SQL("DROP TABLE {} {}").format(
            sql.Identifier(name), sql.SQL("CASCADE" if body.cascade else "RESTRICT"))
        try:
            cur.execute(q)
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise HTTPException(status_code=400, detail=str(e).strip())
        rbac.log_audit(uid, actor.get("username", ""), "db.drop", "table", name,
                       {"cascade": body.cascade}, rbac.client_ip(request))
        return {"ok": True}
    finally:
        conn.close()
