import json
import asyncio
import errno
import os
import re
import signal
import socket
import subprocess
import time
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import asyncio
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel, Field

from api.routers.auth import _get_user_id
from api.services.db import get_connection

router = APIRouter(prefix="/services", tags=["services"])

_PM2_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$")
_PM2_RESERVED_NAMES = {"all"}
_ROOT_DIR = Path(__file__).resolve().parents[3]
_ECOSYSTEM_CONFIG = _ROOT_DIR / "ecosystem.config.cjs"


def _validate_pm2_name(name: str) -> str:
    name = (name or "").strip()
    if not _PM2_NAME_RE.match(name) or name.lower() in _PM2_RESERVED_NAMES:
        raise HTTPException(status_code=400, detail="Tên service không hợp lệ")
    return name


def _pm2(args: list[str], timeout: int = 20) -> tuple[bool, str]:
    try:
        r = subprocess.run(["pm2", *args], capture_output=True, text=True, timeout=timeout)
        return r.returncode == 0, (r.stdout or r.stderr).strip()
    except subprocess.TimeoutExpired:
        return False, "pm2 timeout"
    except FileNotFoundError:
        return False, "pm2 không cài đặt"
    except Exception as e:
        return False, str(e)


def _pm2_describe(name: str) -> bool:
    ok, _ = _pm2(["describe", name], timeout=10)
    return ok


def _pm2_jlist(timeout: int = 20) -> tuple[bool, list[dict], str]:
    ok, out = _pm2(["jlist"], timeout=timeout)
    if not ok:
        return False, [], out
    try:
        procs = json.loads(out)
    except json.JSONDecodeError:
        return False, [], "pm2 jlist trả về dữ liệu lạ"
    if not isinstance(procs, list):
        return False, [], "pm2 jlist trả về dữ liệu lạ"
    return True, procs, ""


def _pm2_find(name: str) -> tuple[Optional[dict], str]:
    ok, procs, msg = _pm2_jlist(timeout=10)
    if not ok:
        return None, msg
    for proc in procs:
        if proc.get("name") == name:
            return proc, ""
    return None, ""


def _safe_pid(value) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _pm2_status(proc: Optional[dict]) -> str:
    if not proc:
        return "unknown"
    env = proc.get("pm2_env", {}) or {}
    return str(env.get("status") or "unknown")


