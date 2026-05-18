---
name: omnichannel-platforms
description: "Cross-platform messaging integration (Zalo, Facebook Messenger) with unified chat architecture."
version: 1.0.0
author: HAgent Prime + Session May-2026
license: MIT
platforms: [macos, linux]
metadata:
  omnichannel:
    tags: [multi-channel, messaging, zalo, facebook, qr-login, api-integration]
---

# Omnichannel Platforms Integration

This skill handles cross-platform messaging integration with support for Zalo, Facebook Messenger, and other messaging platforms through a unified API architecture.

## Use Cases

- **Multi-channel chat UI** — Build unified messaging interfaces that work across Zalo, Facebook, Telegram, WhatsApp, etc.
- **QR code authentication** — Zalo QR login flow for seamless mobile app integration.
- **Platform-specific features** — Handle platform APIs while maintaining consistent frontend experience.
- **Cross-platform message routing** — Send messages to multiple platforms from single interface.

## Architecture

```
┌─────────────────┐
│   Frontend UI   │  ← React + Material UI (OmniChat.jsx)
│   (Web App)     │
└────────┬────────┘
         │ HTTP API
         ▼
┌─────────────────┐
│  API Proxy      │  ← Routes to v1 backend
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ OmniChat Backend│  ← FastAPI server (port 8080)
│   /api/v1/*     │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌─────────┐ ┌──────────┐
│ Zalo    │ │ Facebook │
│ Platform│ │ Messenger│
└─────────┘ └──────────┘
```

## Quick Start

### 1. Start OmniChat Backend

```bash
cd ~/.hagent/plugins/platforms/omnichannel/backend
uvicorn api_server:app --host 127.0.0.1 --port 8080
# OR use auto-start script:
./omnichannel-backend-migration.sh start
```

### 2. Test Backend Health

```bash
curl http://127.0.0.1:8080/api/v1/status
```

**Expected response:**
```json
{
  "enabled": true,
  "platforms": {
    "zalo": {"enabled": true, "qr_login_available": true},
    "facebook": {"enabled": true, "headless_mode": false}
  }
}
```

### 3. Init QR Code Login (Zalo)

```bash
curl -X POST http://localhost:8080/api/v1/auth/zalo/qrcode/init
```

**Response:**
```json
{
  "success": true,
  "qrcode_url": "/api/v1/status",
  "expires_in": 600
}
```

### 4. Poll QR Status

```bash
# Run every 2 seconds until connected
curl http://localhost:8080/api/v1/auth/zalo/qrcode/poll/chat_123
```

**Response patterns:**
- `{"status": "pending"}` — Waiting for scan
- `{"status": "connected"}` — ✅ Success!
- `{"status": "expired"}` — ❌ QR expired, re-init

---

## API Reference

### Core Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/omni/conversations` | GET | List all platform conversations |
| `/api/v1/omni/conversations/{id}/messages` | POST | Send message to platform |
| `/api/v1/omni/conversations/{id}/messages` | GET | Get chat history (limit=50) |
| `/api/v1/omni/conversations/read-all` | POST | Mark all conversations as read |
| `/api/v1/auth/zalo/qrcode/init` | POST | Init QR login for Zalo |
| `/api/v1/auth/zalo/qrcode/poll/{chat_id}` | GET | Poll QR status (every 2s) |
| `/api/v1/status` | GET | Platform connectivity status |

### Frontend Integration Pattern

