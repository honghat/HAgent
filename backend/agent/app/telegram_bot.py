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

API_URL = os.environ.get("HAGENT_API_URL", "http://127.0.0.1:8010")
BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")

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
        "<b>🚀 CHÀO MỪNG BẠN ĐẾN VỚI HAGENT</b>\n\n"
        "Tôi là <b>Trợ lý AI đa năng</b>, sẵn sàng hỗ trợ công việc, lập trình và tra cứu thông tin.\n\n"
        "<b>📋 LỆNH CHÍNH:</b>\n"
        "  💰 /giavang — Giá vàng DOJI\n"
        "  🌤 /thoitiet — Dự báo thời tiết\n"
        "  📰 /tinmoi — Tin tức mới nhất\n"
        "  🔄 /new — Phiên chat mới\n"
        "  📊 /status — Trạng thái hệ thống\n"
        "  🎯 /goal — Xem/đặt mục tiêu\n"
        "  🖥 /terminal — Terminal Claude\n\n"
        "<b>🖥 ĐIỀU KHIỂN:</b>\n"
        "  💻 /bat — Bật máy (WOL)\n"
        "  🔌 /tat — Tắt máy (SSH)\n"
        "  🟢 /rustdesk — Bật/tắt RustDesk\n"
        "  🤖 /chuyenmohinh — Đổi AI\n\n"
        "<i>Gửi tin nhắn bất kỳ để bắt đầu!</i>",
        parse_mode="HTML",
    )

async def new_session(update: Update, context: ContextTypes.DEFAULT_TYPE):
    result = await _call_api("post", "/api/sessions", {"title": "[Telegram-bot] Chat"})
    if result:
        context.user_data["session_id"] = result["id"]
        await update.message.reply_text("✅ Đã tạo phiên mới.", parse_mode="HTML")
    else:
        await update.message.reply_text("❌ Lỗi tạo phiên.", parse_mode="HTML")

