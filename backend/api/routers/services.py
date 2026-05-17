import subprocess
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel

from api.routers.auth import _get_user_id

router = APIRouter(prefix="/services", tags=["services"])

REMOTE_HOSTS = [
    {"host": "100.69.50.64", "user": "hatnguyen", "name": "hat-win"},
    {"host": "100.124.52.107", "user": "pi", "name": "hat-pi"},
]


class PortItem(BaseModel):
    port: int
    pid: int
    fd: Optional[int] = None
    command: str = ""
    fullCommand: str = ""
    cwd: str = ""
    name: str = ""
    user: str = ""


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


class KillRequest(BaseModel):
    pid: int
    signal: str = "SIGTERM"


class KillResponse(BaseModel):
    ok: bool
    message: str = ""


@router.get("/ports", response_model=PortsResponse)
async def list_ports(request: Request):
    _get_user_id(request)
    """List all listening ports with process info (macOS/Linux)."""
    try:
        # macOS lsof format
        result = subprocess.run(
            ["lsof", "-iTCP", "-sTCP:LISTEN", "-P", "-n"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if result.returncode != 0:
            # Fallback to ss or netstat
            result = subprocess.run(
                ["ss", "-tlnp"],
                capture_output=True,
                text=True,
                timeout=15,
            )
            if result.returncode != 0:
                return PortsResponse(ok=True, ports=[], scannedAt=datetime.now().isoformat())

        ports = []
        lines = result.stdout.strip().split("\n")

        if "lsof" in result.args[0]:
            # Parse lsof output
            for line in lines[1:]:
                parts = line.split()
                if len(parts) < 9:
                    continue
                command = parts[0]
                pid = int(parts[1]) if parts[1].isdigit() else 0
                user = parts[2]
                fd = parts[3]
                proto = parts[7]
                address = parts[8]

                if ":" not in address:
                    continue
                port_str = address.split(":")[-1]
                try:
                    port = int(port_str)
                except ValueError:
                    continue

                # Get cwd and full command
                cwd = ""
                full_cmd = ""
                try:
                    ps = subprocess.run(
                        ["ps", "-p", str(pid), "-o", "command="],
                        capture_output=True,
                        text=True,
                        timeout=5,
                    )
                    if ps.returncode == 0:
                        full_cmd = ps.stdout.strip()
                except Exception:
                    pass

                try:
                    pwdx = subprocess.run(
                        ["lsof", "-a", "-p", str(pid), "-d", "cwd", "-Fn"],
                        capture_output=True,
                        text=True,
                        timeout=5,
                    )
                    if pwdx.returncode == 0:
                        for l in pwdx.stdout.strip().split("\n"):
                            if l.startswith("n"):
                                cwd = l[1:]
                                break
                except Exception:
                    pass

                ports.append(PortItem(
                    port=port,
                    pid=pid,
                    fd=int(fd.rstrip("u")) if fd.rstrip("u").isdigit() else None,
                    command=command,
                    fullCommand=full_cmd,
                    cwd=cwd,
                    name=command,
                    user=user,
                ))
        else:
            # Parse ss -tlnp output
            for line in lines[1:]:
                parts = line.split()
                if len(parts) < 5:
                    continue
                local = parts[3]
                if ":" not in local:
                    continue
                port_str = local.split(":")[-1]
                try:
                    port = int(port_str)
                except ValueError:
                    continue

                # Extract pid from users((pid=123,fd=4))
                pid = 0
                process_info = ""
                for p in parts[5:]:
                    if "pid=" in p:
                        try:
                            pid = int(p.split("pid=")[1].split(",")[0].rstrip(")"))
                        except (ValueError, IndexError):
                            pass
                    if "users:" in p or "users(" in p:
                        process_info = p

                ports.append(PortItem(
                    port=port,
                    pid=pid,
                    command=process_info,
                    fullCommand=process_info,
                    name=process_info,
                ))

        return PortsResponse(
            ok=True,
            ports=ports,
            scannedAt=datetime.now().isoformat(),
        )
    except Exception as e:
        return PortsResponse(ok=True, ports=[], scannedAt=datetime.now().isoformat())


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
    _get_user_id(request)
    """Scan all remote machines' ports via SSH."""
    results = []
    now = datetime.now().isoformat()
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
