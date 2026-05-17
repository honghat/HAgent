from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
import os
import json
from datetime import datetime
from typing import Optional

# Create router for OmniChat APIs
omni_router = APIRouter(prefix="/api")

# Session storage file
SESSION_FILE = "/Users/nguyenhat/.hagent/plugins/platforms/omnichannel/session/current.session"
CONFIG_FILE = "/Users/nguyenhat/HAgent/backend/config/.omnichannel.env"

def load_config():
    """Load omnichannel configuration"""
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line.startswith('OMNICHANNEL_ENABLED='):
                        return True
                    elif line.startswith('OMNICHANNEL_ENABLED='):
                        return line.split('=')[1].strip() == 'true'
        return False
    except:
        return False

def load_session():
    """Load current session data"""
    try:
        if os.path.exists(SESSION_FILE):
            with open(SESSION_FILE, 'r') as f:
                return json.load(f)
    except:
        pass
    return {"platforms": {}, "auth_token": None}

def save_session(data):
    """Save session data"""
    try:
        os.makedirs(os.path.dirname(SESSION_FILE), exist_ok=True)
        with open(SESSION_FILE, 'w') as f:
            json.dump(data, f)
    except Exception as e:
        print(f"Error saving session: {e}")

# ==================== STATUS & HEALTH ====================

@omni_router.get("/status")
async def get_omnichannel_status():
    """Get OmniChat platform status"""
    enabled = load_config()
    return {
        "enabled": enabled,
        "timestamp": datetime.now().isoformat(),
        "platforms": ["Zalo", "Telegram", "Facebook Messenger"],
        "version": "1.0.0"
    }

# ==================== AUTH (QR CODE LOGIN) ====================

@omni_router.post("/auth/zalo/init")
async def init_zalo_qr_login():
    """Initialize QR code login for Zalo"""
    from PIL import Image, ImageDraw
    import uuid
    
    if not load_config():
        raise HTTPException(status_code=400, detail="Omnichannel disabled")
    
    session = load_session()
    chat_id = f"omni_zalo_{str(uuid.uuid4())[:8]}"
    
    # Generate QR code (placeholder)
    qr_path = "/Users/nguyenhat/.hagent/plugins/platforms/omnichannel/auth/qr_{}.png".format(chat_id)
    os.makedirs(os.path.dirname(qr_path), exist_ok=True)
    
    # Create simple QR-like image
    img = Image.new('RGB', (300, 300), color='white')
    draw = ImageDraw.Draw(img)
    draw.rectangle([50, 120, 250, 240], fill='#000')
    
    # Save QR code
    img.save(qr_path)
    
    # Store chat data
    session["chat_id"] = chat_id
    qr_file_path = f"omni_zalo/qrcode_{'-'.join(chat_id.split('_')[4:]).replace('-', '_')}.png"
    save_session(session)
    
    return {
        "success": True,
        "message": "QR code login initialized",
        "chat_id": chat_id,
        "qr_code_path": qr_file_path,
        "status": "awaiting_scan"
    }

@omni_router.get("/auth/zalo/qrcode/poll/{chat_id}")
async def poll_qr_status(chat_id: str):
    """Poll QR code scan status"""
    if not load_config():
        raise HTTPException(status_code=400, detail="Omnichannel disabled")
    
    session = load_session()
    chat_data = None
    
    for platform, data in session.get("chat_id", {}).items():
        if platform.startswith("omni_zalo"):
            chat_data = data
    
    return {
        "success": True,
        "status": "scanned" if chat_data else "awaiting_scan",
        "chat_id": chat_id
    }

# ==================== CONVERSATIONS ====================

@omni_router.get("/omni/conversations")
async def list_conversations():
    """List all conversations"""
    return {
        "conversations": [
            {"id": "1", "platform": "Zalo", "name": "Nguyễn Văn A", "unread_count": 3},
            {"id": "2", "platform": "Telegram", "name": "@nguyenhat_official", "unread_count": 0},
        ],
        "total": 2
    }

@omni_router.post("/omni/conversations/{chat_id}/messages")
async def send_message(chat_id: str, message_data: dict):
    """Send a message to conversation"""
    if not load_config():
        raise HTTPException(status_code=400, detail="Omnichannel disabled")
    
    return {
        "success": True,
        "message_id": f"msg_{chat_id}_{len(message_data.get('messages', []))}",
        "timestamp": datetime.now().isoformat()
    }

@omni_router.get("/omni/conversations/{chat_id}/messages")
async def get_chat_history(chat_id: str, limit: int = 50):
    """Get conversation history"""
    if not load_config():
        raise HTTPException(status_code=400, detail="Omnichannel disabled")
    
    return {
        "messages": [],
        "has_more": False,
        "limit": limit
    }

@omni_router.post("/omni/conversations/read-all")
async def mark_all_as_read():
    """Mark all conversations as read"""
    if not load_config():
        raise HTTPException(status_code=400, detail="Omnichannel disabled")
    
    return {"success": True, "marked_count": 2}
