#!/usr/bin/env python3
"""Telegram bot — standalone, delegates to Python FastAPI for all backend logic."""

import asyncio
import json
import logging
import os
import re
import subprocess
import sys
from datetime import datetime
from typing import Optional

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, MessageHandler, filters, ContextTypes

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

import html as _html

# Load .env from project root if available
_env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
if os.path.exists(_env_path):
    try:
        import dotenv
        dotenv.load_dotenv(_env_path, override=True)
    except ImportError:
        pass  # dotenv not installed, rely on system env vars
    except Exception:
        pass

API_URL = os.environ.get("HAGENT_API_URL", "http://127.0.0.1:8010")
BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")

# ── Claude Terminal Config ─────────────────────────────────────────

CLAUDE_TERMINAL_MODES = {
    "deepseek": {
        "label": "DeepSeek Proxy",
        "base_url": "https://api.deepseek.com/anthropic",
        "model": os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash"),
        "api_key": os.environ.get("DEEPSEEK_API_KEY", ""),
    },
    "ollama": {
        "label": "Ollama Remote",
        "base_url": os.environ.get("CLAUDE_OLLAMA_URL", "http://100.69.50.64:11434"),
        "model": os.environ.get("CLAUDE_OLLAMA_MODEL", "qwen"),
        "api_key": "xxx",
    },
    "lmstudio": {
        "label": "LM Studio Remote",
        "base_url": os.environ.get("CLAUDE_LM_STUDIO_URL", "http://100.69.50.64:1234"),
        "model": os.environ.get("CLAUDE_LM_STUDIO_MODEL", "qwen/qwen3.5-9b"),
        "api_key": "xxx",
    },
    "llamacpp": {
        "label": "Llama.cpp Remote",
        "base_url": os.environ.get("CLAUDE_LLAMACPP_URL", "http://100.69.50.64:8080"),
        "model": os.environ.get("CLAUDE_LLAMACPP_MODEL", "google/gemma-4-e4b"),
        "api_key": "xxx",
    },
    "lmstudio_local": {
        "label": "LM Studio Local",
        "base_url": os.environ.get("CLAUDE_LM_STUDIO_LOCAL_URL", "http://localhost:1234"),
        "model": os.environ.get("CLAUDE_LM_STUDIO_LOCAL_MODEL", "google/gemma-4-e4b"),
        "api_key": "xxx",
    },
    "cx": {
        "label": "9Router",
        "base_url": "",
        "model": "",
        "api_key": "",
    },
}

CLAUDE_MODE_ORDER = ["deepseek", "ollama", "lmstudio", "llamacpp", "lmstudio_local", "cx"]

CLAUDE_MODE_PATH = os.path.join(os.path.dirname(__file__), "..", "runtime", "claude_terminal_mode.json")


def _read_claude_terminal_mode() -> str:
    try:
        if os.path.exists(CLAUDE_MODE_PATH):
            with open(CLAUDE_MODE_PATH) as f:
                return json.load(f).get("mode", "deepseek")
    except Exception:
        pass
    return "deepseek"


def _write_claude_terminal_mode(mode: str) -> None:
    os.makedirs(os.path.dirname(CLAUDE_MODE_PATH), exist_ok=True)
    with open(CLAUDE_MODE_PATH, "w") as f:
        json.dump({"mode": mode}, f)

# ── Format helpers ───────────────────────────────────────────────────

def _esc(text: str) -> str:
    """Escape text for Telegram HTML parse mode."""
    return _html.escape(text or "")

def _bold(text: str) -> str:
    return f"<b>{_esc(text)}</b>"

def _code(text: str) -> str:
    return f"<code>{_esc(text)}</code>"

def _pre(text: str) -> str:
    return f"<pre>{_esc(text)}</pre>"

