---
name: platforms-integration
description: "Unified integration for social/messaging platforms (Zalo, Facebook, Telegram, etc.) via Hagent gateway. Includes omnichannel hub pattern for multi-platform unified inbox."
version: 1.1.0
author: HatNguyen/Hat Nguyen
license: MIT
platforms: [linux, macos, windows]
---

# Messaging & Social Platform Integration

Unified integration for Zalo, Facebook Messenger, and other social/messaging platforms with Hagent Agent gateway. Supports bidirectional messaging, media handling, cron-based delivery, and omnichannel unified inbox patterns.

## When to Use

- User wants to add Zalo/Facebook/WhatsApp/etc. as chat channel for HAgent
- Need to integrate third-party platform bots into Hagent ecosystem  
- Building multi-platform messenger bot infrastructure
- Migrating existing SimpleAI-style bots to Hagent gateway
- Creating unified inbox across multiple platforms (omnichannel pattern)

## Architecture

### Two Integration Paths

#### 1. **Plugin Path** (Recommended - Zero Core Changes)

Create plugin directory in `~/.hagent/plugins/platforms/` with:

```yaml
# plugin.yaml
name: zalo-messenger
platform: zalo
description: Zalo bot integration via webhook polling
requires_env:
  ZALO_COOKIE: Cookie string from browser DevTools
  ZALO_BOT_UID: Bot's user_id
optional_env:
  ZALO_BOT_NAME: Display name for Hagent (default: "HAgent Zalo")
```

Adapter file follows `BasePlatformAdapter` pattern. See `templates/platform-adapter-zalo.py` for complete example.

**Pros:**
- ✅ Zero changes to Hagent core  
- ✅ Auto-handled by gateway lifecycle (auth, cron delivery)
- ✅ Easy to add new platforms
- ✅ Follows existing adapter pattern (see `telegram.py`)

#### 2. **Built-in Core Path** (Core Contributors Only)

Direct integration into `gateway/platforms/<platform>.py`. Requires Hagent core maintainership for PR.

### Database Schema Options

#### A. Use SimpleAI Omni Models (Recommended for Migration)

Reuses SimpleAI PostgreSQL models: `OmniChannel`, `OmniConversation`, `OmniMessage`. Already handles platform-specific auth token refresh, cookie parsing, and message routing.

#### B. Hagent Session Store (For Lightweight Plugins)

Use Hagent SQLite or custom adapter. Simpler setup but loses SimpleAI's auth/cookie management.

### Cron Delivery Pattern

Hagent gateway automatically schedules outbound messages via cron:

```bash
# ~/.hagent/config.yaml  
cron_delivery:
  zalo:
    schedule: "*/5 * * * *\"  # Check every 5 minutes
```

Adapter must implement `standalone_sender_fn` for out-of-process delivery. See SimpleAI's `zalo_bot.py` for reference implementation.

## Omnichannel Hub Pattern (NEW - v1.1.0)

### Overview

Omnichannel hub provides **unified inbox** across multiple platforms (Zalo, Facebook Messenger) with SimpleAI-style API compatibility. Enables single point of management for cross-platform conversations.

```
┌─────────────────────────────────────────────────┐
│          TELEGRAM BOT (You)                     │
│              ⬅➡️                                │
│      HEMES OMNICHANNEL HUB                      │
│     ┌──────────────┬────────────────┐           │
│     │  ZALO API    │ FACEBOOK API   │           │
│     │ (Cookie auth)│ Playwright     │           │
│     └──────────────┴────────────────┘           │
└─────────────────────────────────────────────────┘
```

### Key Features

- **Unified Message Router**: Single interface for all platform conversations
- **SimpleAI API Compatible**: Reuses existing SimpleAI frontend implementations
- **Auto-Cookie Management**: Persistent cookie storage across sessions
- **Cross-Platform Delivery**: Send same message to multiple channels
- **Gateway Integration**: Auto-handled via Hagent CLI commands

