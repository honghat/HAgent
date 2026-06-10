from __future__ import annotations

import asyncio
import json
import subprocess
import os
import re
import shlex
from pathlib import Path

import aiohttp
import requests
import psutil
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.services.session_store import add_message, get_session
from api.services.claude_terminal_modes import (
    claude_terminal_modes,
    read_claude_terminal_settings,
    write_claude_terminal_mode,
)

router = APIRouter(prefix="/quick-commands", tags=["quick-commands"])


class QuickCommandBody(BaseModel):
    session_id: str | None = None
    args: str = ""
    provider: str | None = None
    sudo_password: str | None = None
    model: str | None = None


def _store(session_id: str | None, command: str, content: str, provider: str | None) -> None:
    if not session_id or not get_session(session_id):
        return
    add_message(session_id, "user", f"/{command}", provider=provider)
    add_message(session_id, "assistant", content, provider=provider)


async def _weather(location: str) -> str:
    location = location.strip() or "Ho Chi Minh"
    async with aiohttp.ClientSession() as s:
        async with s.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": location, "count": 1, "language": "vi", "format": "json"},
            timeout=aiohttp.ClientTimeout(total=10),
        ) as r:
            geo = (await r.json()).get("results", [None])[0]
        if not geo:
            return f"Không tìm thấy địa điểm: {location}"
        async with s.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": geo["latitude"],
                "longitude": geo["longitude"],
                "current": "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
                "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum",
                "timezone": "auto",
            },
            timeout=aiohttp.ClientTimeout(total=10),
        ) as r:
            data = await r.json()

    codes = {
        0: "Trời quang",
        1: "Ít mây",
        2: "Nhiều mây",
        3: "U ám",
        45: "Sương mù",
        61: "Mưa nhẹ",
        63: "Mưa vừa",
        65: "Mưa nặng hạt",
        80: "Mưa rào",
        95: "Giông bão",
    }
    cur = data.get("current", {})
    daily = data.get("daily", {})
    name = f"{geo.get('name')}, {geo.get('country', '')}".strip(", ")
    return (
        f"## Thời tiết {name}\n\n"
        f"- Nhiệt độ: **{cur.get('temperature_2m', '?')}°C**\n"
        f"- Cảm giác: **{cur.get('apparent_temperature', '?')}°C**\n"
        f"- Độ ẩm: **{cur.get('relative_humidity_2m', '?')}%**\n"
        f"- Gió: **{cur.get('wind_speed_10m', '?')} km/h**\n"
        f"- Trạng thái: **{codes.get(cur.get('weather_code'), cur.get('weather_code', '?'))}**\n"
        f"- Cao/thấp: **{daily.get('temperature_2m_max', ['?'])[0]}°C** / "
        f"**{daily.get('temperature_2m_min', ['?'])[0]}°C**"
    )


def _status() -> str:
    ram = psutil.virtual_memory()
    cpu = psutil.cpu_percent(interval=0.2)
    lines = [
        "## HAgent đang chạy",
        "",
        f"- CPU: **{cpu}%**",
        f"- RAM: **{ram.percent}%** ({ram.used / 1024**3:.1f}/{ram.total / 1024**3:.1f} GB)",
    ]

    temp_line = ""
    temp_cmd = "/opt/homebrew/bin/osx-cpu-temp"
    if os.path.exists(temp_cmd):
        try:
            proc = subprocess.run([temp_cmd], capture_output=True, text=True, timeout=3)
            output = (proc.stdout + "\n" + proc.stderr).strip()
            match = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*°?C", output)
            if match and float(match.group(1)) > 0:
                temp_line = f"- Nhiệt độ: **{float(match.group(1)):.1f}°C**"
        except Exception:
            pass
    if temp_line:
        lines.append(temp_line)

    seen: set[str] = set()
    for part in psutil.disk_partitions(all=False):
        mount = part.mountpoint
        if mount != "/System/Volumes/Data":
            continue
        if mount in seen:
            continue
        seen.add(mount)
        try:
            usage = psutil.disk_usage(mount)
        except Exception:
            continue
        lines.append(
            f"- Ổ cứng: **{usage.percent}%** "
            f"(trống {usage.free / 1024**3:.1f} GB / tổng {usage.total / 1024**3:.1f} GB)"
        )
        break

    lines.append("- API: **online**")
    return "\n".join(lines)