def _pid_alive(pid: int) -> bool:
    if pid <= 1:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def _child_pids(pid: int) -> list[int]:
    try:
        result = subprocess.run(
            ["pgrep", "-P", str(pid)],
            capture_output=True,
            text=True,
            timeout=2,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []
    children: list[int] = []
    for line in result.stdout.splitlines():
        child = _safe_pid(line.strip())
        if child > 1:
            children.append(child)
    return children


def _process_tree(pid: int) -> list[int]:
    seen: set[int] = set()
    ordered: list[int] = []
    stack = [pid]
    while stack:
        parent = stack.pop()
        for child in _child_pids(parent):
            if child in seen:
                continue
            seen.add(child)
            ordered.append(child)
            stack.append(child)
    return [*reversed(ordered), pid]


def _signal_pids(pids: list[int], sig: int) -> list[int]:
    signaled: list[int] = []
    for pid in pids:
        if pid <= 1 or not _pid_alive(pid):
            continue
        try:
            os.kill(pid, sig)
            signaled.append(pid)
        except ProcessLookupError:
            continue
        except PermissionError:
            continue
    return signaled


def _wait_pids_exit(pids: list[int], timeout: float) -> list[int]:
    deadline = time.monotonic() + timeout
    remaining = [pid for pid in pids if _pid_alive(pid)]
    while remaining and time.monotonic() < deadline:
        time.sleep(0.2)
        remaining = [pid for pid in pids if _pid_alive(pid)]
    return remaining

REMOTE_HOSTS = [
    {"host": "100.69.50.64", "user": "hatnguyen", "name": "hat-linux"},
]

REMOTE_MACHINE_HOST = os.environ.get("SSH_REMOTE_HOST", "100.69.50.64")
REMOTE_MACHINE_USER = os.environ.get("SSH_REMOTE_USER", "hatnguyen")
REMOTE_MACHINE_PORT = int(os.environ.get("SSH_REMOTE_PORT", "22"))


class PortItem(BaseModel):
    port: int
    pid: int
    fd: Optional[int] = None
    command: str = ""
    fullCommand: str = ""
    cwd: str = ""
    name: str = ""
    user: str = ""
    customProject: str = ""
    customLabel: str = ""


class PortsResponse(BaseModel):
    ok: bool
    ports: List[PortItem]
    scannedAt: str


class RemoteKillRequest(BaseModel):
    host: str
    user: str
    pid: int
    signal: str = "SIGTERM"


class RemoteKillResponse(BaseModel):
    ok: bool
    message: str = ""


class RemotePortsResponse(BaseModel):
    ok: bool
    hosts: list[dict]  # each: { host, name, ports: [...], scannedAt }


class RemoteMachineStatusResponse(BaseModel):
    ok: bool
    host: str
    user: str
    port: int
    state: str
    online: bool
    sshReachable: bool
    detail: str
    checkedAt: str


class KillRequest(BaseModel):
    pid: int
    signal: str = "SIGTERM"


class KillResponse(BaseModel):
    ok: bool
    message: str = ""


class PortLabelBody(BaseModel):
    project: str = Field(default="", max_length=80)
    label: str = Field(default="", max_length=120)


def _init_port_label_table() -> None:
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS service_port_labels (
                user_id TEXT NOT NULL,
                port INTEGER NOT NULL,
                project TEXT NOT NULL DEFAULT '',
                label TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, port)
            )
            """
        )


def _load_port_labels(user_id: str) -> dict[int, dict[str, str]]:
    _init_port_label_table()
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT port, project, label FROM service_port_labels WHERE user_id = ?",
            (user_id,),
        ).fetchall()
    return {
        int(row["port"]): {
            "project": row["project"] or "Tùy chỉnh",
            "label": row["label"] or "",
        }
        for row in rows
    }


def _apply_port_labels(ports: list[PortItem], labels: dict[int, dict[str, str]]) -> None:
    for item in ports:
        label = labels.get(int(item.port))
        if not label:
            continue
        item.customProject = label["project"]
        item.customLabel = label["label"]


def _probe_remote_machine() -> dict:
    host = REMOTE_MACHINE_HOST
    port = REMOTE_MACHINE_PORT
    try:
        with socket.create_connection((host, port), timeout=2.5):
            return {
                "state": "online",
                "online": True,
                "sshReachable": True,
                "detail": f"Remote đang bật, SSH {host}:{port} reachable.",
            }
    except OSError as exc:
        code = getattr(exc, "errno", None)
        if code == errno.ECONNREFUSED:
            return {
                "state": "ssh_unavailable",
                "online": True,
                "sshReachable": False,
                "detail": f"Remote có phản hồi nhưng SSH port {port} đang đóng.",
            }
        if code in {errno.ETIMEDOUT, errno.EHOSTUNREACH, errno.ENETUNREACH} or isinstance(exc, socket.timeout):
            return {
                "state": "offline",
                "online": False,
                "sshReachable": False,
                "detail": f"Không kết nối được {host}:{port}. Remote có thể đang tắt/sleep hoặc Tailscale chưa online.",
            }
        return {
            "state": "unknown",
            "online": False,
            "sshReachable": False,
            "detail": str(exc),
        }


_REMOTE_MAC = "9c:6b:00:17:93:7a"
_REMOTE_LAN = "192.168.1.13"
_REMOTE_SUBNET = "192.168.1.0/24"


def _ssh_cmd(host: str, cmd: str, timeout: int = 5) -> str | None:
    try:
        r = subprocess.run(
            ["ssh", "-o", "ConnectTimeout=5", "-o", "BatchMode=yes",
             "-o", "StrictHostKeyChecking=no", f"{REMOTE_MACHINE_USER}@{host}", cmd],
            capture_output=True, text=True, timeout=timeout,
        )
        return r.stdout.strip() if r.returncode == 0 else None
    except Exception:
        return None


def _tailscale_ip() -> str:
    return REMOTE_MACHINE_HOST


@router.get("/remote-machine/lan-ip")
async def remote_machine_lan_ip(request: Request):
    """Dò tìm địa chỉ LAN của máy remote khi Tailscale lỗi."""
    _get_user_id(request)
    ts_ip = _tailscale_ip()
    discovered: list[dict] = []
    lan_ip: str | None = None

    # 1. Thử Tailscale → SSH vào remote lấy LAN IP
    try:
        with socket.create_connection((ts_ip, REMOTE_MACHINE_PORT), timeout=2):
            r = _ssh_cmd(ts_ip, "ip -4 addr show | grep -oP 'inet \\K[\\d.]+' | grep -v '127\\.0\\.0\\.1' | head -1")
            if r:
                lan_ip = r
                discovered.append({"via": "tailscale", "ip": ts_ip, "lan_ip": lan_ip})
    except Exception:
        pass

    # 2. Thử LAN IP biết trước
    if not lan_ip:
        try:
            with socket.create_connection((_REMOTE_LAN, REMOTE_MACHINE_PORT), timeout=2):
                lan_ip = _REMOTE_LAN
                discovered.append({"via": "known_lan", "ip": _REMOTE_LAN})
        except Exception:
            pass

    # 3. Quét ARP cache local tìm MAC của remote
    arp_entries: list[dict] = []
    try:
        r = subprocess.run(["arp", "-a"], capture_output=True, text=True, timeout=5)
        for line in r.stdout.split("\n"):
            if _REMOTE_MAC.lower() in line.lower() or _REMOTE_MAC[:8].lower() in line.lower():
                parts = line.split()
                for p in parts:
                    if p.count(".") == 3 and not p.startswith("("):
                        ip = p.strip("()")
                        arp_entries.append({"ip": ip, "source": "arp", "mac": _REMOTE_MAC})
                        if not lan_ip:
                            lan_ip = ip
    except Exception:
        pass

    # 4. Ping sweep tìm IP có MAC trùng
    if not lan_ip:
        try:
            base = "192.168.1."
            import concurrent.futures
            def _ping(host: str) -> bool:
                return subprocess.run(["ping", "-c1", "-W1", host],
                                      capture_output=True, timeout=2).returncode == 0
            with concurrent.futures.ThreadPoolExecutor(max_workers=20) as ex:
                futures = {ex.submit(_ping, f"{base}{i}"): i for i in range(2, 255)}
                alive = [f"{base}{futures[f].result()}" for f in concurrent.futures.as_completed(futures) if futures[f].result()]
            # Với mỗi IP alive, thử SSH
            for ip in alive:
                try:
                    with socket.create_connection((ip, REMOTE_MACHINE_PORT), timeout=1):
                        # Verify bằng hostname
                        hn = _ssh_cmd(ip, "hostname", timeout=3)
                        if hn and "hat" in hn.lower():
                            lan_ip = ip
                            arp_entries.append({"ip": ip, "source": "ping_sweep_ssh", "hostname": hn})
                            break
                except Exception:
                    pass
        except Exception:
            pass

    # 5. Kết luận
    if lan_ip:
        # Cập nhật known LAN IP cho lần sau
        if lan_ip != _REMOTE_LAN:
            pass  # sẽ lưu lại nếu cần
        return {
            "ok": True,
            "lan_ip": lan_ip,
            "mac": _REMOTE_MAC,
            "discovered_via": discovered,
            "arp_hits": arp_entries,
            "tailscale_down": not any(d.get("via") == "tailscale" for d in discovered),
            "instructions": f"ssh {REMOTE_MACHINE_USER}@{lan_ip}",
            "checkedAt": datetime.now().isoformat(),
        }

    return {
        "ok": False,
        "lan_ip": None,
        "mac": _REMOTE_MAC,
        "discovered_via": discovered,
        "arp_hits": arp_entries,
        "tailscale_down": True,
        "instructions": "Không tìm thấy remote trong mạng LAN. Kiểm tra remote có bật không, hoặc dùng Wake-on-LAN.",
        "checkedAt": datetime.now().isoformat(),
    }


@router.get("/remote-machine/status", response_model=RemoteMachineStatusResponse)
async def remote_machine_status(request: Request):
    _get_user_id(request)
    probed = await asyncio.to_thread(_probe_remote_machine)
    return RemoteMachineStatusResponse(
        ok=True,
        host=REMOTE_MACHINE_HOST,
        user=REMOTE_MACHINE_USER,
        port=REMOTE_MACHINE_PORT,
        checkedAt=datetime.now().isoformat(),
        **probed,
    )


@router.get("/ports", response_model=PortsResponse)
async def list_ports(request: Request):
    user_id = _get_user_id(request)
    """List all listening ports with process info (macOS/Linux). Optimized: 1 lsof + 1 ps batch."""
    try:
        result = subprocess.run(
            ["lsof", "-iTCP", "-sTCP:LISTEN", "-P", "-n"],
            capture_output=True, text=True, timeout=8,
        )
        use_lsof = result.returncode == 0
        if not use_lsof:
            result = subprocess.run(
                ["ss", "-tlnp"], capture_output=True, text=True, timeout=8,
            )
            if result.returncode != 0:
                return PortsResponse(ok=True, ports=[], scannedAt=datetime.now().isoformat())

        ports: list[PortItem] = []
        lines = result.stdout.strip().split("\n")
        pids_seen: set[int] = set()
        raw_rows: list[dict] = []

        if use_lsof:
            seen: set[tuple[int, int]] = set()
            for line in lines[1:]:
                parts = line.split()
                if len(parts) < 9:
                    continue
                command = parts[0]
                if not parts[1].isdigit():
                    continue
                pid = int(parts[1])
                user = parts[2]
                fd = parts[3]
                address = parts[8]
                if ":" not in address:
                    continue
                port_str = address.rsplit(":", 1)[-1]
                try:
                    port = int(port_str)
                except ValueError:
                    continue
                key = (port, pid)
                if key in seen:
                    continue
                seen.add(key)
                pids_seen.add(pid)
                raw_rows.append({
                    "port": port, "pid": pid, "command": command, "user": user, "fd": fd,
                })
        else:
            for line in lines[1:]:
                parts = line.split()
                if len(parts) < 5:
                    continue
                local = parts[3]
                if ":" not in local:
                    continue
                try:
                    port = int(local.rsplit(":", 1)[-1])
                except ValueError:
                    continue
                pid = 0
                command = ""
                for p in parts[5:]:
                    if "pid=" in p:
                        try:
                            pid = int(p.split("pid=")[1].split(",")[0].rstrip(")"))
                        except Exception:
                            pass
                    if 'users:(("' in p:
                        try:
                            command = p.split('users:(("')[1].split('"')[0]
                        except Exception:
                            pass
                if pid:
                    pids_seen.add(pid)
                raw_rows.append({
                    "port": port, "pid": pid, "command": command, "user": "", "fd": "",
                })

        # Batch fetch full command for all pids — 1 ps call
        cmd_map: dict[int, str] = {}
        if pids_seen:
            try:
                ps = subprocess.run(
                    ["ps", "-o", "pid=,command=", "-p", ",".join(str(p) for p in pids_seen)],
                    capture_output=True, text=True, timeout=5,
                )
                if ps.returncode == 0:
                    for ln in ps.stdout.strip().split("\n"):
                        ln = ln.strip()
                        if not ln:
                            continue
                        sp = ln.split(None, 1)
                        if len(sp) == 2 and sp[0].isdigit():
                            cmd_map[int(sp[0])] = sp[1]
            except Exception:
                pass

        # Batch fetch cwd for all pids — 1 lsof call
        cwd_map: dict[int, str] = {}
        if pids_seen:
            try:
                cwd_proc = subprocess.run(
                    ["lsof", "-p", ",".join(str(p) for p in pids_seen), "-d", "cwd", "-Fpn"],
                    capture_output=True, text=True, timeout=5,
                )
                if cwd_proc.returncode == 0 or cwd_proc.stdout:
                    cur_pid = 0
                    for ln in cwd_proc.stdout.split("\n"):
                        if not ln:
                            continue
                        if ln.startswith("p"):
                            try:
                                cur_pid = int(ln[1:])
                            except ValueError:
                                cur_pid = 0
                        elif ln.startswith("n") and cur_pid:
                            cwd_map[cur_pid] = ln[1:]
            except Exception:
                pass

        for r in raw_rows:
            fd_val = r.get("fd", "")
            try:
                fd_int = int(fd_val.rstrip("u")) if fd_val and fd_val.rstrip("u").isdigit() else None
            except Exception:
                fd_int = None
            full_cmd = cmd_map.get(r["pid"], "")
            cwd_val = cwd_map.get(r["pid"], "")
            # Fallback: nếu cwd không đọc được (system process), lấy directory của exec
            if not cwd_val and full_cmd:
                exe = full_cmd.split()[0] if full_cmd else ""
                if exe.startswith("/"):
                    cwd_val = exe.rsplit("/", 1)[0] or "/"
            ports.append(PortItem(
                port=r["port"], pid=r["pid"], fd=fd_int,
                command=r["command"], fullCommand=full_cmd,
                cwd=cwd_val, name=r["command"], user=r.get("user", ""),
            ))

        _apply_port_labels(ports, _load_port_labels(user_id))
        return PortsResponse(
            ok=True, ports=ports, scannedAt=datetime.now().isoformat(),
        )
    except Exception:
        return PortsResponse(ok=True, ports=[], scannedAt=datetime.now().isoformat())


@router.put("/ports/labels/{port}")
async def upsert_port_label(port: int, body: PortLabelBody, request: Request):
    user_id = _get_user_id(request)
    if port < 1 or port > 65535:
        raise HTTPException(status_code=400, detail="Port không hợp lệ")
    project = (body.project or "").strip() or "Tùy chỉnh"
    label = (body.label or "").strip()
    _init_port_label_table()
    with get_connection() as conn:
        if not label:
            conn.execute(
                "DELETE FROM service_port_labels WHERE user_id = ? AND port = ?",
                (user_id, port),
            )
            return {"ok": True, "deleted": True}
        conn.execute(
            """
            INSERT INTO service_port_labels (user_id, port, project, label, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, port) DO UPDATE SET
              project = excluded.project,
              label = excluded.label,
              updated_at = CURRENT_TIMESTAMP
            """,
            (user_id, port, project[:80], label[:120]),
        )
    return {"ok": True, "port": port, "project": project[:80], "label": label[:120]}


@router.delete("/ports/labels/{port}")
async def delete_port_label(port: int, request: Request):
    user_id = _get_user_id(request)
    if port < 1 or port > 65535:
        raise HTTPException(status_code=400, detail="Port không hợp lệ")
    _init_port_label_table()
    with get_connection() as conn:
        conn.execute(
            "DELETE FROM service_port_labels WHERE user_id = ? AND port = ?",
            (user_id, port),
        )
    return {"ok": True, "deleted": True}


@router.post("/ports/kill", response_model=KillResponse)
async def kill_port_process(req: KillRequest, request: Request):
    _get_user_id(request)
    """Kill a process by PID."""
    try:
        signal = req.signal if req.signal in ("SIGTERM", "SIGKILL", "SIGINT") else "SIGTERM"
        result = subprocess.run(
            ["kill", f"-{signal}", str(req.pid)],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            return KillResponse(ok=True, message=f"Sent {signal} to PID {req.pid}")
        else:
            return KillResponse(ok=False, message=result.stderr or f"Failed to kill PID {req.pid}")
    except Exception as e:
        return KillResponse(ok=False, message=str(e))


@router.get("/ports/remote", response_model=RemotePortsResponse)
async def list_remote_ports(request: Request):
    user_id = _get_user_id(request)
    """Scan all remote machines' ports via SSH."""
    results = []
    now = datetime.now().isoformat()
    labels = _load_port_labels(user_id)
    for rh in REMOTE_HOSTS:
        host = rh["host"]
        user = rh["user"]
        name = rh["name"]
        try:
            result = subprocess.run(
                ["ssh", "-o", "ConnectTimeout=5", "-o", "BatchMode=yes",
                 f"{user}@{host}",
                 "lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null || ss -tlnp 2>/dev/null || echo ''"],
                capture_output=True,
                text=True,
                timeout=20,
            )
            if result.returncode != 0 or not result.stdout.strip():
                results.append({"host": host, "name": name, "user": user, "ports": [], "scannedAt": now})
                continue

            ports = []
            lines = result.stdout.strip().split("\n")
            for line in lines[1:]:
                parts = line.split()
                if len(parts) < 9:
                    continue
                command = parts[0]
                pid = int(parts[1]) if parts[1].isdigit() else 0
                address = parts[8]
                if ":" not in address:
                    continue
                port_str = address.split(":")[-1]
                try:
                    port = int(port_str)
                except ValueError:
                    continue

                # Get full command and cwd via remote SSH
                full_cmd = ""
                cwd = ""
                if pid > 0:
                    try:
                        info = subprocess.run(
                            ["ssh", "-o", "ConnectTimeout=3", "-o", "BatchMode=yes",
                             f"{user}@{host}",
                             f"cat /proc/{pid}/cmdline 2>/dev/null | tr '\\0' ' '; "
                             f"echo; readlink -f /proc/{pid}/cwd 2>/dev/null || pwdx {pid} 2>/dev/null | cut -d' ' -f2"],
                            capture_output=True, text=True, timeout=5,
                        )
                        if info.returncode == 0 and info.stdout.strip():
                            lines2 = info.stdout.strip().split("\n")
                            if lines2:
                                full_cmd = lines2[0].strip()
                            if len(lines2) > 1:
                                cwd = lines2[1].strip()
                    except Exception:
                        pass

                ports.append(PortItem(
                    port=port,
                    pid=pid,
                    command=command,
                    fullCommand=full_cmd,
                    cwd=cwd,
                    name=command,
                    user=user,
                ))
            _apply_port_labels(ports, labels)
            results.append({"host": host, "name": name, "user": user, "ports": ports, "scannedAt": now})
        except Exception:
            results.append({"host": host, "name": name, "ports": [], "scannedAt": now})
    return RemotePortsResponse(ok=True, hosts=results)