def format_for_telegram(text: str) -> str:
    """Convert markdown-ish text to Telegram HTML.  Ported from telegram.js."""
    if not text:
        return ""
    import re as _re

    # Extract trailing metrics block
    metrics = ""
    mm = _re.search(r"\n\n---\n⏱️.*$", text)
    if mm:
        metrics = mm.group(0).replace("---", "━━━").replace("**", "").strip()
        text = text[:mm.start()]

    result = text
    # Escape HTML first, then selectively un-escape our own tags
    result = result.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    result = _re.sub(r"^#+\s+(.*)$", r"<b>\1</b>", result, flags=_re.MULTILINE)
    result = _re.sub(r"^\s*[\*\-]\s+", "• ", result, flags=_re.MULTILINE)
    result = _re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", result)
    result = _re.sub(r"__(.+?)__", r"<u>\1</u>", result)
    result = _re.sub(r"\*(.+?)\*", r"<i>\1</i>", result)
    result = _re.sub(r"_(.+?)_", r"<i>\1</i>", result)
    result = _re.sub(r"```([\s\S]*?)```", r"<pre>\1</pre>", result)
    result = _re.sub(r"`([^`]+)`", r"<code>\1</code>", result)
    result = result.replace("---", "━━━━━━")

    if metrics:
        result += f"\n\n<i>{_esc(metrics)}</i>"
    return result


# ── Helpers ──────────────────────────────────────────────────────────

async def _call_api(method: str, path: str, body: dict = None) -> Optional[dict]:
    import aiohttp
    async with aiohttp.ClientSession() as s:
        kwargs = {"headers": {"Authorization": "Bearer hat"}}
        if body:
            kwargs["json"] = body
        async with getattr(s, method)(f"{API_URL}{path}", **kwargs) as r:
            if r.status >= 400:
                logger.warning("API %s %s -> %s", method, path, r.status)
                return None
            return await r.json() if r.content_length else None


async def _call_agent(session_id: str, text: str) -> str:
    """Send a message to the agent and get the response (non-streaming).

    The API returns SSE events with varying types: "think" (streaming thoughts
    with "content" field), "tool" (tool results with "label" field),
    and "done" (completion signal).  We collect text from all event types.
    """
    import aiohttp
    async with aiohttp.ClientSession() as s:
        async with s.post(
            f"{API_URL}/api/sessions/{session_id}/messages",
            json={"content": text},
            headers={"Authorization": "Bearer hat"},
        ) as r:
            if r.status != 200:
                return f"Loi: {r.status}"
            lines: list[str] = []
            buffer = b""
            async for chunk in r.content:
                buffer += chunk
                while b"\n" in buffer:
                    raw, buffer = buffer.split(b"\n", 1)
                    decoded = raw.decode("utf-8", errors="replace").strip()
                    if not decoded or not decoded.startswith("data: "):
                        continue
                    try:
                        data = json.loads(decoded[6:])
                        ev_type = data.get("type")
                        if ev_type == "done":
                            return "".join(lines) if lines else "(no response)"
                        # "content" events: streamed final reply from the LLM.
                        # "tool" events: _thinking tool carries the reply in "label".
                        if ev_type == "content":
                            text_val = data.get("content")
                            if text_val and isinstance(text_val, str):
                                lines.append(text_val)
                        elif ev_type == "tool":
                            text_val = data.get("label")
                            if text_val and isinstance(text_val, str) and data.get("status") == "done":
                                lines.append(text_val)
                    except json.JSONDecodeError:
                        continue
            return "".join(lines) if lines else "(no response)"


def _format_price_line(item: dict) -> str:
    t = item.get("type", "")
    buy = item.get("buyPrice", 0)
    sell = item.get("sellPrice", 0)
    def fmt(v):
        try: return f"{float(v):,.0f}".replace(",", ".")
        except: return str(v)
    return f"- {t}: Mua {fmt(buy)} | Ban {fmt(sell)}"


async def _get_gold_price() -> str:
    """Fetch gold price from DOJI."""
    import aiohttp
    import re as _re
    try:
        async with aiohttp.ClientSession(headers={"User-Agent": "Mozilla/5.0"}) as s:
            async with s.get("https://giavang.doji.vn/trangchu.html", timeout=aiohttp.ClientTimeout(total=15)) as r:
                html = await r.text()
        rows = []
        for tr in _re.finditer(r"<tr[^>]*>(.*?)</tr>", html, _re.DOTALL):
            cols = _re.findall(r"<td[^>]*>(.*?)</td>", tr.group(1), _re.DOTALL)
            if len(cols) >= 3:
                t = _re.sub(r"<[^>]*>", "", cols[0]).strip()
                b = _re.sub(r"<[^>]*>", "", cols[1]).strip()
                s = _re.sub(r"<[^>]*>", "", cols[2]).strip()
                if t and b.replace(",", "").replace(".", "").isdigit():
                    rows.append(f"- {t}: Mua {b} | Ban {s}")
        if not rows:
            return "Khong tim thay bang gia tren DOJI."
        tm = _re.search(r"Cap nhat luc:?\s*([^<]+)", html, _re.I)
        ts = tm.group(1).strip() if tm else "Vua xong"
        return f"### GIA VANG DOJI\ngiavang.doji.vn - Cap nhat: {ts}\n\n" + "\n".join(rows[:20])
    except Exception as e:
        return f"Loi lay gia vang: {e}"