### File Structure

```
/Users/nguyenhat/.hagent/plugins/platforms/omnichannel/
├── __init__.py          # Core manager - SimpleAI API compatible ✅
├── router.py            # Gateway integration layer ✅
├── plugin.yaml          # Plugin configuration ✅
├── init.py              # Initialization script ✅
├── test_omnichannel.py  # Test runner ⭐ (executable) ✅
├── README.md            # Vietnamese documentation ✅
└── SUMMARY.md           # Architecture overview ✅
```

### API Endpoints

#### List Conversations (GET)

```bash
curl http://localhost:8080/api/v1/omni/conversations
# Response: Array of all conversations across platforms
[
  {"id": "zalo_123456789", "sender": "Nguyễn Văn A", "channel": "zalo"},
  {"id": "fb_thread_123", "sender": "User B", "channel": "facebook"}
]
```

#### Send Message (POST)

```bash
curl -X POST http://localhost:8080/api/v1/omni/conversations/zalo_123/messages \\
  -H "Content-Type: application/json" \\
  -d '{"content": "Hello from Telegram!"}'
# Response: {"success": true, "message": "Sent to Zalo 123..."}
```

#### Get Chat History

```bash
curl http://localhost:8080/api/v1/omni/conversations/zalo_123/messages?limit=50
# Returns paginated messages with timestamps and sender info
```

#### Mark All as Read

```bash
curl -X POST http://localhost:8080/api/v1/omni/conversations/read-all
# Marks all conversations across platforms as read
```

### Environment Variables for Omnichannel Hub

```bash
# Core omnichannel config (~/.hagent/omnichannel.env)
export OMNICHANNEL_ENABLED=true
export OMNICHANNEL_ZALO_ADAPTER=/Users/nguyenhat/.hagent/plugins/platforms/zalo/adapter.py
export OMNICHANNEL_FB_ADAPTER=/Users/nguyenhat/.hagent/plugins/platforms/facebook/adapter.py

# Zalo (REQUIRED)
export ZALO_COOKIE_STRING='PHPSESSID=abc; zalome_userid=xxx; _zalo_session=yyy'
export ZALO_BOT_UID='9876543210'  # Optional, auto-detect if not set

# Facebook (OPTIONAL)
export FACEBOOK_COOKIE_STRING='c_user=123; ux=xxx; datr=yyy'
export FACEBOOK_HEADLESS=false    # Default, keep for debugging
```

### Setup Commands

#### Initialize Omnichannel Hub

```bash
python /Users/nguyenhat/.hagent/plugins/platforms/omnichannel/init.py
```

**Expected Output:**

```
======================================================================
  OMNICHANNEL HUB INITIALIZATION
======================================================================

📱 Zalo Adapter: Loading...
   ✅ Zalo connected: 1234567890

📘 Facebook Adapter: Loading...
   ✅ Facebook connected

======================================================================
  OMNICHANNEL HUB READY!
======================================================================
```

#### Test Omnichannel Hub

```bash
cd /Users/nguyenhat/.hagent/plugins/platforms/omnichannel
python3 test_omnichannel.py ~/.hagent/omnichannel.env
```

### Telegram Bot Commands

Once omnichannel hub is running, use these commands with Hagent bot:

```
/omnichannel list      # List all connected platforms and conversations
/omnichannel send zalo <user_id> "<message>"  # Send to Zalo chat
/omnichannel read-all  # Mark all as read
```

---

### Authentication Methods

### Zalo - Dual Authentication Support

**Method 1: Browser Cookies** (Recommended for persistent use) ⭐
```bash
# Chrome DevTools → Application → Cookies → zalome.com tab
# Copy "Copy as curl" from first cookie line (PHPSESSID=...)
export ZALO_COOKIE_STRING="PHPSESSID=xxx; zalome_userid=yyy..."
# See references/zalo-qr-workflow.md for step-by-step guide
```