```javascript
// frontend/src/components/OmniChat.jsx
import { applyV1Compatibility } from "../../api/v1-omnichannel-compatibility";

export const OmniChat = () => {
  // Apply V1 compatibility layer automatically
  const omniApi = applyV1Compatibility();
  
  // Load conversations on mount
  useEffect(() => {
    setConversations(async () => await omniApi.getConversations());
  }, []);
  
  // Send message handler
  const handleSendMessage = async () => {
    try {
      await omniApi.sendMessage(activeChatId, messageInput);
      setMessageInput("");
    } catch (error) {
      console.error("Failed to send:", error);
    }
  };
  
  // QR login handler
  const handleInitQrLogin = async () => {
    const result = await omniApi.initZaloQrLogin();
    if (result.qrcode) {
      setQrCodeVisible(true);
      
      // Start polling loop
      const interval = setInterval(async () => {
        const status = await omniApi.pollZaloQrStatus(activeChatId);
        
        if (status.status === "connected") {
          clearInterval(interval);
          setQrCodeVisible(false);
          // Refresh conversations
          setConversations(await omniApi.getConversations());
        } else if (status.status === "expired") {
          clearInterval(interval);
          alert("QR code expired. Please try again.");
        }
      }, 2000); // Poll every 2 seconds
    }
  };
  
  return (
    <Paper elevation={3} sx={{ p: 2, maxWidth: 600, mx: "auto" }}>
      {/* Render conversations list */}
      {/* Render message input and send button */}
      {/* Render QR code display when visible */}
      {/* Status indicator */}
    </Paper>
  );
};
```

### Auto-reload Pattern for Messages

```javascript
// Poll for new messages every 3 seconds
useEffect(() => {
  let interval;
  
  const pollForUpdates = async () => {
    if (!activeChatId) return;
    
    const history = await omniApi.getChatHistory(activeChatId, 50);
    if (history.unread_count > 0) {
      setIsTyping(false); // Stop typing indicator on new messages
    }
  };
  
  interval = setInterval(pollForUpdates, 3000);
  return () => clearInterval(interval);
}, [activeChatId]);
```

---

## Key Techniques & Patterns

### 1. MUI Icon Import Fallback Pattern

**Problem:** `@mui/icons-material/PersonOutline` can fail in some environments.

**Solution:** Replace with inline SVG components:

```jsx
// ❌ Broken import (may fail)
import AvatarIcon from "@mui/icons-material/PersonOutline";

// ✅ Working replacement (always works)
const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 2L11 13" />
    <path d="M22 2L15 22L11 13L2 9L22 2Z" />
  </svg>
);

const CheckIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 6L9 17L4 12" />
  </svg>
);
```

**Why it works:** SVG icons are self-contained and don't rely on external imports that may fail.

---

### 2. V1 API Compatibility Bridge Pattern

**Problem:** Frontend needs clean paths while backend uses `/api/v1/`.

**Solution:** Create compatibility layer:

```javascript
// frontend/src/api/v1-omnichannel-compatibility.js

const API_BASE = '/api/v1';

export function applyV1Compatibility() {
  return {
    getConversations: async (platform) => 
      fetch(`${API_BASE}/omni/conversations?platform=${platform}`),
    
    sendMessage: async (chatId, message, replyTo = null) => 
      fetch(`${API_BASE}/omni/conversations/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, message, replyTo })
      }),
    
    // ... more methods
  };
}
```

**Why it matters:** Always create a bridge when frontend-backend API versions differ. Frontend gets clean paths; backend can evolve independently.

---

### 3. QR Code Login Flow Pattern

**Flow Sequence:**

```
1. Init QR: POST /api/v1/auth/zalo/qrcode/init
   └→ Returns: { success, qrcode_url, expires_in }

2. Display QR in UI (browser or mobile)

3. Poll status: GET /api/v1/auth/zalo/qrcode/poll/{chat_id} every 2s
   └→ Status: "pending" | "connected" | "expired"

4. On "connected": 
   - Auto-refresh conversations list
   - Close QR overlay
   - Enable message sending

5. On "expired":
   - Show error to user
   - Offer re-init option
```

**Backend Implementation Pattern:**

```python
@app.get("/api/v1/auth/zalo/qrcode/poll/{chat_id}")
async def poll_qr_status(chat_id: str):
    status = await zalo_service.check_connection(chat_id)
    
    return {
        "status": status.status,  # pending/connected/expired
        "qr_code_url": status.qr_url if status.status != "connected" else None,
        "error": status.error if status.status == "error" else None
    }
