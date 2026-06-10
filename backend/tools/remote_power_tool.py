"""Remote power tools ported from JS: Wake-on-LAN, SSH power control."""

import os
import asyncio
import shlex
import shutil
import socket
from typing import Dict, Any, Optional
from .registry import registry

WOL_MAC = os.environ.get("WOL_MAC", "9c:6b:00:17:93:7a")
WOL_MACS = [m.strip() for m in WOL_MAC.split(",") if m.strip()]
WOL_BROADCAST = os.environ.get("WOL_BROADCAST", "192.168.1.255")
WOL_TARGET_IP = os.environ.get("WOL_TARGET_IP", WOL_BROADCAST)
WOL_PORT = int(os.environ.get("WOL_PORT", "9"))
WOL_PI_HOST = os.environ.get("WOL_PI_HOST", "100.124.52.107")
WOL_PI_USER = os.environ.get("WOL_PI_USER", "pi")
WOL_PI_PASSWORD = os.environ.get("WOL_PI_SSH_PASSWORD") or os.environ.get("HAT_PI_SSH_PASSWORD") or os.environ.get("SSH_PASSWORD", "")
WOL_VIA_PI = os.environ.get("WOL_VIA_PI", "true").lower() not in {"0", "false", "no", "off"}
WOL_VERIFY_TIMEOUT = int(os.environ.get("WOL_VERIFY_TIMEOUT", "75"))
WOL_VERIFY_INTERVAL = float(os.environ.get("WOL_VERIFY_INTERVAL", "3"))
SSH_HOST = os.environ.get("SSH_REMOTE_HOST", "100.69.50.64")
SSH_USER = os.environ.get("SSH_REMOTE_USER", "hatnguyen")
SSH_PORT = int(os.environ.get("SSH_REMOTE_PORT", "22"))
SSH_PASSWORD = os.environ.get("SSH_PASSWORD", "")
TAILSCALE_BIN = os.environ.get("TAILSCALE_BIN") or shutil.which("tailscale") or "/Applications/Tailscale.app/Contents/MacOS/Tailscale"
TAILSCALE_PEER = os.environ.get("TAILSCALE_PEER", SSH_HOST)


def _build_magic_packet(mac: str) -> bytes:
    hex_mac = mac.replace(":", "").replace("-", "")
    mac_bytes = bytes.fromhex(hex_mac)
    return b"\xff" * 6 + mac_bytes * 16


async def _send_wol() -> str:
    if WOL_VIA_PI:
        return await _send_wol_via_pi()

    if not WOL_MACS:
        return "❌ Chưa cấu hình WOL_MAC."
    try:
        def _send():
            import socket as _socket
            s = _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)
            s.setsockopt(_socket.SOL_SOCKET, _socket.SO_BROADCAST, 1)
            s.settimeout(3)
            for mac in WOL_MACS:
                s.sendto(_build_magic_packet(mac), (WOL_BROADCAST, WOL_PORT))
            s.close()
        await asyncio.to_thread(_send)
        macs_text = ", ".join(WOL_MACS)
        return await _verify_wol_result(f"✅ Đã gửi WOL từ host local tới {macs_text} qua {WOL_BROADCAST}:{WOL_PORT}.")
    except Exception as e:
        return f"❌ Lỗi gửi WOL: {e}"


async def _send_wol_via_pi() -> str:
    if not WOL_PI_HOST or not WOL_PI_USER:
        return "❌ Chưa cấu hình WOL_PI_HOST/WOL_PI_USER để gửi WOL qua hat-pi."

    code = f"""
import socket
mac = {WOL_MAC!r}
target = {WOL_TARGET_IP!r}
port = {WOL_PORT!r}
hex_mac = mac.replace(':', '').replace('-', '')
packet = bytes.fromhex('ff' * 6 + hex_mac * 16)
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
s.settimeout(3)
s.sendto(packet, (target, int(port)))
s.close()
print(f"sent {{mac}} to {{target}}:{{port}}")
""".strip()
    command = f"python3 -c {shlex.quote(code)}"
    result = await _ssh_exec_host(WOL_PI_HOST, WOL_PI_USER, command, password=WOL_PI_PASSWORD, timeout=12)
    if result.startswith(("❌", "⏰")):
        return result
    sent_text = f"✅ Đã gửi Wake-on-LAN qua hat-pi ({WOL_PI_USER}@{WOL_PI_HOST}) tới {WOL_TARGET_IP}:{WOL_PORT}."
    return await _verify_wol_result(sent_text)