**Method 2: QR Code Scanning** (Quick setup, expires ~30 min)
```bash
# Zalo app scan QR at https://zalo.me/qrcode or via desktop app menu
# Session-based auth - good for testing, quick deployments
export ZALO_QR_ENABLED=true
```

⚠️ **User Preference: Automation Over Instructions** ⭐⭐⭐⭐⭐ (Critical!)
- User explicitly frustrated when told to do things manually: "ngu ghê, tao cần mày làm chứ mày không có chỉ tao làm"
- **DO**: Auto-execute setup scripts via terminal tool, open browser automatically with `browser_navigate()` or Playwright automation
- **DON'T**: Give step-by-step tutorials expecting user to execute commands manually; this pattern causes frustration and repeats unnecessarily
- **Pattern**: When user wants Zalo/Facebook/Telegram setup → I must either:
  a) Execute the setup via tools (terminal + write_file + chmod), OR
  b) Open browser automatically with `browser_navigate(url)` + screenshot verification
- Files created: `~/.hagent/plugins/platforms/omnichannel/send_zalo_by_name.py`, `zalo_telegram_bot.py` (automation examples)

⚠️ **Critical Technical Limitation: ZALO API MESSAGE READING** ⭐⭐⭐
- **Zalo does NOT support message polling/receiving via API** - unlike Telegram/Facebook Messenger
- **Cannot check inbox or poll for unread messages** with gateway API endpoints
- **Workaround Pattern**: Open Zalo Web (`https://chat.zalo.me`) browser interface + detect new badges ● → Auto-forward notifications to Telegram
- Implementation: `view_zalo_messages.py` (browser automation wrapper) + webhook polling via cookie auth
- See references/zalo-message-viewing-workflow.md for complete API limitations documentation

## Omnichannel Hub Pattern (v1.1.0)

Unified omnichannel inbox supporting Zalo, Facebook Messenger, Telegram with SimpleAI-compatible API. Provides:

- **Cross-platform message routing**: Send same message to multiple channels automatically
- **Cookie-based authentication**: Persistent auth across sessions (Zalo/Facebook)
- **Auto-notification forwarding**: Zalo → Telegram webhook pattern when browser automation unavailable
- **Gateway integration**: Seamless HAgent multi-platform messaging bot infrastructure

#### Setup Scripts:
- `scripts/zalo-cookie-extractor.sh` - Interactive cookie extraction with browser automation
- `scripts/quick-zalo-auth.sh` - Non-interactive setup for QR code scanning
- See references/zalo-qr-workflow.md for complete troubleshooting guide

### Facebook Messenger - Playwright Automation

#### Method A: Browser Cookies (Recommended for E2EE support) ⭐

**Required**: `fbsbx.com` cookies from Chrome DevTools:

1. Open Chrome → https://facebook.com/
2. Login to your account
3. Press **F12** → Tab **Application** → **Cookies** 
4. Select tab **`fbsbx.com`** (or `facebook.com`)
5. Click **"Copy as curl"** icon on first cookie line
6. Paste into environment variable:

```bash
export FACEBOOK_COOKIE_STRING="c_user=100002936899219; ux=xxx; datr=yyy; fr=zzz..."
```

#### Method B: Playwright Automation (Full Web Scraping)

Uses `playwright` library to interact with Facebook directly. See `adapter.py` for implementation details. Handles E2EE PIN input and encrypted threads automatically.
```python
import json
with open('Downloads/www.facebook.com_DATE.json', 'r') as f:
    data = json.load(f)
cookies = data.get('cookies', [])
cookie_string = '; '.join([
    f"{c['name']}={c['value']}" 
    for c in cookies if not c.get('hostOnly')
])
export FACEBOOK_COOKIE_STRING=f'"{cookie_string}"'
```

#### Method B: Playwright Automation (Full Web Scraping)