```

**Pitfall:** QR codes expire after ~10 minutes. Auto-refresh or force re-init on expiry.

---

### 4. Auto-start Script Pattern

Create `~/.hagent/plugins/platforms/omnichannel/backend/start.sh`:

```bash
#!/bin/bash
cd ~/.hagent/plugins/platforms/omnichannel/backend
uvicorn api_server:app --host 127.0.0.1 --port 8080 &
echo "OmniChat backend started on port 8080"
```

Add to `.hagent/config.yaml` under `gateway.auto_start_scripts:` section.

**Pattern:** Always create auto-start scripts for platform backends so they launch automatically when HAgent starts.

---

## Troubleshooting

### Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Backend not responding (503) | Run `./omnichannel-backend-migration.sh start` or check if port 8080 is available with `lsof -i:8080` |
| "Not Found" on /api/status | Use `/api/v1/status` endpoint instead |
| QR login failing | Check Zalo app version, ensure camera permissions granted in system settings |
| MUI icon import fails | Replace with inline SVG icons (see Pattern #1 above) |
| CORS errors in frontend | Configure proxy routes or allow specific origins in backend config |
| Port 8080 already in use | Kill existing process: `pkill -f "uvicorn.*api_server"` then restart |

### Health Checks

```bash
# Backend health check
curl http://127.0.0.1:8080/api/v1/status

# Expected response:
{
  "enabled": true,
  "platforms": {
    "zalo": {"enabled": true, "qr_login_available": true},
    "facebook": {"enabled": true, "headless_mode": false}
  }
}
```

### Logs Location

- Backend logs: `~/.hagent/plugins/platforms/omnichannel/backend/logs/`
- Gateway logs: `~/.hagent/logs/gateway.log`
- Session files: `~/.hagent/sessions/`

---

## Adding New Platforms

To add a new platform (e.g., Line, Slack, WeChat):

1. **Create plugin directory:**
   ```bash
   mkdir -p ~/.hagent/plugins/platforms/<platform-name>/backend
   ```

2. **Clone official API client or create custom:**
   ```bash
   git clone https://github.com/<owner>/<platform>.git \
     ~/.hagent/plugins/platforms/<platform-name>/backend
   ```

3. **Install dependencies:**
   ```bash
   cd backend
   pip install -r requirements.txt  # OR npm install for Next.js
   ```

4. **Create FastAPI routes in `api_server.py`:**
   ```python
   from fastapi import APIRouter
   from <platform_name> import PlatformService
   
   router = APIRouter(prefix="/api/v1/omni")
   
   @router.get("/conversations")
   async def get_conversations(platform: str):
       service = PlatformService()
       conversations = await service.list_conversations(platform)
       return {chat_id: conv for conv in conversations}
   
   # Add more routes as needed
   ```

5. **Register in main FastAPI app:**
   ```python
   from api_server import app, router
   
   app.include_router(router)
   ```

6. **Add platform to `.hagent/config.yaml`** under `omnichannel.enabled_platforms:` section.

---

## Session Reference

- **Backend PID**: 84264, 83182 (uvicorn processes on port 8080)
- **Frontend build**: `/Users/nguyenhat/HAgent/frontend/`
- **Gateway home**: `~/.hagent/`

---

## Files & Locations

| Path | Purpose |
|------|---------|
| `frontend/src/components/OmniChat.jsx` | Main chat UI component (React) |
| `frontend/src/api/v1-omnichannel-compatibility.js` | V1 API bridge layer |
| `frontend/src/scripts/omnichannel-backend-migration.sh` | Auto-start migration script |
| `~/.hagent/plugins/platforms/omnichannel/backend/api_server.py` | FastAPI backend server |
| `~/.hagent/plugins/platforms/omnichannel/backend/start.sh` | Server launch script |
| `frontend/src/api/omnichannel-proxies.js` | HTTP proxy routes (alternative) |

---

## Next Steps / Open Questions

1. **Facebook Messenger full integration** — Currently QR login works for Zalo, need Facebook API key setup for OAuth flow
2. **Multi-language support** — Vietnamese UI strings vs English fallbacks for international audiences
3. **Mobile responsive design** — Mobile-first styling for OmniChat component (@media queries)
4. **Push notifications** — Web Push API integration for offline message delivery
5. **Message threading across platforms** — Reply chains from one platform to another

## Related Skills

- `hagent-agent` — Overall HAgent configuration and CLI commands
- `github-deep-research` — For researching new platform APIs and authentication flows
- `platforms-integration` — General multi-platform integration patterns