def _start_text() -> str:
    return (
        "## Chào mừng bạn đến với HAgent\n\n"
        "- `/giavang`: Giá vàng DOJI\n"
        "- `/thoitiet`: Dự báo thời tiết\n"
        "- `/tinmoi`: Tin tức mới nhất\n"
        "- `/new`: Phiên chat mới\n"
        "- `/status`: Trạng thái hệ thống\n"
        "- `/goal`: Xem/đặt mục tiêu\n"
        "- `/terminal`: Mở Terminal Claude\n"
        "- `/chuyenclaude`: Đổi Claude Terminal model\n"
        "- `/reboot`: Khởi động lại Mac mini\n"
        "- `/bat`: Bật máy (WOL)\n"
        "- `/tat`: Tắt máy (SSH)\n"
        "- `/rustdesk`: Bật/tắt RustDesk\n"
        "- `/smb`: Mount remote SMB\n"
        "- `/chuyenmohinh`: Đổi AI\n"
        "- `/lmstudio`: LM Studio Remote\n"
        "- `/lmstudio_local`: LM Studio Local\n"
        "- `/ollama`: Ollama Remote\n"
        "- `/llamacpp`: Llama-cpp Remote\n"
        "- `/pekpik`: Pekpik Free API\n"
        "- `/fetch-deepseek-key`: Lấy key DeepSeek mới\n"
        "- `/off`: Tắt tất cả dịch vụ"
    )


def _terminal() -> str:
    project_root = Path(__file__).resolve().parents[3]
    settings = read_claude_terminal_settings()
    env = settings.get("env") if isinstance(settings.get("env"), dict) else {}
    shell_parts = [
        f"cd {shlex.quote(str(project_root))}",
        f"export ANTHROPIC_BASE_URL={shlex.quote(str(env.get('ANTHROPIC_BASE_URL', '')))}",
        f"export ANTHROPIC_API_KEY={shlex.quote(str(env.get('ANTHROPIC_API_KEY', '')))}",
        f"export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC={shlex.quote(str(env.get('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', '1')))}",
    ]
    if settings.get("model"):
        shell_parts.append(f"export ANTHROPIC_MODEL={shlex.quote(str(settings['model']))}")
    shell_parts.append("claude")
    terminal_cmd = " && ".join(shell_parts)
    script = (
        'tell application "Terminal" to activate\n'
        f'tell application "Terminal" to do script "{terminal_cmd.replace(chr(34), chr(92) + chr(34))}"'
    )
    subprocess.run(["osascript", "-e", script], check=True, capture_output=True, text=True, timeout=10)
    return (
        f"Đã mở Terminal Claude với **{settings.get('label', settings.get('mode', 'Claude'))}** "
        f"(`{settings.get('model', '')}`)."
    )


def _jobs() -> str:
    from api.routers.job_hunter import _load_fresh_cache

    jobs = _load_fresh_cache(save=False)[:10]
    if not jobs:
        return "Chưa có dữ liệu việc làm trong cache. Vào tab Săn việc và quét việc làm trước."
    lines = ["## Việc làm mới trong cache"]
    for idx, job in enumerate(jobs, 1):
        lines.append(
            f"{idx}. **{job.get('title', 'Không rõ')}** - {job.get('company', 'Không rõ')}\n"
            f"   {job.get('location') or ''} {job.get('salary') or ''}\n"
            f"   {job.get('url') or ''}"
        )
    return "\n\n".join(lines)


def _choice_text(title: str, choices: list[tuple[str, str]]) -> str:
    lines = [f"## {title}", ""]
    lines.extend(f"- `/{cmd}`: {label}" for cmd, label in choices)
    return "\n".join(lines)


