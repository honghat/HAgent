from __future__ import annotations

import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from fastapi import Header
from api.services.user_store import resolve_user_id, get_user_by_id, get_connection

router = APIRouter(prefix="/api/learn/admin", tags=["learn"])


def get_admin_id(authorization: str = Header(None)) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="No token provided")
    token = authorization.replace("Bearer ", "").strip()
    uid = resolve_user_id(token)
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = get_user_by_id(uid)
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return uid


# ── Users ───────────────────────────────────────────────────────────────

@router.get("/users")
def list_users(admin_id: str = Depends(get_admin_id)):
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT id, username, display_name, role, created_at FROM users ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


class UserUpdate(BaseModel):
    id: str
    role: str | None = None
    displayName: str | None = None


@router.patch("/users")
def update_user_admin(body: UserUpdate, admin_id: str = Depends(get_admin_id)):
    conn = get_connection()
    try:
        updates = []
        params = []
        if body.role:
            updates.append("role = ?")
            params.append(body.role)
        if body.displayName:
            updates.append("display_name = ?")
            params.append(body.displayName)
        if updates:
            params.append(body.id)
            conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
            conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.delete("/users")
def delete_user_admin(id: str, admin_id: str = Depends(get_admin_id)):
    conn = get_connection()
    try:
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (id,))
        conn.execute("DELETE FROM users WHERE id = ?", (id,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ── Whisper control ─────────────────────────────────────────────────────

@router.get("/whisper")
async def check_whisper(admin_id: str = Depends(get_admin_id)):
    import aiohttp
    whisper_url = "http://127.0.0.1:9000"
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=3)) as s:
            async with s.get(f"{whisper_url}/health") as r:
                return {"available": r.ok, "url": whisper_url}
    except Exception:
        return {"available": False, "url": whisper_url}


@router.post("/whisper")
async def control_whisper(action: str, admin_id: str = Depends(get_admin_id)):
    import subprocess
    import os
    if action == "start":
        try:
            subprocess.run(["lsof", "-ti:9000"], capture_output=True, text=True, timeout=3)
            return {"message": "Whisper đang chạy"}
        except Exception:
            pass
        root_dir = "/Users/nguyenhat/HAgent/backend"
        python_path = os.path.join(root_dir, ".venv/bin/python")
        subprocess.Popen(
            [python_path, "-m", "whisper_server"],
            cwd=root_dir,
            stdout=open("/tmp/whisper.log", "w"),
            stderr=subprocess.STDOUT,
        )
        return {"message": "Đang khởi động Whisper..."}
    elif action == "stop":
        try:
            result = subprocess.run(["lsof", "-ti:9000"], capture_output=True, text=True, timeout=3)
            pid = result.stdout.strip()
            if pid:
                subprocess.run(["kill", "-9", pid], timeout=3)
                return {"message": "Đã tắt Whisper"}
        except Exception:
            pass
        return {"message": "Whisper không chạy"}
    raise HTTPException(status_code=400, detail="Invalid action")


# ── LuxTTS control ──────────────────────────────────────────────────────

@router.get("/luxtts")
async def check_luxtts(admin_id: str = Depends(get_admin_id)):
    import aiohttp
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=3)) as s:
            async with s.get("http://127.0.0.1:8880/health") as r:
                return {"running": r.ok}
    except Exception:
        return {"running": False}


@router.post("/luxtts")
async def control_luxtts(action: str, admin_id: str = Depends(get_admin_id)):
    import subprocess
    import os
    root_dir = "/Users/nguyenhat/HAgent/tts"
    python_path = os.environ.get("HATAI_PYTHON") or os.path.join(root_dir, ".venv/bin/python")
    lux_dir = os.path.join(root_dir, "LuxTTS")

    if action == "start":
        try:
            result = subprocess.run(["lsof", "-ti:8880"], capture_output=True, text=True, timeout=3)
            if result.stdout.strip():
                return {"message": "LuxTTS đang chạy rồi"}
        except Exception:
            pass
        log_file = "/tmp/luxtts.log"
        subprocess.Popen(
            f"cd {lux_dir} && nohup {python_path} server.py > {log_file} 2>&1 &",
            shell=True,
        )
        return {"message": "Đang khởi động LuxTTS..."}
    elif action == "stop":
        try:
            result = subprocess.run(["lsof", "-ti:8880"], capture_output=True, text=True, timeout=3)
            pid = result.stdout.strip()
            if pid:
                subprocess.run(["kill", "-9", pid], timeout=3)
                return {"message": "Đã tắt LuxTTS"}
        except Exception:
            pass
        return {"message": "LuxTTS không chạy"}
    raise HTTPException(status_code=400, detail="Invalid action")


# ── Shutdown server ─────────────────────────────────────────────────────

class ShutdownBody(BaseModel):
    password: str
    host: str = "100.69.50.64"


@router.post("/shutdown")
async def shutdown_server(body: ShutdownBody, admin_id: str = Depends(get_admin_id)):
    import subprocess
    import asyncssh
    try:
        async with asyncssh.connect(
            body.host, username="hatnguyen", password=body.password,
            known_hosts=None, connect_timeout=8,
        ) as conn:
            await conn.run(f"echo '{body.password}' | sudo -S shutdown now")
        return {"ok": True}
    except Exception as e:
        logging.exception("Shutdown failed")
        raise HTTPException(status_code=500, detail=str(e))


# ── Wake-on-LAN ─────────────────────────────────────────────────────────

@router.post("/wol")
async def wake_on_lan(admin_id: str = Depends(get_admin_id)):
    import socket
    mac = "9c:6b:00:17:93:7a"
    mac_bytes = bytes.fromhex(mac.replace(":", "").replace("-", ""))
    packet = b"\xff" * 6 + mac_bytes * 16
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.sendto(packet, ("192.168.1.255", 9))
        sock.close()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