# ── Command Handlers ─────────────────────────────────────────────────

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "<b>🚀 [Telegram] CHÀO MỪNG BẠN ĐẾN VỚI HAGENT</b>\n\n"
        "Tôi là <b>Trợ lý AI đa năng</b>, sẵn sàng hỗ trợ công việc, lập trình và tra cứu thông tin.\n\n"
        "<b>📋 LỆNH CHÍNH:</b>\n"
        "  💰 /giavang — Giá vàng DOJI\n"
        "  🌤 /thoitiet — Dự báo thời tiết\n"
        "  📰 /tinmoi — Tin tức mới nhất\n"
        "  🔄 /new — Phiên chat mới\n"
        "  📊 /status — Trạng thái hệ thống\n"
        "  🎯 /goal — Xem/đặt mục tiêu\n"
        "  🖥 /terminal — Mở Terminal Claude\n"
        "  ⚙️ /chuyenclaude — Đổi Claude Terminal model\n\n"
        "<b>🖥 ĐIỀU KHIỂN:</b>\n"
        "  💻 /bat — Bật máy (WOL)\n"
        "  🔌 /tat — Tắt máy (SSH)\n"
        "  🟢 /rustdesk — Bật/tắt RustDesk\n"
        "  🤖 /chuyenmohinh — Đổi AI\n\n"
        "<b>🛠 DỊCH VỤ REMOTE:</b>\n"
        "  🚀 /lmstudio — LM Studio Remote\n"
        "  💻 /lmstudio_local — LM Studio Local\n"
        "  🦙 /ollama — Ollama Remote\n"
        "  🏗️ /llamacpp — Llama-cpp Remote\n"
        "  🛑 /off — Tắt tất cả dịch vụ\n\n"
        "<i>Gửi tin nhắn bất kỳ để bắt đầu!</i>",
        parse_mode="HTML",
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "<b>ℹ️ GIỚI THIỆU HAGENT BOT</b>\n\n"
        "<b>HAgent</b> là trợ lý AI cá nhân, giúp bạn:\n"
        "• Trò chuyện & trả lời câu hỏi với AI\n"
        "• Tra cứu giá vàng, thời tiết, tin tức\n"
        "• Điều khiển máy tính từ xa (bật/tắt)\n"
        "• Quản lý RustDesk, dịch vụ AI\n"
        "• Mở Claude Terminal với nhiều model\n\n"
        "<b>📋 TRA CỨU:</b>\n"
        "  /giavang | /thoitiet | /tinmoi | /status\n\n"
        "<b>💬 TRÒ CHUYỆN AI:</b>\n"
        "  /new | /goal | gửi tin nhắn bất kỳ\n\n"
        "<b>🖥 ĐIỀU KHIỂN:</b>\n"
        "  /bat | /tat | /rustdesk | /terminal | /chuyenmohinh | /chuyenclaude\n\n"
        "<b>🛠 DỊCH VỤ:</b>\n"
        "  /lmstudio | /lmstudio_local | /ollama | /llamacpp | /off\n\n"
        "<i>Bot chạy trên Python + PTB, backend FastAPI.</i>",
        parse_mode="HTML",
    )

async def new_session(update: Update, context: ContextTypes.DEFAULT_TYPE):
    result = await _call_api("post", "/api/sessions", {"title": "[Te] Chat"})
    if result:
        context.user_data["session_id"] = result["id"]
        await update.message.reply_text("✅ Đã tạo phiên mới.", parse_mode="HTML")
    else:
        await update.message.reply_text("❌ Lỗi tạo phiên.", parse_mode="HTML")

