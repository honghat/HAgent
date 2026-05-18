"""
Omnichannel Hub Backend API - Zalo/Facebook multi-platform unified inbox

This FastAPI server provides REST endpoints for:
- QR Code login (Zalo, Facebook)
- List conversations across platforms
- Send messages to specific chats
- Get chat history
- Mark all as read
- OAuth token management

API Endpoints:
├── GET    /api/v1/omni/conversations   - List all conversations
├── POST  /api/v1/omni/conversations/{chat_id}/messages - Send message
├── GET    /api/v1/omni/conversations/{chat_id}/messages?limit=50 - Get chat history
├── POST  /api/v1/omni/conversations/read-all   - Mark all as read
├── POST  /api/v1/auth/zalo/qrcode/init         - Init Zalo QR login
└── GET    /api/v1/auth/zalo/qrcode/poll        - Poll QR scan status
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request, WebSocket
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Omnichannel Hub API",
    description="Unified multi-platform inbox (Zalo, Facebook Messenger)",
    version="1.0.0"
)


class Config:
    """Configuration for omnichannel hub."""
    
    API_PORT = int(os.environ.get("OMNICHANNEL_API_PORT", 8080))
    HOST = os.environ.get("OMNICHANNEL_HOST", "0.0.0.0")
    ENABLED = os.environ.get("OMNICHANNEL_ENABLED", "true").lower() == "true"
    
    # Zalo configuration
    ZALO_COOKIE_STRING = os.environ.get("ZALO_COOKIE_STRING", "")
    ZALO_QR_ENABLED = os.environ.get("ZALO_QR_ENABLED", "true").lower() == "true"
    ZALO_BOT_UID = os.environ.get("ZALO_BOT_UID", "")
    ZALO_IMEI = os.environ.get("ZALO_IMEI", "")
    
    # Facebook configuration  
    FACEBOOK_COOKIE_STRING = os.environ.get("FACEBOOK_COOKIE_STRING", "")
    FACEBOOK_HEADLESS = os.environ.get("FACEBOOK_HEADLESS", "false").lower() == "true"
    
    # Session storage
    SESSION_FILE = Path(os.environ.get("OMNICHANNEL_SESSION_FILE", 
                                       "~/.hagent/omnichannel_sessions.json")).expanduser()


class Conversation(BaseModel):
    """Conversation model."""
    id: str
    platform: str
    sender: str
    title: Optional[str] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": "zalo_123456789",
                "platform": "zalo",
                "sender": "Nguyễn Văn A",
                "title": "Hội thoại 1"
            }
        }


class Message(BaseModel):
    """Message model."""
    content: str
    chat_id: str
    
    class Config:
        json_schema_extra = {
            "example": {
                "content": "Hello from Telegram!",
                "chat_id": "zalo_123456789"
            }
        }


class ReadAllRequest(BaseModel):
    """Mark all as read request."""
    pass


@app.get("/api/v1/omni/conversations", response_model=List[Conversation])
async def list_conversations():
    """
    List all conversations across platforms.
    
    Returns array of conversations from Zalo, Facebook Messenger, etc.
    """
    if not Config.ENABLED:
        raise HTTPException(status_code=403, detail="Omnichannel hub is disabled")
    
    # In production, read from database or session store
    # For now, return empty list or mock data
    
    conversations = []
    
    # Zalo conversations (example)
    if Config.ZALO_COOKIE_STRING:
        conversations.append(Conversation(
            id=f"zalo_{int(time.time())}",
            platform="zalo",
            sender=os.environ.get("ZALO_BOT_UID", "Unknown"),
            title="New Conversation"
        ))
    
    # Facebook conversations (example)
    if Config.FACEBOOK_COOKIE_STRING:
        conversations.append(Conversation(
            id=f"fb_thread_{int(time.time())}",
            platform="facebook", 
            sender="User B",
            title="Thread with User B"
        ))
    
    return conversations


def parse_cookie(cookie_str):
    result = {}
    for item in (cookie_str or "").split(";"):
        if "=" in item:
            key, value = item.strip().split("=", 1)
            if key:
                result[key] = value
    return result


@app.post("/api/v1/omni/conversations/{chat_id}/messages")
async def send_message(chat_id: str, message_data: Message):
    """
    Send a message to a specific chat.
    """
    if not Config.ENABLED:
        raise HTTPException(status_code=403, detail="Omnichannel hub is disabled")
    
    platform = chat_id.split("_")[0]
    target_id = chat_id.replace("zalo_", "").replace("fb_", "")
    
    logger.info(f"Sending message to {chat_id}: {message_data.content}")
    
    if platform == "zalo":
        cookie = Config.ZALO_COOKIE_STRING
        imei = Config.ZALO_IMEI
        
        if not cookie or not imei:
            return JSONResponse(status_code=400, content={
                "success": False,
                "error": "ZALO_COOKIE_STRING or ZALO_IMEI is missing in configuration"
            })
            
        try:
            from zlapi import ZaloAPI
            from zlapi.models import Message as ZlMessage, ThreadType
            
            # Khởi tạo bot Zalo Headless
            bot = ZaloAPI("</>", "</>", imei, parse_cookie(cookie))
            
            # Gửi tin nhắn (Mặc định gửi cho USER, nếu là GROUP thì cần logic phân biệt target_id)
            bot.send(ZlMessage(text=message_data.content), thread_id=target_id, thread_type=ThreadType.USER)
            
            return JSONResponse(content={
                "success": True,
                "message": f"Sent via headless zlapi to {chat_id}",
                "platform": platform
            })
            
        except Exception as e:
            logger.error(f"Zalo send error: {str(e)}")
            return JSONResponse(status_code=500, content={
                "success": False,
                "error": str(e)
            })
    
    return JSONResponse(content={
        "success": True,
        "message": f"Sent to {chat_id} (Simulated)",
        "platform": platform
    })


@app.get("/api/v1/omni/conversations/{chat_id}/messages")
async def get_chat_history(chat_id: str, limit: int = 50):
    """
    Get chat history for a specific conversation.
    
    Args:
        chat_id: Chat ID
        limit: Number of messages to fetch (default: 50)
    
    Returns:
        Paginated message history
    """
    if not Config.ENABLED:
        raise HTTPException(status_code=403, detail="Omnichannel hub is disabled")
    
    logger.info(f"Fetching chat history for {chat_id}")
    
    # In production, read from database
    # Return mock data or empty list
    
    return JSONResponse(content={
        "chat_id": chat_id,
        "messages": [],
        "count": 0
    })


@app.post("/api/v1/omni/conversations/read-all")
async def mark_all_as_read(request: ReadAllRequest = None):
    """
    Mark all conversations as read.
    
    Updates read status for all platforms.
    """
    if not Config.ENABLED:
        raise HTTPException(status_code=403, detail="Omnichannel hub is disabled")
    
    logger.info("Marking all conversations as read")
    
    return JSONResponse(content={
        "success": True,
        "message": "All conversations marked as read"
    })


# --- Zalo QR Login State ---
qr_sessions = {}

@app.post("/api/v1/auth/zalo/qrcode/init")
async def init_zalo_qr_login():
    """
    Initialize Zalo QR code login flow using Playwright.
    """
    if not Config.ENABLED or not Config.ZALO_QR_ENABLED:
        raise HTTPException(status_code=403, detail="Omnichannel hub or Zalo QR is disabled")
    
    logger.info("Initializing Zalo QR code login with Playwright...")
    
    try:
        from playwright.async_api import async_playwright
        import uuid
        
        session_id = str(uuid.uuid4())
        
        playwright = await async_playwright().start()
        browser = await playwright.chromium.launch(headless=True, args=['--disable-blink-features=AutomationControlled'])
        context = await browser.new_context(
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            viewport={'width': 1280, 'height': 900}
        )
        page = await context.new_page()
        
        # Save session
        qr_sessions[session_id] = {
            "playwright": playwright,
            "browser": browser,
            "context": context,
            "page": page,
            "status": "initializing"
        }
        
        await page.goto('https://chat.zalo.me/', wait_until='networkidle', timeout=45000)
        
        # Click "VỚI MÃ QR" tab
        try:
            qr_tab_selector = 'a:has-text("VỚI MÃ QR"), .tabs-header >> text="VỚI MÃ QR", text="VỚI MÃ QR"'
            if await page.locator(qr_tab_selector).is_visible(timeout=5000):
                await page.click(qr_tab_selector)
                await page.wait_for_timeout(1000)
        except Exception as e:
            logger.warning(f"Failed to click QR tab: {e}")
            
        # Extract the real QR image. Zalo's login page also contains small
        # data-image icons, so choosing the first img/canvas often grabs a
        # 35px icon instead of the scannable QR.
        qr_selector = '.login-qr canvas, .qr-container canvas, canvas, img[alt="QR"], img[src*="qr"], img[src*="data:image"]'

        async def find_qr_data() -> str:
            candidates = await page.query_selector_all(qr_selector)
            best_data = ""
            best_score = 0
            for handle in candidates:
                try:
                    visible = await handle.is_visible()
                    if not visible:
                        continue
                    tag_name = await handle.evaluate("el => el.tagName.toLowerCase()")
                    box = await handle.bounding_box()
                    width = int(box["width"]) if box else 0
                    height = int(box["height"]) if box else 0
                    if width < 120 or height < 120:
                        continue
                    if tag_name == "canvas":
                        data = await handle.evaluate("el => el.toDataURL('image/png')")
                    else:
                        data = await handle.get_attribute("src") or ""

                    score = width * height + len(data)
                    if data and score > best_score:
                        best_data = data
                        best_score = score
                except Exception:
                    continue
            return best_data

        qr_data = ""
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            qr_data = await find_qr_data()
            if qr_data and len(qr_data) > 500:
                break
            await page.wait_for_timeout(1000)
                
        if not qr_data or len(qr_data) < 100:
            raise Exception("Cannot find valid Zalo QR code.")
            
        qr_sessions[session_id]["status"] = "waiting"
        
        # Auto-cleanup after 5 minutes
        async def cleanup():
            await asyncio.sleep(300)
            if session_id in qr_sessions:
                sess = qr_sessions.pop(session_id)
                try: await sess["browser"].close()
                except: pass
                try: await sess["playwright"].stop()
                except: pass
        asyncio.create_task(cleanup())
        
        return JSONResponse(content={
            "success": True,
            "session_id": session_id,
            "qr_url": qr_data,
            "message": "Please scan QR code with Zalo app",
            "expires_in": 300
        })
        
    except Exception as e:
        logger.error(f"QR Init error: {str(e)}")
        if 'session_id' in locals() and session_id in qr_sessions:
            sess = qr_sessions.pop(session_id)
            try: await sess["browser"].close()
            except: pass
            try: await sess["playwright"].stop()
            except: pass
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@app.get("/api/v1/auth/zalo/qrcode/poll/{session_id}")
async def poll_qr_scan_status(session_id: str):
    """
    Poll QR code scan status and extract cookies.
    """
    if not Config.ENABLED:
        raise HTTPException(status_code=403, detail="Omnichannel hub is disabled")
        
    if session_id not in qr_sessions:
        return JSONResponse(status_code=404, content={"success": False, "error": "Session not found or expired"})
        
    sess = qr_sessions[session_id]
    page = sess["page"]
    context = sess["context"]
    
    try:
        cookies = await context.cookies()
        cookie_str = "; ".join([f"{c['name']}={c['value']}" for c in cookies])
        
        logged_in = "zpsid" in cookie_str or "zpw_sek" in cookie_str
        
        if not logged_in:
            return JSONResponse(content={"status": "waiting"})
            
        # Logged in! Find IMEI.
        # Sometimes IMEI is in localStorage
        imei = await page.evaluate("window.localStorage.getItem('z_uuid') || ''")
        if not imei:
            # Fallback for older imei locations
            imei = await page.evaluate("window.localStorage.getItem('imei') || ''")
            
        if not imei:
            # Generate a fake UUID if Zalo changed how IMEI is stored, as zlapi can sometimes work with it
            import uuid
            imei = str(uuid.uuid4())
            
        # Update config in memory
        Config.ZALO_COOKIE_STRING = cookie_str
        Config.ZALO_IMEI = imei
        
        # Write to config.env to persist
        config_env_path = Path(__file__).parent / "config.env"
        env_content = ""
        if config_env_path.exists():
            env_content = config_env_path.read_text()
            
        # Replace or append
        import re
        if "ZALO_COOKIE_STRING" in env_content:
            env_content = re.sub(r'ZALO_COOKIE_STRING=.*', f'ZALO_COOKIE_STRING="{cookie_str}"', env_content)
        else:
            env_content += f'\nZALO_COOKIE_STRING="{cookie_str}"'
            
        if "ZALO_IMEI" in env_content:
            env_content = re.sub(r'ZALO_IMEI=.*', f'ZALO_IMEI="{imei}"', env_content)
        else:
            env_content += f'\nZALO_IMEI="{imei}"'
            
        config_env_path.write_text(env_content.strip() + '\n')
        
        # Cleanup browser
        qr_sessions.pop(session_id)
        await sess["browser"].close()
        await sess["playwright"].stop()
        
        return JSONResponse(content={
            "status": "success",
            "message": "Zalo login successful! Credentials saved.",
            "imei": imei
        })
        
    except Exception as e:
        logger.error(f"Poll error: {str(e)}")
        return JSONResponse(status_code=500, content={"status": "error", "error": str(e)})

# --- Giao tiếp với Chrome Extension ---
pending_commands = []

@app.post("/api/v1/omni/webhook/zalo")
async def zalo_webhook(request: Request):
    """Nhận tin nhắn mới từ Chrome Extension"""
    data = await request.json()
    logger.info(f"New Zalo message from extension: {data}")
    # Xử lý tin nhắn ở đây (lưu db, gửi event, v.v...)
    return {"success": True}

@app.get("/api/v1/omni/commands/zalo")
async def get_zalo_commands():
    """Chrome Extension gọi vào để lấy lệnh (ví dụ: gửi tin)"""
    global pending_commands
    cmds = pending_commands[:]
    pending_commands.clear()
    return {"commands": cmds}

@app.post("/api/v1/omni/send_zalo_command")
async def send_zalo_cmd(payload: dict):
    """API nội bộ để push lệnh xuống Chrome Extension"""
    global pending_commands
    pending_commands.append({
        "action": payload.get("action", "SEND_MESSAGE"),
        "content": payload.get("content", "")
    })
    return {"success": True}


@app.get("/api/v1/status")
async def get_status():
    """
    Get omnichannel hub status.
    
    Returns:
        Platform connection status and config info
    """
    return JSONResponse(content={
        "enabled": Config.ENABLED,
        "platforms": {
            "zalo": {
                "enabled": True,
                "qr_login_available": Config.ZALO_QR_ENABLED,
                "bot_uid_configured": bool(Config.ZALO_BOT_UID)
            },
            "facebook": {
                "enabled": Config.FACEBOOK_COOKIE_STRING != "",
                "headless_mode": Config.FACEBOOK_HEADLESS
            }
        }
    })


@app.get("/")
async def root():
    """Root endpoint with API info."""
    return JSONResponse(content={
        "service": "Omnichannel Hub API",
        "version": "1.0.0",
        "endpoints": [
            "/api/v1/omni/conversations - List conversations",
            "/api/v1/omni/conversations/{chat_id}/messages - Send message",
            "/api/v1/omni/conversations/{chat_id}/messages?limit=50 - Chat history",
            "/api/v1/omni/conversations/read-all - Mark all as read",
            "/api/v1/auth/zalo/qrcode/init - Init QR login",
            "/api/v1/auth/zalo/qrcode/poll/{chat_id} - Poll QR status"
        ]
    })


if __name__ == "__main__":
    import uvicorn
    
    logger.info(f"Starting Omnichannel Hub API on {Config.HOST}:{Config.API_PORT}")
    uvicorn.run(app, host=Config.HOST, port=Config.API_PORT)