Uses `playwright` library to interact with Facebook directly. See `adapter.py` for implementation details. Handles E2EE PIN input and encrypted threads automatically.

### Platform Setup Wizard Pattern

For multi-platform setup, use the wizard script pattern:

```bash
cd ~/.hagent/plugins/platforms
chmod +x scripts/*.sh
./scripts/setup-wizard.sh  # Interactive credential entry
# OR ./scripts/quick-check.sh  # Verify platform status
```

Wizard auto-creates config files, validates credentials, and provides platform health checks.

---

## Supported Platforms

| Platform | Adapter Type | Authentication Method(s) | Notes |
|----------|-------------|---------------------------|--------|
| **Zalo** | Plugin (webhook/poller) | Browser cookies ✅ OR QR scan 🔁 | 60s reply cooldown; max 40KB images |\n| **Facebook Messenger** | Plugin (Playwright automation) | fbsbx.com cookies ✅ OR Playwright E2EE | E2EE PIN for encrypted threads |\n| **Telegram** | Built-in gateway | Bot token | Real-time delivery |\n| **Omnichannel** | Unified hub | Multi-platform router | Single inbox, cross-platform messaging |\

### Platform Capabilities Matrix

| Capability | Zalo | Facebook | Telegram | Omnichannel |
|------------|------|----------|----------|--------------|
| API Message Reading | ❌ Browser-only ✅ | ✅ Via Playwright | ✅ Native | ✅ Unified view |
| API Message Sending | ✅ Webhook poller | ✅ Playwright automation | ✅ Built-in | ✅ Cross-platform |
| E2EE Support | ✅ Manual QR scan PIN | ✅ Automated PIN prompt | ✅ End-to-end | ✅ Aggregates |
| Media Types | Text, images (≤40KB) | Text, images, files | Text, images, media, files | ✅ All types |

⚠️ **Zalo Limitations Summary**:
- No API message reading → Use browser interface
- 60s reply cooldown between sends
- Cookie expiry requires periodic re-authentication

---

## Pitfalls

### Zalo-Specific Issues\n\n1. **⚠️ CRITICAL: NO API MESSAGE READING** - Zalo API does NOT support reading messages like Telegram/Facebook Messenger. **Cannot use gateway API to check inbox**. To view received messages:\n   - **Required**: Use **Zalo Desktop App** or **Zalo Web** (`https://chat.zalo.me`) directly\n   - **Why**: Zalo blocks programmatic message polling for security reasons\n   - **Workaround Pattern**: Open browser → Click tab with new badge ● → Read messages in web interface\n   - Files: `~/hagent/plugins/platforms/omnichannel/view_zalo_messages.py` (browser automation wrapper)\n2. **60s Single-Use Reply Token**: Zalo blocks immediate replies (< 60s between sends). Implement cooldown or use `_keep_typing()` pattern for mid-flight bubbles.\n3. **Cookie Expiry**: Zalo refreshes cookies periodically. Re-authenticate on connection failure (see `references/zalo-qr-workflow.md`).\n4. **Image Size Limit**: Max ~40KB images supported. Larger files need file hosting or chunked upload workaround.

### Facebook Messenger-Specific Issues  

1. **E2EE PIN Required**: Encrypted threads need PIN input before sending. Store in `config.pin` or prompt user.
2. **fbsbx.com Cookie Domain**: Must use cookies from `fbsbx.com` tab (not just `facebook.com`) for full authentication state.

### Telegram-Specific Issues

1. **Home Channel Configuration**: Gateway requires either explicit channel ID or home channel set via:
   ```bash
   hagent config set TELEGRAM_HOME_CHANNEL <channel_id>
   ```
   Without this, `hagent deliver telegram` will fail with "No home channel set" error.

### Facebook Messenger-Specific Issues

1. **E2EE PIN Required**: Encrypted threads need PIN input before sending. Store in `config.pin` or prompt user.
2. **fbsbx.com Cookie Domain**: Must use cookies from `fbsbx.com` tab (not just `facebook.com`) for full authentication state.