@router.post("/ports/remote/kill")
async def kill_remote_process(req: RemoteKillRequest, request: Request):
    _get_user_id(request)
    """Kill a process on a remote machine via SSH."""
    try:
        signal = req.signal if req.signal in ("SIGTERM", "SIGKILL", "SIGINT") else "SIGTERM"
        result = subprocess.run(
            ["ssh", "-o", "ConnectTimeout=5", "-o", "BatchMode=yes",
             f"{req.user}@{req.host}",
             f"kill -{signal} {req.pid} 2>&1"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            return RemoteKillResponse(ok=True, message=f"Sent {signal} to PID {req.pid} on {req.host}")
        else:
            return RemoteKillResponse(ok=False, message=result.stderr or f"Failed to kill PID {req.pid} on {req.host}")
    except Exception as e:
        return RemoteKillResponse(ok=False, message=str(e))


class Pm2Action(BaseModel):
    name: str


class Pm2Result(BaseModel):
    ok: bool
    message: str = ""


class Pm2ForceStopResult(BaseModel):
    ok: bool
    message: str = ""
    status: str = ""
    killedPids: list[int] = Field(default_factory=list)
    remainingPids: list[int] = Field(default_factory=list)


@router.get("/pm2")
async def pm2_list(request: Request):
    _get_user_id(request)
    ok, procs, msg = _pm2_jlist()
    if not ok:
        raise HTTPException(status_code=500, detail=msg)
    items = []
    for p in procs:
        env = p.get("pm2_env", {}) or {}
        mon = p.get("monit", {}) or {}
        items.append({
            "name": p.get("name", ""),
            "status": env.get("status", "unknown"),
            "pid": p.get("pid", 0),
            "memory": mon.get("memory", 0),
            "cpu": mon.get("cpu", 0),
            "uptime": env.get("pm_uptime", 0),
            "restarts": env.get("restart_time", 0),
            "cwd": env.get("pm_cwd", ""),
        })
    items.sort(key=lambda x: x["name"])
    return {"ok": True, "services": items, "scannedAt": datetime.now().isoformat()}


@router.post("/pm2/start", response_model=Pm2Result)
async def pm2_start(req: Pm2Action, request: Request):
    _get_user_id(request)
    name = _validate_pm2_name(req.name)
    if _pm2_describe(name):
        ok, out = _pm2(["start", name])
    else:
        ok, out = _pm2(["start", str(_ECOSYSTEM_CONFIG), "--only", name])
    return Pm2Result(ok=ok, message=out if not ok else f"đã bật {name}")


@router.post("/pm2/stop", response_model=Pm2Result)
async def pm2_stop(req: Pm2Action, request: Request):
    _get_user_id(request)
    name = _validate_pm2_name(req.name)
    ok, out = _pm2(["stop", name])
    return Pm2Result(ok=ok, message=out if not ok else f"đã tắt {name}")


@router.post("/pm2/force-stop", response_model=Pm2ForceStopResult)
async def pm2_force_stop(req: Pm2Action, request: Request):
    _get_user_id(request)
    name = _validate_pm2_name(req.name)
    before, find_error = _pm2_find(name)
    if find_error:
        return Pm2ForceStopResult(ok=False, message=find_error)
    if not before:
        return Pm2ForceStopResult(ok=False, message=f"không tìm thấy {name} trong PM2")

    original_pid = _safe_pid(before.get("pid"))
    stop_ok, stop_out = _pm2(["stop", name], timeout=15)
    time.sleep(0.4)

    killed: list[int] = []
    remaining: list[int] = []
    seen: set[int] = set()

    for _ in range(2):
        current, _ = _pm2_find(name)
        current_pid = _safe_pid(current.get("pid")) if current else 0
        roots = [pid for pid in (original_pid, current_pid) if pid > 1 and _pid_alive(pid)]
        if not roots:
            break

        targets: list[int] = []
        for pid in roots:
            for target in _process_tree(pid):
                if target in seen:
                    continue
                seen.add(target)
                targets.append(target)
        if not targets:
            break

        killed.extend(_signal_pids(targets, signal.SIGTERM))
        remaining = _wait_pids_exit(targets, 2.0)
        if remaining:
            killed.extend(_signal_pids(remaining, signal.SIGKILL))
            remaining = _wait_pids_exit(remaining, 2.0)
        if not remaining:
            break

    _pm2(["stop", name], timeout=10)
    final, _ = _pm2_find(name)
    final_status = _pm2_status(final)
    final_pid = _safe_pid(final.get("pid")) if final else 0
    final_remaining = sorted({pid for pid in [*remaining, final_pid] if pid > 1 and _pid_alive(pid)})
    pm2_stopped = final_status in {"stopped", "errored", "unknown"}
    ok = pm2_stopped and not final_remaining

    if ok:
        message = f"đã tắt mạnh {name}"
    elif final_remaining:
        message = f"{name} vẫn còn PID sống: {', '.join(map(str, final_remaining))}"
    else:
        detail = stop_out if not stop_ok else f"PM2 status={final_status}"
        message = f"chưa tắt được {name}: {detail}"

    return Pm2ForceStopResult(
        ok=ok,
        message=message,
        status=final_status,
        killedPids=sorted(set(killed)),
        remainingPids=final_remaining,
    )


@router.post("/pm2/restart", response_model=Pm2Result)
async def pm2_restart(req: Pm2Action, request: Request):
    _get_user_id(request)
    name = _validate_pm2_name(req.name)
    if _pm2_describe(name):
        ok, out = _pm2(["restart", name])
    else:
        ok, out = _pm2(["start", str(_ECOSYSTEM_CONFIG), "--only", name])
    return Pm2Result(ok=ok, message=out if not ok else f"đã restart {name}")


def _restart_service_wrapper(name: str) -> tuple[bool, str]:
    if _pm2_describe(name):
        return _pm2(["restart", name])
    return _pm2(["start", str(_ECOSYSTEM_CONFIG), "--only", name])


_DEFAULT_SERVICES = [
    # HAgent (chính)
    "hagent-fastapi",
    "hagent-frontend",
    # RustDesk (mặc định tắt, bật khi cần)
    "hagent-rustdesk-hbbs",
    "hagent-rustdesk-hbbr",
    # HatAI (phụ)
    "hatai-backend",
    "hatai-vite",
    "hatai-mcp",
    "hatai-video",
]


class Pm2RestartAllResult(BaseModel):
    ok: bool
    results: list[dict] = []
    message: str = ""


@router.post("/pm2/restart-all", response_model=Pm2RestartAllResult)
async def pm2_restart_all(request: Request):
    _get_user_id(request)

    async def _restart_one(name: str) -> dict:
        try:
            ok, out = await asyncio.to_thread(_restart_service_wrapper, name)
            return {"name": name, "ok": ok, "message": out if not ok else "ok"}
        except Exception as e:
            return {"name": name, "ok": False, "message": str(e)}

    tasks = [_restart_one(name) for name in _DEFAULT_SERVICES]
    results = await asyncio.gather(*tasks)
    all_ok = all(r["ok"] for r in results)
    return Pm2RestartAllResult(
        ok=all_ok,
        results=results,
        message="đã restart all" if all_ok else "một số service lỗi",
    )