async def _run_rustdesk_script(action: str) -> str:
    scripts = {
        "on": "rustdesk-on.sh",
        "off": "rustdesk-off.sh",
        "restart": "rustdesk-restart.sh",
    }
    script_name = scripts[action]
    script_path = Path("/Users/nguyenhat/HAgent/scripts") / script_name
    proc = await asyncio.create_subprocess_exec(
        "bash",
        str(script_path),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=20)
    except asyncio.TimeoutError as exc:
        proc.kill()
        await proc.communicate()
        raise HTTPException(status_code=504, detail=f"RustDesk {action} timeout sau 20s") from exc
    output = "\n".join(
        part.strip()
        for part in (stdout.decode(errors="replace"), stderr.decode(errors="replace"))
        if part.strip()
    )
    if proc.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=output or f"RustDesk {action} lỗi exit code {proc.returncode}",
        )
    return output


async def _remote_service(command: str) -> str:
    from tools.remote_power_tool import _ssh_exec

    commands = {
        "lmstudio": (
            "systemctl --user stop ollama.service 2>/dev/null || sudo systemctl stop ollama; "
            "systemctl --user stop llamacpp.service; systemctl --user start lmstudio.service",
            "Đã bật LM Studio (Remote) và tắt các dịch vụ khác.",
        ),
        "ollama": (
            "systemctl --user stop lmstudio.service; systemctl --user stop llamacpp.service; sudo systemctl start ollama",
            "Đã bật Ollama (Remote) và tắt các dịch vụ khác.",
        ),
        "llamacpp": (
            "sudo systemctl stop ollama; systemctl --user stop lmstudio.service; systemctl --user start llamacpp.service",
            "Đã bật Llama-cpp (Remote) và tắt các dịch vụ khác.",
        ),
        "off": (
            "sudo systemctl stop ollama; systemctl --user stop lmstudio.service; systemctl --user stop llamacpp.service",
            "Đã tắt tất cả dịch vụ AI trên Remote.",
        ),
    }
    cmd, ok_text = commands[command]
    result = await _ssh_exec(cmd)
    if result.startswith(("❌", "⏰")):
        return result
    return ok_text


def _open_lmstudio_local() -> str:
    subprocess.run(["open", "-a", "LM Studio"], capture_output=True, text=True, timeout=5)
    return "Đã mở LM Studio trên máy Mac (Local)."


async def _fetch_and_update_deepseek_key(model: str | None = None) -> str:
    """Lấy key API mới nhất từ free-llm-api-keys và update vào provider Pekpik.
    
    Args:
        model: Model cần key (ví dụ: "deepseek-chat", "claude-opus-4-7"...).
               Nếu None, mặc định deepseek-chat.
    """
    target_model = (model or "deepseek-chat").strip().lower()
    model_label = target_model
    README_URL = "https://raw.githubusercontent.com/alistaitsacle/free-llm-api-keys/main/README.md"
    KEY_MANAGER_URL = "https://aiapiv2.pekpik.com/km/active-keys"
    try:
        # Cách 1: Lấy từ Key Manager API (có dữ liệu chuẩn xác hơn)
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as session:
            try:
                async with session.get(KEY_MANAGER_URL) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        if isinstance(data, list):
                            filtered_keys = [
                                k for k in data
                                if k.get("model", "").lower() == target_model
                                and k.get("key", "")
                            ]
                            if filtered_keys:
                                current_key = _get_current_pekpik_key()
                                new_key = filtered_keys[0]["key"]
                                if current_key and len(filtered_keys) > 1:
                                    alt_keys = [k for k in filtered_keys if k["key"] != current_key]
                                    if alt_keys:
                                        new_key = alt_keys[0]["key"]
                                _persist_pekpik_key(new_key)
                                if current_key and new_key == current_key:
                                    return f"ℹ️ Key {model_label} vẫn là key mới nhất (không có key mới). Provider Pekpik đã up-to-date."
                                return f"✅ Đã lấy key {model_label} mới từ Key Manager và cập nhật vào provider Pekpik."
            except (aiohttp.ClientError, asyncio.TimeoutError, json.JSONDecodeError):
                pass

        # Cách 2: Parse từ README.md
        try:
            resp = requests.get(README_URL, timeout=15)
            content = resp.text
        except Exception as e:
            return f"❌ Không lấy được README.md: {e}"

        # Tìm key cho model trong README
        # Format: | `sk-XXXX...` | model-name | ... (key between backticks)
        matches = []

        for line in content.split('\n'):
            if target_model in line and '`sk-' in line:
                start = line.find('`sk-')
                if start >= 0:
                    end = line.find('`', start + 1)
                    if end >= 0:
                        key = line[start + 1:end]
                        if key.startswith('sk-'):
                            matches.append(key)

        if not matches:
            return f"❌ Không tìm thấy key {model_label} nào trong README. Thử lại sau."

        current_key = _get_current_pekpik_key()

        new_key = matches[0]
        if current_key and len(matches) > 1:
            alt_keys = [k for k in matches if k != current_key]
            if alt_keys:
                new_key = alt_keys[0]
                logger.info(f"{target_model}: bỏ qua key cũ ({len(matches)-len(alt_keys)} trùng), chọn key mới: {new_key[:12]}...")

        _persist_pekpik_key(new_key)
        if current_key and new_key == current_key:
            return f"ℹ️ Key {model_label} vẫn là key mới nhất (không có key mới). Provider Pekpik đã up-to-date."
        return f"✅ Đã lấy key {model_label} mới từ GitHub (mục {matches.index(new_key)+1}/{len(matches)}) và cập nhật vào provider Pekpik."

    except Exception as e:
        return f"❌ Lỗi khi lấy key {model_label}: {e}"