### Omnichannel Hub-Specific Issues

1. **Cookie String Format**: Must be complete string with all cookies, not individual lines. Use "Copy as curl" function in browser DevTools.
2. **Bot UID Auto-detection**: If not set in env var, adapter will auto-detect from session token after successful login.
3. **Omnichannel Hub API Port**: Default is `8080`. Override with `--port 9000` flag if needed.

#### External API Backend Integration Pattern (NEW - v2.0) ⭐

**Overview:** Standalone FastAPI backend server for unified inbox operations across Zalo, Facebook Messenger. Provides RESTful API with QR code login support. **Distinct from Gateway Plugin path** - uses external HTTP calls instead of Hagent core integration.

**File Structure:**
```
/Users/nguyenhat/.hagent/plugins/platforms/omnichannel/
├── backend/                  # FastAPI server directory
│   ├── api_server.py         # Main API routes
│   ├── start.sh              # Auto-start script with env loading ✅
│   └── config.env            # Environment variables (REQUIRED)
├── frontend/                 # React component integration
│   ├── OmniChat.jsx          # Unified inbox component
│   ├── scripts/start-omnichannel-backend.js  # Migration script ✅
│   └── config/omnichannel/   # Synced .env + API docs ✅
├── env/                      # Environment variables directory
└── references/               # Documentation and workflows
    ├── zalo-qr-workflow.md   # QR code login & cookie auth guide ✅
    └── zalo-message-viewing.md  # API limitations & browser-only guide ✅
```

**External Backend vs Gateway Plugin - Critical Distinction:**

| Aspect | Gateway Plugin Path | External API Backend |
|--------|---------------------|---------------------|
| Integration | Hagent core (requires PR) | Standalone HTTP service ✅ |
| Deployment | `~/.hagent/plugins/` | Any port, independent server ✅ |
| Auth | Built-in gateway session | Custom auth (QR code tokens, cookies) ✅ |
| Frontend Integration | Direct function calls | REST API endpoints `/api/v1/*` ✅ |
| Best For | Persistent bot integration | Quick deployment, testing, standalone apps ✅ |

**Backend API Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/omni/conversations` | List all conversations |
| POST | `/api/v1/omni/conversations/{chat_id}/messages` | Send message |
| GET | `/api/v1/omni/conversations/{chat_id}/messages?limit=50` | Get chat history |
| POST | `/api/v1/omni/conversations/read-all` | Mark all as read |
| POST | `/api/v1/auth/zalo/qrcode/init?chat_id={id}` | Init Zalo QR login |
| GET | `/api/v1/auth/zalo/qrcode/poll/{chat_id}` | Poll QR scan status |
| GET | `/api/v1/status` | Platform connection health check ✅ |

**Startup Commands:**

```bash
# Option 1: Direct backend start (recommended for testing)
cd ~/.hagent/plugins/platforms/omnichannel/backend
uvicorn api_server:app --host 0.0.0.0 --port 8080 &

# Option 2: Auto-start script with env validation  
cd ~/.hagent/plugins/platforms/omnichannel/backend
./start.sh

