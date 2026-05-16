"""Remote power tools ported from JS: Wake-on-LAN, SSH power control."""

import os
import asyncio
from typing import Dict, Any
from .registry import registry

WOL_MAC = os.environ.get("WOL_MAC", "9c:6b:00:17:93:7a")
WOL_BROADCAST = os.environ.get("WOL_BROADCAST", "192.168.1.255")
WOL_PORT = int(os.environ.get("WOL_PORT", "9"))
SSH_HOST = os.environ.get("SSH_REMOTE_HOST", "100.69.50.64")
SSH_USER = os.environ.get("SSH_REMOTE_USER", "hatnguyen")
SSH_PASSWORD = os.environ.get("SSH_PASSWORD", "")


def _build_magic_packet(mac: str) -> bytes:
    hex_mac = mac.replace(":", "").replace("-", "")
    mac_bytes = bytes.fromhex(hex_mac)
    return b"\xff" * 6 + mac_bytes * 16


async def _send_wol() -> str:
    packet = _build_magic_packet(WOL_MAC)
    try:
        def _send():
            import socket as _socket
            s = _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)
            s.setsockopt(_socket.SOL_SOCKET, _socket.SO_BROADCAST, 1)
            s.settimeout(3)
            s.sendto(packet, (WOL_BROADCAST, WOL_PORT))
            s.close()
        await asyncio.to_thread(_send)
        return "✅ Đã gửi tín hiệu Wake-on-LAN. Máy tính sẽ khởi động trong vài giây."
    except Exception as e:
        return f"❌ Lỗi gửi WOL: {e}"


async def _ssh_exec(command: str) -> str:
    if not SSH_PASSWORD:
        return "❌ Chưa cấu hình SSH_PASSWORD trong file .env"
    try:
        proc = await asyncio.create_subprocess_exec(
            "ssh", "-o", "StrictHostKeyChecking=no",
            "-o", "ConnectTimeout=8",
            f"{SSH_USER}@{SSH_HOST}", command,
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