def _get_current_pekpik_key():
    """Lấy api_key hiện tại của provider pekpik từ database."""
    try:
        from api.services.user_store import get_connection, DEFAULT_USERNAME

        with get_connection() as conn:
            row = conn.execute(
                "SELECT api_key FROM custom_providers WHERE user_id=? AND name=?",
                (DEFAULT_USERNAME, "pekpik"),
            ).fetchone()
        return row["api_key"] if row else None
    except Exception:
        return None


def _persist_pekpik_key(api_key: str) -> None:
    """Lưu key vào custom_providers cho pekpik và đồng bộ ra config.yaml."""
    try:
        from api.services.user_store import get_connection, DEFAULT_USERNAME

        with get_connection() as conn:
            user_row = conn.execute("SELECT id FROM users WHERE username = ?",
                                    (DEFAULT_USERNAME,)).fetchone()
            uid = user_row["id"] if user_row else DEFAULT_USERNAME

            existing = conn.execute("SELECT id FROM custom_providers WHERE user_id = ? AND name = ?",
                                    (uid, "pekpik")).fetchone()
            if existing:
                conn.execute(
                    "UPDATE custom_providers SET api_key=?, updated_at=datetime('now') WHERE user_id=? AND name=?",
                    (api_key, uid, "pekpik"),
                )
            else:
                import uuid
                conn.execute(
                    "INSERT INTO custom_providers (id, user_id, name, label, type, base_url, api_key, model, context_length) VALUES (?,?,?,?,?,?,?,?,?)",
                    (str(uuid.uuid4()), uid, "pekpik", "Pekpik API", "openai",
                     "https://aiapiv2.pekpik.com/v1", api_key, "deepseek-chat", 1_000_000),
                )

        # Đồng bộ ra config.yaml
        _sync_provider_to_config_yaml(uid, "pekpik")
    except Exception as e:
        raise RuntimeError(f"Không lưu được key: {e}")


def _sync_provider_to_config_yaml(user_id: str, provider_name: str) -> None:
    """Sao chép provider sang config.yaml để agent runtime đọc được api_key."""
    try:
        import yaml
        from hagent_constants import get_config_path

        cfg_path = get_config_path()
        cfg: dict = {}
        if cfg_path.exists():
            try:
                cfg = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
            except Exception:
                cfg = {}

        providers = cfg.get("providers")
        if not isinstance(providers, dict):
            providers = {}

        from api.services.user_store import get_connection
        with get_connection() as conn:
            row = conn.execute(
                "SELECT label, type, base_url, api_key, model FROM custom_providers WHERE user_id=? AND name=?",
                (user_id, provider_name),
            ).fetchone()

        if row and (row["base_url"] or row["api_key"]):
            providers[provider_name] = {
                "name": row["label"] or provider_name,
                "base_url": row["base_url"] or "",
                "api_key": row["api_key"] or "",
                "default_model": row["model"] or "",
            }
        else:
            providers.pop(provider_name, None)

        cfg["providers"] = providers
        cfg_path.write_text(yaml.safe_dump(cfg, sort_keys=False, allow_unicode=True), encoding="utf-8")
    except Exception:
        pass