# Option 3: Frontend integration auto-start (sync + start)
cd ~/HAgent/frontend
node scripts/start-omnichannel-backend.js
```

**Frontend Component Integration Pattern:**

When integrating external backend APIs into React components:

1. **Create Component** - Update existing component with correct API endpoints:
   ```javascript
   const omniApi = {
     baseUrl: '/api/v1',  // External backend base path
   
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

2. **Create Migration Script** - Auto-start backend server:
   ```javascript
   import { execSync } from 'child_process';
   
   console.log('🚀 Starting OmniChat Backend Setup...');
   
   // Check if backend exists
   if (!fs.existsSync(backendPath)) {
     execSync(`cd ${pluginDir} && bash init.sh`, { stdio: 'inherit' });
   }
   
   // Sync configuration files  
   const configDir = path.join(frontendRoot, 'config', 'omnichannel');
   fs.mkdirSync(configDir, { recursive: true });
   
   // Copy .env from plugin backend to frontend
   const envPath = path.join(pluginDir, '.env');
   if (fs.existsSync(envPath)) {
     fs.writeFileSync(path.join(configDir, '.env'), fs.readFileSync(envPath));
   }
   
   // Start server
   execSync(`cd ${backendPath} && uvicorn api_server:app --port 8080`, { stdio: 'inherit' });
   ```

3. **Create API Documentation** - JSON endpoints reference:
   ```json
   {
     "name": "omnichannel-backend",
     "version": "1.0.0",
     "endpoints": { /* ... */ }
   }
   ```

4. **Create README** - Complete integration guide with troubleshooting table ✅

**Environment Setup:**

```bash
# Core omnichannel config (~/.hagent/omnichannel.env)
export OMNICHANNEL_ENABLED=true
export OMNICHANNEL_API_PORT=8080
export ZALO_QR_ENABLED=true

# Save to file for persistence
cat > ~/.hagent/plugins/platforms/omnichannel/env/config.env << 'EOF'
OMNICHANNEL_ENABLED=true
ZALO_QR_ENABLED=true
OMNICHANNEL_API_PORT=8080
EOF
```

**Important: Terminal Background Process Handling** ⚠️

When starting backend servers, be aware of tool limitations:

- **Terminal tool cannot run background processes** with `&` or `nohup` - fails with "_gse not defined" error
- **Use execute_code Python subprocess instead** for server management
- **Or use manual CLI commands** via terminal: `uvicorn ... &` then verify with `curl http://localhost:8080/api/v1/status`
- **Document manual start procedure in README** to avoid confusion

**Reference Files:**
- **`references/omnichannel-hub-pattern.md`** - Omnichannel unified inbox architecture
- **`references/zalo-qr-workflow.md`** - QR code login & cookie auth guide (Zalo/Facebook patterns) ✅
- **`references/zalo-message-viewing-workflow.md`** - Zalo API limitations & browser-only reading ⭐
- **`references/messaging-cookie-extraction-patterns.md`** - Unified browser cookie extraction

**Support Files:**
- `scripts/omnichannel_setup.sh` - Quick setup & verify script
- **`scripts/start-omnichannel-backend.js`** - Frontend migration script for auto-start ✅

### Platform Testing Patterns

#### Test Message Delivery (Unified Approach)

**Step 1: Set up environment variables first**
```bash
export FACEBOOK_COOKIE_STRING="c_user=xxx; datr=yyy..."
export ZALO_COOKIE_STRING="PHPSESSID=xxx..."
# Save to ~/.zshrc for persistence
```

**Step 2: Install Playwright (if needed in sandbox)**
```bash
pip install playwright
playwright install chromium
```

**Step 3: Use Hagent CLI or Gateway directly**
```bash
# For Telegram (set home channel first!)
hagent deliver telegram --chat YOUR_CHANNEL_ID --message "Test"

# For Facebook (use Playwright adapter)
hagent deliver facebook --chat-id YOUR_THREAD_ID --message "Test"

# For Zalo (webhook polling)
hagent deliver zalo --chat YOUR_ZALO_NUMBER --message "Test"
```

**Step 4: Verify gateway status**
```bash
curl -s http://localhost:8000/platforms | grep -A1 "zalo|facebook"
```

#### Omnichannel Hub Testing

**Initialize hub:**
```bash
python /Users/nguyenhat/.hagent/plugins/platforms/omnichannel/init.py
```

**Run test script (requires Zalo cookie set):**
```bash
cd ~/.hagent/plugins/platforms/omnichannel
python3 test_omnichannel.py ~/.hagent/omnichannel.env
```

#### SimpleAI Ecosystem Migration Pattern

For migrating existing bots like `/Volumes/HatAI/Pending/SimpleAI`:

**Project Structure:**
```
SimpleAI/
├── backend/              # FastAPI server (Port 8000)
│   ├── main.py          # App entry point
│   ├── zalo_bot.py      # Zalo integration script
│   └── facebook_bot.py  # Facebook Messenger bot
├── frontend/            # Next.js UI (Port 3000)
├── start.sh            # Unified startup script
└── README.md
```

**Key Services:**
- Backend API: `http://localhost:8000` (FastAPI + PostgreSQL + Redis)
- Frontend Dashboard: `http://localhost:3000` (Next.js 14 + Tailwind CSS)
- Zalo Bot Daemon: Background process for Zalo webhook delivery
- Facebook Bot: v9.0 Stable Facebook integration

**Migration Approach:**
1. **Zero Core Changes**: Use plugin path in `~/.hagent/plugins/platforms/`
2. **Database Options**: 
   - Use SimpleAI PostgreSQL models (OmniChannel, OmniConversation) 
   - OR Hagent SQLite for lightweight plugins
3. **Cron Delivery**: Implement `standalone_sender_fn` adapter method

#### Playwright Sandbox Environment Issue

When sandbox environment reports `ModuleNotFoundError: No module named 'playwright'`:

**Solution 1: Install in sandbox**
```bash
pip install playwright
playwright install chromium
```

**Solution 2: Use browser automation via gateway instead**
```bash
hagent deliver facebook --chat-id YOUR_ID --message "Test"
# Gateway handles Playwright internally when configured
```

**Important**: Always verify Playwright is available before attempting automation scripts that import it. Check with:
```python
import playwright  # Should not raise ModuleNotFoundError
```

---

References:
- [Hagent Gateway Adding Platform](https://github.com/HatNguyen/hagent-agent/blob/main/gateway/platforms/ADDING_A_PLATFORM.md)
- [Telegram Adapter Reference](/Users/nguyenhat/HAgent/backend/gateway/platforms/telegram.py)
- [Platforms Cookie Extraction Patterns](references/messaging-cookie-extraction-patterns.md)
- **Zalo QR Workflow**: `~/.hagent/plugins/platforms/omnichannel/backend/references/zalo-qr-auth-guide.md` (QR code & cookie auth guide, includes DingTalk pattern from dingtalk_auth.py)
- **Zalo Message Viewing**: `~/.hagent/plugins/platforms/omnichannel/backend/references/zalo-message-viewing-workflow.md` (API limitations & browser-only reading guide) ⭐
- **Omnichannel Hub Backend API**: `~/.hagent/plugins/platforms/omnichannel/OMNICHANNEL_BACKEND_SETUP.md` - Complete setup & integration guide
- [OmniChat Frontend Pattern](/Users/nguyenhat/HAgent/frontend/src/components/OmniChat.jsx) - Unified inbox React component
- **Omnichannel Frontend Integration**: `references/omnichannel-frontend-integration-pattern.md` - 4-step external API backend + frontend pattern ✅

Support Files:
- `references/zalo-setup.md` - Zalo cookie extraction, bot registration
- `references/facebook-playwright-pattern.md` - E2EE PIN handling, message scraping  
- `references/messaging-cookie-extraction-patterns.md` - Unified browser cookie extraction (Zalo/Facebook/Telegram)
- `references/simpleai-ecosystem-pattern.md` - SimpleAI project structure and migration approach
- **`references/zalo-qr-workflow.md`** - Complete QR code login pattern for Zalo authentication, including DingTalk device flow example
- **`references/zalo-message-viewing-workflow.md`** - Zalo API limitations & browser-only reading guide ⭐
- `templates/testing-framework.md` - Multi-platform test patterns and verification checklist
- **`scripts/omnichannel_setup.sh`** - Quick setup & verify script (automates config creation, env loading)
- **`references/omnichannel-frontend-integration-pattern.md`** - Frontend React component integration workflow ✅

### Omnichannel Hub Backend Specific:
- `references/zalo-qr-workflow.md` - Complete QR code login guide (Zalo/Facebook OAuth patterns)
- `scripts/omnichannel_setup.sh` - Setup wizard for omnichannel backend initialization ✅
- `scripts/omnichannel_setup.sh` - Setup wizard for omnichannel hub initialization

---

## Usage Examples

### Example 1: Add Zalo Platform

```bash
cd ~/.hagent/plugins/platforms/zalo
hagent setup add-platform zalo \
  --adapter-path adapter.py \
  --plugin-yaml plugin.yaml
```

### Example 2: Send Message via Omnichannel Hub

```python
from gateway.plugins.omnichannel import create_omnichannel_router

router = create_omnichannel_router(config)

# List conversations
conversations = await router.list_conversations()

# Send message to Zalo chat
result = await router.send_message(
    chat_id="zalo_123456789",
    message="Hello from Telegram! 🎉"
)
```

### Example 3: Migrate SimpleAI Bot to Hagent

```bash
# Copy existing bot script as plugin
cp /Volumes/HatAI/Pending/SimpleAI/backend/zalo_bot.py \
   ~/.hagent/plugins/platforms/zalo/bot_migration.py

# Add simple plugin.yaml
cat > ~/.hagent/plugins/platforms/zalo/plugin.yaml << 'EOF'
name: zalo-migration
platform: zalo
description: "Migrated from SimpleAI bot"
requires_env:
  ZALO_COOKIE_STRING: Cookie string from browser DevTools
optional_env:
  ZALO_BOT_NAME: "SimpleAI Zalo Bot"
EOF

# Register with Hagent
hagent setup add-platform zalo \
  --adapter-path ~/.hagent/plugins/platforms/zalo/adapter.py \
  --plugin-yaml ~/.hagent/plugins/platforms/zalo/plugin.yaml
```

### Example 4: Omnichannel Hub Initialization

```bash
# Set cookies (once per session)
source ~/.hagent/omnichannel.env

# Initialize hub (checks both Zalo and Facebook)
python ~/.hagent/plugins/platforms/omnichannel/init.py

# Test connectivity
python ~/.hagent/plugins/platforms/omnichannel/test_omnichannel.py ~/.hagent/omnichannel.env
```

---

## Troubleshooting

### Common Issues & Solutions

#### Issue: "Cookie invalid" / "Login required"

**Solution:**
1. Open Zalo/Facebook Web in browser and re-login
2. Press F12 → Application → Cookies
3. Copy full cookie string (all cookies, not individual lines)
4. Paste into env var or config file

#### Issue: "Bot UID not found"

**Solution:**  
1. Leave empty - adapter will auto-detect from session token
2. Or find Bot UID from Console tab in browser after login
3. Skip if using default config (non-bot accounts)

#### Issue: Facebook adapter fails to launch

**Solution:**
1. Set `FACEBOOK_HEADLESS=false` to see visual errors
2. Check cookies include `c_user=xxx` at start of string
3. For E2EE threads: PIN will be prompted once and cached automatically
4. Skip Facebook platform if only testing Zalo

#### Issue: Connection refused (API endpoints)

**Solution:**
1. Run Hagent Gateway server first: `uv run hagent-gateway start`
2. Or: `uv run fastapi run main.py --port 8080`
3. Check logs at `~/.hagent/gateway.log`

#### Issue: Omnichannel hub not responding

**Solution:**
1. Verify all platforms loaded with ✅ in init output
2. Check environment variables are set correctly
3. Restart Hagent gateway after plugin registration

### Quick Check Script

```bash
cd ~/.hagent/plugins/platforms/omnichannel
./scripts/quick-check.sh  # Available in setup files
# Or run manually:
python3 test_omnichannel.py ~/.hagent/omnichannel.env
```