async def gold_price(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("⏳ Đang lấy giá vàng DOJI...")
    result = await _get_gold_price()
    await update.message.reply_text(result[:4000], parse_mode="HTML")

async def terminal(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Mở terminal Claude — dùng 9Router model."""
    prompt = " ".join(context.args).strip()
    if not prompt:
        await update.message.reply_text(
            "<b>🖥 Terminal (9Router)</b>\n"
            "Gõ lệnh sau /terminal:\n"
            "<code>/terminal kiểm tra ổ cứng</code>\n"
            "<code>/terminal cài package XXX</code>",
            parse_mode="HTML",
        )
        return
    # Switch to 9Router provider for this session
    await _call_api("put", "/api/auth/provider", {"provider": "cx"})
    await _forward_to_agent(update, context, f"[TERMINAL] {prompt}")

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
    await update.message.reply_text("⏳ Đang lấy tin tức...")
    result = await _call_api("get", "/api/wiki/search?q=tin+tuc")
    if result and len(result) > 0:
        lines = [f"{i+1}. {_esc(e['title'])}" for i, e in enumerate(result[:5])]
        await update.message.reply_text("📰 <b>Tin tức:</b>\n" + "\n".join(lines), parse_mode="HTML")
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
    if context.args and context.args[0] == "off":
        script = os.path.join(os.path.dirname(__file__), "..", "..", "..", "scripts", "rustdesk-off.sh")
        result = subprocess.run(["bash", script], capture_output=True, text=True)
        await update.message.reply_text(f"🔴 RustDesk OFF: {_esc(result.stdout or result.stderr)}", parse_mode="HTML")
    else:
        script = os.path.join(os.path.dirname(__file__), "..", "..", "..", "scripts", "rustdesk-on.sh")
        result = subprocess.run(["bash", script], capture_output=True, text=True)
        await update.message.reply_text(f"🟢 RustDesk ON: {_esc(result.stdout or result.stderr)}", parse_mode="HTML")

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

async def _get_or_create_session(context: ContextTypes.DEFAULT_TYPE) -> Optional[str]:
    sid = context.user_data.get("session_id")
    if not sid:
        result = await _call_api("post", "/api/sessions", {"title": "[Telegram-bot] Chat"})
        if not result:
            return None
        sid = result["id"]
        context.user_data["session_id"] = sid
    return sid


async def _forward_to_agent(update: Update, context: ContextTypes.DEFAULT_TYPE, text: str) -> None:
    sid = await _get_or_create_session(context)
    if not sid:
        await update.message.reply_text("❌ Lỗi khởi tạo phiên.", parse_mode="HTML")
        return
    await update.message.reply_chat_action("typing")
    try:
        response = await _call_agent(sid, text)
        formatted = format_for_telegram(response)
        for chunk in [formatted[i:i+4000] for i in range(0, len(formatted), 4000)]:
            await update.message.reply_text(chunk, parse_mode="HTML")
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
    """Xem hoặc đặt mục tiêu cho phiên chat."""
    args_text = " ".join(context.args).strip()
    if not args_text:
        await _forward_to_agent(update, context, "/goal")
    else:
        await _forward_to_agent(update, context, f"/goal {args_text}")


async def handle_fallback_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Catch-all for commands not handled by specific handlers — forwards to agent (uses all tools)."""
    text = (update.message.text or "").strip()
    if not text:
        return
    await _forward_to_agent(update, context, text)


# ── Callback Handler ─────────────────────────────────────────────────

async def callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data or ""
    if data.startswith("provider:"):
        provider = data.split(":", 1)[1]
        labels = {
            "deepseek": "DeepSeek V3",
            "lmstudio": "LM Studio (Remote)",
            "lmstudio_local": "LM Studio (Local)",
            "ollama": "Ollama",
            "llamacpp": "Llama.cpp",
            "cx": "9Router",
        }
        result = await _call_api("put", "/api/auth/provider", {"provider": provider})
        if result:
            await query.edit_message_text(
                f"✅ Đã chuyển sang: <b>{labels.get(provider, provider)}</b>",
                parse_mode="HTML",
            )
        else:
            await query.edit_message_text("❌ Lỗi chuyển provider.")


# ── Main ────────────────────────────────────────────────────────────

def main():
    token = BOT_TOKEN or os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token:
        logger.error("TELEGRAM_BOT_TOKEN not set")
        sys.exit(1)

    app = Application.builder().token(token).build()
    sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("new", new_session))
    app.add_handler(CommandHandler("bat", wake_on_lan))
    app.add_handler(CommandHandler("tat", shutdown))
    app.add_handler(CommandHandler("giavang", gold_price))
    app.add_handler(CommandHandler("thoitiet", weather))
    app.add_handler(CommandHandler("tinmoi", news))
    app.add_handler(CommandHandler("rustdesk", rustdesk))
    app.add_handler(CommandHandler("chuyenmohinh", change_model))
    app.add_handler(CommandHandler("chuyenclaude", change_model))
    app.add_handler(CommandHandler("terminal", terminal))
    app.add_handler(CommandHandler("status", status))
    app.add_handler(CommandHandler("goal", handle_goal))
    app.add_handler(CallbackQueryHandler(callback_handler))
    # Fallback (group=1): catch commands not handled by specific handlers above,
    # forwarding them to the agent which has access to all tools.
    app.add_handler(MessageHandler(filters.COMMAND, handle_fallback_command), group=1)
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    # Register Telegram bot commands from the central COMMAND_REGISTRY
    # so users see the full command list in the / autocomplete menu.
    # Must use post_init — calling asyncio.run() before run_polling()
    # creates a separate event loop that corrupts PTB's internal state.
    async def _register_commands(app: Application):
        try:
            from telegram import BotCommand
            from hagent_cli.commands import telegram_menu_commands
            menu_commands, hidden_count = telegram_menu_commands(max_commands=100)
            bot_commands = [BotCommand(name, desc) for name, desc in menu_commands]
            await app.bot.set_my_commands(bot_commands)
            if hidden_count:
                logger.info("Telegram menu: %d commands registered, %d hidden (over 100 limit)", len(menu_commands), hidden_count)
        except Exception as e:
            logger.warning("Could not register Telegram command menu: %s", e)

    app.post_init = _register_commands

    logger.info("Telegram bot starting...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