async def gold_price(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("⏳ Đang lấy giá vàng DOJI...")
    result = await _get_gold_price()
    await update.message.reply_text(result[:4000], parse_mode="HTML")

async def chuyenclaude(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Chọn Claude Terminal mode — inline keyboard."""
    current = _read_claude_terminal_mode()
    modes = {
        "deepseek": "🟢 DeepSeek Proxy",
        "ollama": "🔵 Ollama Remote",
        "lmstudio": "🟡 LM Studio Remote",
        "llamacpp": "🟣 Llama.cpp",
        "lmstudio_local": "🟠 LM Studio Local",
        "cx": "🌐 9Router",
    }
    keyboard = []
    for key, label in modes.items():
        marker = "✅ " if key == current else ""
        keyboard.append([InlineKeyboardButton(f"{marker}{label}", callback_data=f"claudemode:{key}")])
    await update.message.reply_text(
        "<b>⚙️ Chọn Claude Terminal Mode:</b>\n"
        f"Hiện tại: <b>{_esc(modes.get(current, current))}</b>\n\n"
        f"Dùng /terminal để mở Terminal với mode đã chọn.",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="HTML",
    )


async def terminal(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Mở Terminal.app với Claude Code + model đã chọn."""
    current_mode = _read_claude_terminal_mode()
    config = CLAUDE_TERMINAL_MODES.get(current_mode, {})

    label = config.get("label", current_mode)
    base_url = config.get("base_url", "")
    model = config.get("model", "")
    api_key = config.get("api_key", "")

    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    if current_mode == "cx":
        tg_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
        export_cmd = f'export TELEGRAM_BOT_TOKEN="{tg_token}" && cd "{project_root}" && claude "Calling plugin:telegram:telegram" --channels plugin:telegram@claude-plugins-official'
    else:
        tg_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
        export_cmd = (
            f'export TELEGRAM_BOT_TOKEN="{tg_token}"'
            f' && export ANTHROPIC_BASE_URL="{base_url}"'
            f' && export ANTHROPIC_API_KEY="{api_key}"'
            f' && export ANTHROPIC_MODEL="{model}"'
            f' && cd "{project_root}"'
            f' && claude "Calling plugin:telegram:telegram"'
            f' --channels plugin:telegram@claude-plugins-official'
        )

    escaped = export_cmd.replace('"', '\\"')
    apple_script = (
        f'tell application "Terminal" to activate\n'
        f'tell application "Terminal" to do script "{escaped}"'
    )

    try:
        subprocess.run(["osascript", "-e", apple_script], capture_output=True, text=True, timeout=10)
        await update.message.reply_text(
            f"🚀 Đang mở Terminal...\n"
            f"Mô hình: <b>{_esc(label)}</b>\n\n"
            f"Nếu không thấy Terminal bật lên, hãy copy lệnh:\n"
            f"<pre>{_esc(export_cmd)}</pre>",
            parse_mode="HTML",
        )
    except Exception as e:
        await update.message.reply_text(
            f"❌ Lỗi mở Terminal: {_esc(str(e))}\n\n"
            f"Lệnh thủ công:\n<pre>{_esc(export_cmd)}</pre>",
            parse_mode="HTML",
        )


async def weather(update: Update, context: ContextTypes.DEFAULT_TYPE):
    location = " ".join(context.args) or "Ho Chi Minh"
    await update.message.reply_text(f"⏳ Đang lấy thời tiết <b>{_esc(location)}</b>...", parse_mode="HTML")
    import aiohttp
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(
                f"https://geocoding-api.open-meteo.com/v1/search?name={location}&count=1&language=vi&format=json"
            ) as r:
                geo = (await r.json()).get("results", [None])[0]
            if not geo:
                await update.message.reply_text(f"Khong tim thay dia diem: {location}")
                return
            async with s.get(
                f"https://api.open-meteo.com/v1/forecast"
                f"?latitude={geo['latitude']}&longitude={geo['longitude']}"
                f"&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m"
                f"&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto"
            ) as r:
                w = await r.json()
        codes = {0: "☀️ Trời quang", 1: "🌤 Ít mây", 2: "⛅ Nhiều mây", 3: "☁️ U ám",
                 45: "🌫 Sương mù", 61: "🌧 Mưa nhẹ", 63: "🌧 Mưa vừa", 65: "⛈ Mưa nặng hạt",
                 80: "🌦 Mưa rào", 95: "⚡ Giông bão"}
        cur, daily = w.get("current", {}), w.get("daily", {})
        name = f"{geo.get('name')}, {geo.get('country', '')}"
        cond = codes.get(cur.get("weather_code"), f"Mã {cur.get('weather_code')}")
        await update.message.reply_text(
            f"<b>🌤 Thời tiết {_esc(name)}</b>\n"
            f"━━━━━━━━━━━━━━━━\n"
            f"🌡 Nhiệt độ: <b>{cur.get('temperature_2m', '?')}°C</b>\n"
            f"🌡 Cảm giác: <b>{cur.get('apparent_temperature', '?')}°C</b>\n"
            f"💧 Độ ẩm: <b>{cur.get('relative_humidity_2m', '?')}%</b>\n"
            f"💨 Gió: <b>{cur.get('wind_speed_10m', '?')} km/h</b>\n"
            f"{cond}\n"
            f"📈 Cao nhất: <b>{daily.get('temperature_2m_max', ['?'])[0]}°C</b> / "
            f"Thấp nhất: <b>{daily.get('temperature_2m_min', ['?'])[0]}°C</b>",
            parse_mode="HTML",
        )
    except Exception as e:
        await update.message.reply_text(f"Loi lay thoi tiet: {e}")

async def news(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("⏳ Đang lấy tin tức từ VnExpress...")
    from tools.news_tool import _fetch_vnexpress
    result = await _fetch_vnexpress()
    if result:
        formatted = format_for_telegram(result)
        for chunk in [formatted[i:i+4000] for i in range(0, len(formatted), 4000)]:
            await update.message.reply_text(chunk, parse_mode="HTML")
    else:
        await update.message.reply_text("❌ Không lấy được tin tức.")

async def wake_on_lan(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("⏳ Đang gửi tín hiệu Wake-on-LAN...")
    from tools.remote_power_tool import _handle_remote_power
    result = await _handle_remote_power({"action": "wol"})
    await update.message.reply_text(f"🖥 {_esc(result)}", parse_mode="HTML")

async def shutdown(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("⏳ Đang tắt máy...")
    from tools.remote_power_tool import _handle_remote_power
    result = await _handle_remote_power({"action": "shutdown"})
    await update.message.reply_text(f"🔌 {_esc(result)}", parse_mode="HTML")

async def rustdesk(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Điều khiển RustDesk — inline buttons On/Off."""
    keyboard = [[
        InlineKeyboardButton("🟢 Bật RustDesk", callback_data="rustdesk:on"),
        InlineKeyboardButton("🔴 Tắt RustDesk", callback_data="rustdesk:off"),
    ]]
    await update.message.reply_text(
        "🖥 <b>RustDesk Server</b>\nChọn hành động:",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="HTML",
    )


# ── Remote Service Control ──────────────────────────────────────────

async def _remote_service(cmd_suffix: str, label: str, emoji: str) -> str:
    """SSH into remote machine and run a systemctl command."""
    from tools.remote_power_tool import _ssh_exec
    result = await _ssh_exec(cmd_suffix)
    if result.startswith("❌") or result.startswith("⏰"):
        return result
    return f"{emoji} Đã bật {label} và tắt các dịch vụ khác."


async def lmstudio_service(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("⏳ Đang bật LM Studio trên máy remote...")
    from tools.remote_power_tool import _ssh_exec
    result = await _ssh_exec(
        "sudo systemctl stop ollama && systemctl --user stop llamacpp.service "
        "&& systemctl --user start lmstudio.service"
    )
    if result.startswith("❌") or result.startswith("⏰"):
        await update.message.reply_text(f"❌ Lỗi bật LM Studio: {_esc(result)}", parse_mode="HTML")
    else:
        await update.message.reply_text("🚀 Đã bật LM Studio (Remote) và tắt các dịch vụ khác.", parse_mode="HTML")


async def ollama_service(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("⏳ Đang bật Ollama trên máy remote...")
    from tools.remote_power_tool import _ssh_exec
    result = await _ssh_exec(
        "systemctl --user stop lmstudio.service && systemctl --user stop llamacpp.service "
        "&& sudo systemctl start ollama"
    )
    if result.startswith("❌") or result.startswith("⏰"):
        await update.message.reply_text(f"❌ Lỗi bật Ollama: {_esc(result)}", parse_mode="HTML")
    else:
        await update.message.reply_text("🦙 Đã bật Ollama (Remote) và tắt các dịch vụ khác.", parse_mode="HTML")


async def llamacpp_service(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("⏳ Đang bật Llama-cpp trên máy remote...")
    from tools.remote_power_tool import _ssh_exec
    result = await _ssh_exec(
        "sudo systemctl stop ollama && systemctl --user stop lmstudio.service "
        "&& systemctl --user start llamacpp.service"
    )
    if result.startswith("❌") or result.startswith("⏰"):
        await update.message.reply_text(f"❌ Lỗi bật Llama-cpp: {_esc(result)}", parse_mode="HTML")
    else:
        await update.message.reply_text("🏗️ Đã bật Llama-cpp (Remote) và tắt các dịch vụ khác.", parse_mode="HTML")


async def stop_all_services(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("⏳ Đang tắt tất cả dịch vụ trên máy remote...")
    from tools.remote_power_tool import _ssh_exec
    result = await _ssh_exec(
        "sudo systemctl stop ollama && systemctl --user stop lmstudio.service "
        "&& systemctl --user stop llamacpp.service"
    )
    if result.startswith("❌") or result.startswith("⏰"):
        await update.message.reply_text(f"❌ Lỗi tắt dịch vụ: {_esc(result)}", parse_mode="HTML")
    else:
        await update.message.reply_text("🛑 Đã tắt tất cả dịch vụ AI trên Remote.", parse_mode="HTML")


async def lmstudio_local(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("⏳ Đang mở LM Studio trên máy Mac...")
    try:
        subprocess.run(["open", "-a", "LM Studio"], capture_output=True, text=True, timeout=5)
        await update.message.reply_text("💻 Đã mở LM Studio trên máy Mac (Local).", parse_mode="HTML")
    except Exception as e:
        await update.message.reply_text(f"❌ Lỗi mở LM Studio: {_esc(str(e))}", parse_mode="HTML")


async def change_model(update: Update, context: ContextTypes.DEFAULT_TYPE):
    providers = {
        "deepseek": "🟢 DeepSeek V3",
        "lmstudio": "🟡 LM Studio (Remote)",
        "lmstudio_local": "🟠 LM Studio (Local)",
        "ollama": "🔵 Ollama",
        "llamacpp": "🟣 Llama.cpp",
        "cx": "🌐 9Router",
    }
    keyboard = [[InlineKeyboardButton(label, callback_data=f"provider:{key}")] for key, label in providers.items()]
    await update.message.reply_text(
        "<b>🤖 Chọn model AI:</b>",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="HTML",
    )

async def status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    import psutil
    ram = psutil.virtual_memory()
    cpu = psutil.cpu_percent(interval=1)
    await update.message.reply_text(
        f"🟢 <b>HAgent Bot</b> đang chạy\n"
        f"⚡ CPU: {cpu}%\n"
        f"💾 RAM: {ram.percent}%\n"
        f"🔗 API: {_esc(API_URL)}",
        parse_mode="HTML",
    )

async def _forward_to_agent(update: Update, context: ContextTypes.DEFAULT_TYPE, text: str) -> None:
    sid = context.user_data.get("session_id")
    if not sid:
        # Try to get the latest session
        sessions = await _call_api("get", "/api/sessions")
        if sessions and len(sessions) > 0:
            sid = sessions[0].get("id") if isinstance(sessions, list) else sessions.get("id")
            if sid:
                context.user_data["session_id"] = sid
    if not sid:
        # Still no session, create a new one
        result = await _call_api("post", "/api/sessions", {"title": "[Te] Chat"})
        if result:
            sid = result.get("id")
            context.user_data["session_id"] = sid
    if not sid:
        await update.message.reply_text(
            "❌ Không thể tạo phiên chat. Vui lòng thử /new.",
            parse_mode="HTML",
        )
        return
    await update.message.reply_chat_action("typing")
    try:
        response = await _call_agent(sid, text)
        formatted = format_for_telegram(response)
        for chunk in [formatted[i:i+4000] for i in range(0, len(formatted), 4000)]:
            try:
                await update.message.reply_text(chunk, parse_mode="HTML")
            except Exception:
                # Fallback: strip HTML and send as plain text
                import re
                plain = re.sub(r"<[^>]+>", "", chunk)
                await update.message.reply_text(plain)
    except Exception as e:
        await update.message.reply_text(f"❌ Lỗi: {_esc(str(e))}", parse_mode="HTML")


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = (update.message.text or "").strip()
    if not text:
        return
    if text.lower() in ["ok", "roger", "lam di", "tiep di", "continue", "yes", "y"]:
        await update.message.reply_text("✅ Đã rõ, tiếp tục!", parse_mode="HTML")
        return
    await _forward_to_agent(update, context, text)


async def handle_goal(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Xem, đặt, xoá hoặc tiếp tục mục tiêu."""
    args_text = " ".join(context.args).strip()

    if not args_text:
        result = await _call_api("get", "/api/goals")
        if result and len(result) > 0:
            lines = [f"{i+1}. {_esc(g.get('title', ''))}" for i, g in enumerate(result[:10])]
            await update.message.reply_text("🎯 <b>Mục tiêu hiện tại:</b>\n" + "\n".join(lines), parse_mode="HTML")
        else:
            await update.message.reply_text("📭 Không có mục tiêu nào. Gõ /goal <mục tiêu> để đặt.", parse_mode="HTML")
        return

    cmd = args_text.lower()
    if cmd == "clear":
        result = await _call_api("delete", "/api/goals")
        if result is not None:
            await update.message.reply_text("🗑 Đã xoá tất cả mục tiêu.", parse_mode="HTML")
        else:
            await update.message.reply_text("❌ Lỗi xoá mục tiêu.")
    elif cmd == "resume":
        result = await _call_api("post", "/api/goals/resume")
        if result:
            await update.message.reply_text("▶️ Đã tiếp tục mục tiêu trước đó.", parse_mode="HTML")
        else:
            await update.message.reply_text("❌ Lỗi tiếp tục mục tiêu.")
    else:
        result = await _call_api("post", "/api/goals", {"goal": args_text})
        if result:
            await update.message.reply_text(f"✅ Đã đặt mục tiêu: <b>{_esc(args_text)}</b>", parse_mode="HTML")
        else:
            await update.message.reply_text("❌ Lỗi đặt mục tiêu.")


async def handle_fallback_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    cmd = (update.message.text or "").strip().split()[0]
    await update.message.reply_text(
        f"❌ Lệnh <code>{_esc(cmd)}</code> không tồn tại. Gõ /help để xem danh sách lệnh.",
        parse_mode="HTML",
    )


# ── Callback Handler ─────────────────────────────────────────────────

async def callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data or ""

    if data.startswith("provider:"):
        provider = data.split(":", 1)[1]
        labels = {
            "deepseek": "🟢 DeepSeek V3",
            "lmstudio": "🟡 LM Studio (Remote)",
            "lmstudio_local": "🟠 LM Studio (Local)",
            "ollama": "🔵 Ollama",
            "llamacpp": "🟣 Llama.cpp",
            "cx": "🌐 9Router",
        }
        result = await _call_api("put", "/api/auth/provider", {"provider": provider})
        if result:
            await query.edit_message_text(
                f"✅ Đã chuyển sang: <b>{labels.get(provider, provider)}</b>",
                parse_mode="HTML",
            )
        else:
            await query.edit_message_text("❌ Lỗi chuyển đổi nhà cung cấp AI.")

    elif data.startswith("claudemode:"):
        mode = data.split(":", 1)[1]
        _write_claude_terminal_mode(mode)
        config = CLAUDE_TERMINAL_MODES.get(mode, {})
        await query.edit_message_text(
            f"✅ Đã chọn Claude Terminal mode: <b>{_esc(config.get('label', mode))}</b>\n\n"
            f"Dùng /terminal để mở Terminal với mode này.",
            parse_mode="HTML",
        )

    elif data.startswith("rustdesk:"):
        action = data.split(":", 1)[1]
        try:
            if action == "on":
                os.system("killall hbbs hbbr 2>/dev/null; kill -9 $(lsof -ti :8006 :8007) 2>/dev/null &")
                await asyncio.sleep(0.5)
                os.system("bash /Users/nguyenhat/HAgent/scripts/rustdesk-on.sh &")
                await query.edit_message_text("🖥 <b>RustDesk</b>\n🟢 Đã bật.", parse_mode="HTML")
            else:
                os.system("killall hbbs hbbr RustDesk 2>/dev/null")
                os.system("bash /Users/nguyenhat/HAgent/scripts/rustdesk-off.sh &")
                await query.edit_message_text("🖥 <b>RustDesk</b>\n🔴 Đã tắt.", parse_mode="HTML")
        except Exception as e:
            await query.edit_message_text(f"❌ Lỗi: {_esc(str(e))}", parse_mode="HTML")


# ── Main ────────────────────────────────────────────────────────────

def main():
    token = BOT_TOKEN or os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token:
        logger.error("TELEGRAM_BOT_TOKEN not set")
        sys.exit(1)

    app = Application.builder().token(token).build()
    sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CommandHandler("new", new_session))
    app.add_handler(CommandHandler("bat", wake_on_lan))
    app.add_handler(CommandHandler("tat", shutdown))
    app.add_handler(CommandHandler("giavang", gold_price))
    app.add_handler(CommandHandler("thoitiet", weather))
    app.add_handler(CommandHandler("tinmoi", news))
    app.add_handler(CommandHandler("rustdesk", rustdesk))
    app.add_handler(CommandHandler("chuyenmohinh", change_model))
    app.add_handler(CommandHandler("lmstudio", lmstudio_service))
    app.add_handler(CommandHandler("lmstudio_local", lmstudio_local))
    app.add_handler(CommandHandler("ollama", ollama_service))
    app.add_handler(CommandHandler("llamacpp", llamacpp_service))
    app.add_handler(CommandHandler("off", stop_all_services))
    app.add_handler(CommandHandler("chuyenclaude", chuyenclaude))
    app.add_handler(CommandHandler("terminal", terminal))
    app.add_handler(CommandHandler("status", status))
    app.add_handler(CommandHandler("goal", handle_goal))
    app.add_handler(CallbackQueryHandler(callback_handler))
    # Fallback for unknown commands — must be last in group 0 so it only fires if no CommandHandler matched
    app.add_handler(MessageHandler(filters.COMMAND, handle_fallback_command))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    # Register Telegram bot commands from the central COMMAND_REGISTRY
    # so users see the full command list in the / autocomplete menu.
    # Must use post_init — calling asyncio.run() before run_polling()
    # creates a separate event loop that corrupts PTB's internal state.
    async def _register_commands(app: Application):
        try:
            from telegram import BotCommand

            custom_commands = [
                BotCommand("giavang", "💰 Giá vàng DOJI"),
                BotCommand("thoitiet", "🌤 Dự báo thời tiết"),
                BotCommand("tinmoi", "📰 Tin tức mới nhất"),
                BotCommand("new", "🔄 Phiên chat mới"),
                BotCommand("status", "📊 Trạng thái hệ thống"),
                BotCommand("goal", "🎯 Xem/đặt mục tiêu"),
                BotCommand("terminal", "🖥 Mở Terminal Claude"),
                BotCommand("chuyenclaude", "⚙️ Đổi Claude Terminal model"),
                BotCommand("bat", "💻 Bật máy (WOL)"),
                BotCommand("tat", "🔌 Tắt máy (SSH)"),
                BotCommand("rustdesk", "🟢 Bật/tắt RustDesk"),
                BotCommand("chuyenmohinh", "🤖 Đổi AI"),
                BotCommand("lmstudio", "🚀 LM Studio Remote"),
                BotCommand("lmstudio_local", "💻 LM Studio Local"),
                BotCommand("ollama", "🦙 Ollama Remote"),
                BotCommand("llamacpp", "🏗️ Llama-cpp Remote"),
                BotCommand("off", "🛑 Tắt tất cả dịch vụ"),
            ]

            await app.bot.set_my_commands(custom_commands)
            await app.bot.set_my_name("HAgent [Telegram]")
            await app.bot.set_my_description("Trợ lý AI đa năng qua Telegram")
            logger.info("Telegram menu: %d commands registered", len(custom_commands))
        except Exception as e:
            logger.warning("Could not register Telegram command menu: %s", e)

    app.post_init = _register_commands

    logger.info("Telegram bot starting...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