def _reboot_macmini(force: bool = False, sudo_password: str | None = None) -> str:
    if sudo_password:
        # Dùng echo pip sudo nếu có password
        cmd = ["/bin/sh", "-c", f"echo '{sudo_password}' | sudo -S /sbin/reboot"] if force else \
              ["/bin/sh", "-c", f"echo '{sudo_password}' | sudo -S /sbin/shutdown -r +1"]
    else:
        cmd = ["sudo", "-n", "/sbin/reboot"] if force else ["sudo", "-n", "/sbin/shutdown", "-r", "+1"]

    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
    if proc.returncode == 0:
        if force:
            return "⚠️ Đã gửi lệnh force reboot Mac mini. Máy sẽ khởi động lại ngay."
        return "🔄 Đã gửi lệnh reboot Mac mini. Máy sẽ khởi động lại trong khoảng 1 phút."

    if sudo_password:
        detail = (proc.stderr or proc.stdout or "sudo reboot thất bại").strip()
        raise HTTPException(status_code=500, detail=f"Không reboot được: {detail}")

    if force:
        detail = (proc.stderr or proc.stdout or "sudo reboot thất bại").strip()
        raise HTTPException(status_code=500, detail=f"Không force reboot được: {detail}")

    script = 'tell application "System Events" to restart'
    subprocess.Popen(
        ["osascript", "-e", script],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    return "🔄 Đã gửi lệnh reboot Mac mini qua System Events."


@router.post("/{command}")
async def run_quick_command(command: str, body: QuickCommandBody) -> dict:
    command = command.strip().lower().lstrip("/")
    parts = command.split(None, 1)
    if len(parts) > 1:
        body.args = (parts[1] + " " + body.args).strip() if body.args else parts[1]
        command = parts[0]
    try:
        if command in {"start", "help"}:
            content = _start_text()
        elif command == "status":
            content = _status()
        elif command == "giavang":
            from tools.finance_tools import get_gold_price

            content = await get_gold_price()
        elif command == "tygia":
            from tools.finance_tools import _handle_vietcombank_rate

            content = await _handle_vietcombank_rate({})
        elif command == "thoitiet":
            content = await _weather(body.args)
        elif command == "tinmoi":
            from tools.news_tool import _fetch_vnexpress

            content = await _fetch_vnexpress()
        elif command == "terminal":
            content = _terminal()
        elif command in {"reboot", "restart", "khoidonglai"}:
            content = _reboot_macmini(force=body.args.strip().lower() in {"force", "now", "ngay"}, sudo_password=body.sudo_password)
        elif command == "vieclam":
            content = _jobs()
        elif command == "goal":
            content = "Vào mục Mục tiêu hoặc nhập `/goal <mục tiêu>` trong Telegram để đặt mục tiêu. Web quick command hiện chỉ hỗ trợ xem menu."
        elif command == "chuyenclaude":
            if body.args:
                mode = body.args.strip().lower()
                try:
                    settings = write_claude_terminal_mode(mode)
                    content = (
                        f"✅ Đã chuyển Claude Terminal sang **{settings.get('label', mode)}**.\n\n"
                        f"- URL API: `{settings['env']['ANTHROPIC_BASE_URL']}`\n"
                        f"- Model: `{settings['model']}`"
                    )
                except ValueError:
                    content = f"❌ Claude Terminal mode không hợp lệ: **{mode}**."
            else:
                modes = claude_terminal_modes()
                content = _choice_text(
                    "Chọn Claude Terminal model",
                    [
                        ("chuyenclaude freemodel", modes["freemodel"]["label"]),
                        ("chuyenclaude deepseek", "DeepSeek Proxy"),
                        ("chuyenclaude ollama", "Ollama Remote"),
                        ("chuyenclaude lmstudio", "LM Studio Remote"),
                        ("chuyenclaude llamacpp", "Llama.cpp"),
                        ("chuyenclaude lmstudio_local", "LM Studio Local"),
                        ("chuyenclaude cx", "9Router"),
                    ],
                )
        elif command == "chuyenmohinh":
            if body.args:
                async with aiohttp.ClientSession() as s:
                    async with s.put(
                        "http://localhost:8010/api/auth/provider",
                        json={"provider": body.args},
                    ) as r:
                        if r.ok:
                            content = f"✅ Đã chuyển sang provider **{body.args}**."
                        else:
                            content = f"❌ Không thể chuyển sang provider **{body.args}**."
            else:
                content = _choice_text(
                    "Chọn model AI",
                    [
                        ("chuyenmohinh deepseek", "DeepSeek V3"),
                        ("chuyenmohinh lmstudio", "LM Studio Remote"),
                        ("chuyenmohinh lmstudio_local", "LM Studio Local"),
                        ("chuyenmohinh ollama", "Ollama"),
                        ("chuyenmohinh llamacpp", "Llama.cpp"),
                        ("chuyenmohinh pekpik", "Pekpik Free"),
                        ("chuyenmohinh cx", "9Router"),
                    ],
                )
        elif command == "rustdesk":
            if body.args == "on":
                os.system("killall hbbs hbbr 2>/dev/null; kill -9 $(lsof -ti :8006 :8007) 2>/dev/null")
                await asyncio.sleep(0.5)
                await _run_rustdesk_script("on")
                content = "🟢 Đã bật RustDesk."
            elif body.args == "off":
                os.system("killall hbbs hbbr RustDesk 2>/dev/null")
                await _run_rustdesk_script("off")
                content = "🔴 Đã tắt RustDesk."
            elif body.args == "restart":
                await _run_rustdesk_script("restart")
                content = "🔁 Đã restart RustDesk (server + app)."
            else:
                content = _choice_text(
                    "RustDesk Server",
                    [
                        ("rustdesk on", "Bật RustDesk"),
                        ("rustdesk restart", "Restart (sửa lỗi chờ hình ảnh)"),
                        ("rustdesk off", "Tắt RustDesk"),
                    ],
                )
        elif command == "hatdisplay":
            if body.args in {"", "on"}:
                os.system("bash /Users/nguyenhat/HAgent/scripts/hatdisplay-on.sh &")
                content = "🟢 Đang bật HatDisplay."
            else:
                content = _choice_text("HatDisplay", [("hatdisplay on", "Bật HatDisplay")])
        elif command == "smb":
            if body.args:
                disks = {
                    "sys": ("100.69.50.64", "SystemDisk", ""),
                }
                info = disks.get(body.args)
                if info:
                    ip, share, user = info
                    p = await asyncio.create_subprocess_exec(
                        "bash", "/Users/nguyenhat/HAgent/scripts/mount-smb.sh", ip, share, user,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                    )
                    stdout, stderr = await p.communicate()
                    out = (stdout + stderr).decode().strip()
                    if "✅" in out:
                        content = f"✅ Đã mount **{share}**."
                    else:
                        content = f"❌ Mount **{share}** thất bại:\n`{out[:200]}`"
                else:
                    content = f"❌ Ổ đĩa `{body.args}` không hợp lệ."
            else:
                content = _choice_text(
                    "Remote SMB Mount",
                    [
                        ("smb sys", "238GB SSD (SystemDisk)"),
                    ],
                )
        elif command == "bat":
            from tools.remote_power_tool import _handle_remote_power

            content = await _handle_remote_power({"action": "wol"})
        elif command == "tat":
            from tools.remote_power_tool import _handle_remote_power

            content = await _handle_remote_power({"action": "shutdown"})
        elif command in {"lmstudio", "ollama", "llamacpp", "off"}:
            content = await _remote_service(command)
        elif command == "fetch-deepseek-key":
            content = await _fetch_and_update_deepseek_key(body.model)
        elif command == "pekpik":
            content = "Provider Pekpik đã được thêm vào danh sách model. Bạn có thể chọn nó từ menu AI hoặc dùng trực tiếp."
        elif command == "lmstudio_local":
            content = _open_lmstudio_local()
        else:
            raise HTTPException(status_code=404, detail=f"Lệnh /{command} không tồn tại")
    except HTTPException:
        raise
    except Exception as exc:
        content = f"Lỗi chạy /{command}: {exc}"

    _store(body.session_id, command, content, body.provider)
    return {"command": command, "content": content}
