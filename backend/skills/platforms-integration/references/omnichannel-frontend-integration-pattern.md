# OmniChat Frontend Integration Pattern

## Overview

This document describes the pattern for integrating external REST API backends into React components (OmniChat.jsx). Used when connecting standalone FastAPI servers to Hagent gateway frontend.

---

## Workflow: 4-Step External API Integration

### Step 1: Create Component with API Endpoints

Update existing component (e.g., OmniChat.jsx) with direct REST calls:

```javascript
const omniApi = {
  baseUrl: '/api/v1',
  
  async getConversations() {
    const response = await fetch(`${this.baseUrl}/omni/conversations`, {});
    return await response.json();
  },
  
  async sendMessage(chatId, message) {
    const response = await fetch(
      `${this.baseUrl}/omni/conversations/${chatId}/messages`,
      { method: 'POST', body: JSON.stringify({ message }) }
    );
    return await response.json();
  }
};
```

**Key Points:**
- Use relative paths (`/api/v1/*`) that get proxied by gateway main router
- Handle CORS errors via gateway proxy configuration
- Store API client in module scope for reuse across component instances

---

### Step 2: Create Migration Script

Create auto-start script to sync backend and launch server:

```javascript
#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🚀 Starting OmniChat Backend Setup...');

// Check if backend exists
const pluginDir = path.join(process.env.HAGENT_HOME || '/Users/nguyenhat/HAgent/backend', 'plugins', 'platforms', 'omnichannel/backend');
const frontendRoot = process.cwd();

if (!fs.existsSync(pluginDir)) {
  execSync(`cd ${pluginDir} && bash init.sh`, { stdio: 'inherit' });
}

// Create config directory
const configDir = path.join(frontendRoot, 'config', 'omnichannel');
fs.mkdirSync(configDir, { recursive: true });

// Copy .env configuration
const envPath = path.join(pluginDir, '.env');
if (fs.existsSync(envPath)) {
  fs.writeFileSync(path.join(configDir, '.env'), fs.readFileSync(envPath));
}

console.log('✅ Configuration synced');

// Start backend server
execSync(`cd ${pluginDir} && uvicorn api_server:app --port 8080`, { 
  stdio: 'inherit',
  cwd: frontendRoot
});
```

**Location:** `/Users/nguyenhat/HAgent/scripts/start-omnichannel-backend.js`

---

### Step 3: Create API Endpoints Documentation

Generate JSON reference for all API endpoints:

```json
{
  "name": "omnichannel-backend",
  "version": "1.0.0",
  "endpoints": {
    "authentication": {
      "initOmniAuth": {
        "method": "POST",
        "path": "/api/v1/omnichannel/init"
      },
      "initZaloQRCode": {
        "method": "POST", 
        "path": "/api/v1/auth/zalo/qrcode/init?chat_id={chatId}"
      }
    },
    "conversations": {
      "getConversations": {
        "method": "GET",
        "path": "/api/v1/omni/conversations"
      },
      "getChatMessages": {
        "method": "GET",
        "path": "/api/v1/omni/conversations/{chatId}/messages?limit=50"
      },
      "sendMessage": {
        "method": "POST",
        "path": "/api/v1/omni/conversations/{chatId}/messages"
      }
    }
  }
}
```

**Location:** `/Users/nguyenhat/HAgent/frontend/config/omnichannel/endpoints.json`

---

### Step 4: Create README Documentation

Generate complete integration guide with troubleshooting table, example usage, and next steps.

**Location:** `/Users/nguyenhat/HAgent/frontend/config/omnichannel/README.md`

Contains:
- Setup & run instructions (Quick Start + Manual)
- API endpoints documentation
- QR code login flow diagram
- Dependencies list
- Troubleshooting table (Issue → Solution)
- Example usage code snippets

---

## Terminal Background Process Handling ⚠️

**Critical Limitation:** Terminal tool cannot run background processes with `&` or `nohup`.

**Error Pattern:**
```
Failed to start background process: name '_gse' is not defined
```