async def _remote_tailscale_online() -> bool:
    if not TAILSCALE_BIN or not os.path.exists(TAILSCALE_BIN):
        return False
    try:
        proc = await asyncio.create_subprocess_exec(
            TAILSCALE_BIN, "ping", "--c", "1", "--timeout=2s", TAILSCALE_PEER,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            await asyncio.wait_for(proc.communicate(), timeout=4)
        except asyncio.TimeoutError:
            proc.kill()
            return False
        return proc.returncode == 0
    except Exception:
        return False


async def _remote_ssh_reachable() -> bool:
    if await _remote_tailscale_online():
        return True

    def _probe() -> bool:
        try:
            with socket.create_connection((SSH_HOST, SSH_PORT), timeout=2):
                return True
        except OSError:
            return False

    return await asyncio.to_thread(_probe)


async def _wait_for_remote_online() -> Optional[int]:
    if WOL_VERIFY_TIMEOUT <= 0:
        return None
    loop = asyncio.get_running_loop()
    started = loop.time()
    deadline = started + WOL_VERIFY_TIMEOUT
    while loop.time() <= deadline:
        if await _remote_ssh_reachable():
            return int(loop.time() - started)
        await asyncio.sleep(WOL_VERIFY_INTERVAL)
    return None


async def _verify_wol_result(sent_text: str) -> str:
    if WOL_VERIFY_TIMEOUT <= 0:
        return sent_text
    elapsed = await _wait_for_remote_online()
    if elapsed is not None:
        return (
            f"✅ Máy remote đã online (Tailscale/SSH reachable) sau {elapsed}s.\n\n"
            f"{sent_text}"
        )
    return (
        f"⚠️ Đã gửi Wake-on-LAN nhưng chưa xác nhận được máy bật trong {WOL_VERIFY_TIMEOUT}s.\n"
        f"Tailscale peer {TAILSCALE_PEER} chưa trả lời, SSH {SSH_HOST}:{SSH_PORT} cũng chưa reachable.\n\n"
        f"{sent_text}"
    )


async def _ssh_exec_host(host: str, user: str, command: str, *, password: str = "", timeout: int = 15) -> str:
    ssh_cmd = [
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=8",
        "-o", "BatchMode=yes" if not password else "BatchMode=no",
        f"{user}@{host}",
        command,
    ]
    sshpass = shutil.which("sshpass") or "/opt/homebrew/bin/sshpass"
    if password and os.path.exists(sshpass):
        ssh_cmd = [sshpass, "-p", password, *ssh_cmd]
    try:
        proc = await asyncio.create_subprocess_exec(
            *ssh_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            return "⏰ SSH timeout - máy đích không phản hồi."
        result = (stdout or b"").decode("utf-8", errors="replace").strip()
        err = (stderr or b"").decode("utf-8", errors="replace").strip()
        if proc.returncode != 0:
            return f"❌ Lỗi SSH: {(err or result)[:500]}"
        return result or "✅ Lệnh đã chạy thành công."
    except Exception as e:
        return f"❌ Lỗi SSH: {str(e)[:500]}"


async def _ssh_exec(command: str) -> str:
    if not SSH_PASSWORD:
        return "❌ Chưa cấu hình SSH_PASSWORD trong file .env"
    ssh_cmd = [
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=8",
        "-p", str(SSH_PORT),
        f"{SSH_USER}@{SSH_HOST}",
        command,
    ]
    sshpass = shutil.which("sshpass") or "/opt/homebrew/bin/sshpass"
    if os.path.exists(sshpass):
        ssh_cmd = [sshpass, "-p", SSH_PASSWORD, *ssh_cmd]
    try:
        proc = await asyncio.create_subprocess_exec(
            *ssh_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=15)
        except asyncio.TimeoutError:
            proc.kill()
            return "⏰ SSH timeout - máy đích không phản hồi."
        result = (stdout or b"").decode("utf-8", errors="replace").strip()
        err = (stderr or b"").decode("utf-8", errors="replace").strip()
        if proc.returncode != 0:
            return f"❌ Lỗi SSH: {(err or result)[:500]}"
        return result or "✅ Lệnh đã chạy thành công."
    except Exception as e:
        return f"❌ Lỗi SSH: {str(e)[:500]}"


async def _handle_remote_power(args: Dict[str, Any], **kwargs) -> str:
    action = (args.get("action") or "wol").lower()
    if action in ("wol", "wake"):
        return await _send_wol()
    elif action == "shutdown":
        return await _ssh_exec(f"echo '{SSH_PASSWORD}' | sudo -S shutdown now")
    elif action == "reboot":
        return await _ssh_exec(f"echo '{SSH_PASSWORD}' | sudo -S reboot")
    elif action == "status":
        return await _ssh_exec("uptime")
    elif action == "sleep":
        return await _ssh_exec("pmset sleepnow")
    else:
        return "❌ Hành động không hợp lệ. Các hành động: wol, shutdown, reboot, status, sleep"


registry.register(
    name="remote_power",
    toolset="remote",
    schema={
        "name": "remote_power",
        "description": "Dieu khien may tinh tu xa: bat (Wake-on-LAN), tat, khoi dong lai, xem trang thai.",
        "parameters": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "description": "Hanh dong: wol/wake (bat), shutdown (tat), reboot (khoi dong lai), status (trang thai), sleep (ngu)",
                }
            },
            "required": [],
        },
    },
    handler=_handle_remote_power,
    is_async=True,
    emoji="🔌",
)