**Solutions:**

1. **Use execute_code Python subprocess:**
   ```python
   import subprocess
   proc = subprocess.Popen(
     ['uvicorn', 'api_server:app', '--host', '0.0.0.0', '--port', '8080'],
     stdout=subprocess.PIPE,
     stderr=subprocess.PIPE
   )
   print(f"Server started with PID: {proc.pid}")
   ```

2. **Or use manual CLI command in terminal:**
   ```bash
   uvicorn api_server:app --host 0.0.0.0 --port 8080 &
   curl http://localhost:8080/api/v1/status  # Verify
   ```

3. **Document manual start procedure in README** to avoid confusion about server not starting automatically

---

## Environment Setup Pattern

### Backend Environment File

```bash
# Location: $HAGENT_HOME/plugins/platforms/omnichannel/env/config.env
OMNICHANNEL_ENABLED=true
ZALO_QR_ENABLED=true
OMNICHANNEL_API_PORT=8080
```

### Frontend Config Sync

Migration script copies `.env` from backend plugin directory to frontend config:

```bash
# Frontend config location
/Users/nguyenhat/HAgent/frontend/config/omnichannel/.env
```

**Purpose:** Frontend can read environment variables for API base URL, auth settings, etc.

---

## Directory Structure Pattern

```
$HAGENT_HOME/plugins/platforms/omnichannel/
├── backend/                  # FastAPI server
│   ├── api_server.py        # Main routes ✅
│   ├── start.sh             # Auto-start script ✅
│   └── config.env           # Environment variables
├── env/                      # Environment files
│   └── config.env          # REQUIRED (copy to frontend)
├── references/               # Documentation ✅
│   ├── zalo-qr-workflow.md  # QR auth guide
│   └── zalo-message-viewing.md  # API limitations
└── templates/                # Starter files

/Users/nguyenhat/HAgent/frontend/
├── src/components/OmniChat.jsx          # React component ✅
├── scripts/start-omnichannel-backend.js  # Migration script ✅
└── config/omnichannel/                  # Synced configs ✅
    ├── .env                             # Backend env copied here
    ├── endpoints.json                   # API reference
    └── README.md                        # Integration guide

/Users/nguyenhat/HAgent/backend/skills/platforms-integration/
└── SKILL.md                            # Skill documentation ✅
```

---

## Integration Checklist

When adding new external API backend:

- [ ] Create `api_server.py` with FastAPI routes
- [ ] Create `start.sh` for auto-start with env validation  
- [ ] Create environment file template (`config.env`)
- [ ] Update frontend component (e.g., `OmniChat.jsx`) with correct endpoints
- [ ] Create migration script (auto-start + config sync)
- [ ] Create API endpoints JSON reference
- [ ] Create README.md with troubleshooting table
- [ ] Document terminal background process limitations in README

---

## Gateway Proxy Pattern (Optional Enhancement)

For seamless integration, add proxy routes to gateway main router:

```python
# Add to HAgent backend/main.py or gateway router
from fastapi import APIRouter
from gateway.utils import call_backend_api

app_router = APIRouter()

@app.get("/api/omni/auth/zalo/init")
async def omni_zalo_init():
    """Proxy to external backend for QR code init"""
    return await call_backend_api("/api/v1/auth/zalo/qrcode/init", "/api/omni/")

@app.get("/api/omni/status")  
async def omni_status():
    """Proxy to external backend health check"""
    return await call_backend_api("/api/v1/status", "/api/omni/")
```

**Benefits:**
- Frontend uses clean `/api/omni*` paths without port specification
- CORS handled by main gateway proxy
- Single entry point for all OmniChat API calls

---

## Related Skills

- `platforms-integration`: External API backend integration pattern (Zalo/Facebook)
- `frontend-design`: React component UI patterns
- `software-development/writing-plans`: Implementation plan documentation

---

**Last Updated:** 2026-05-18  
**Pattern Version:** 2.0 (Multi-file Integration with Frontend Component Support)
