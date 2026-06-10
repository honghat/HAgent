# Omnichannel Hub Pattern - Unified Inbox Architecture

## Overview

Omnichannel hub provides **unified inbox** across multiple platforms (Zalo, Facebook Messenger) with SimpleAI-style API compatibility. Enables single point of management for cross-platform conversations.

---

## Architecture

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

### Components

1. **OmnichannelManager** (`__init__.py`): Core hub logic handling:
   - Platform adapter management
   - Unified message routing
   - Conversation aggregation
   - SimpleAI-compatible API surface

2. **Router** (`router.py`): Gateway integration layer
   - Message forwarding between Telegram ↔ platforms
   - Webhook/polling coordination
   - Status reporting

3. **Adapters**: Platform-specific implementations
   - Zalo: Cookie-based webhook polling
   - Facebook: Playwright automation + E2EE support

4. **Plugin** (`plugin.yaml`): Gateway registration config
   - Auto-handled by Hagent lifecycle
   - Zero core changes required

---

## API Endpoints

### List Conversations (GET)

```bash
curl http://localhost:8080/api/v1/omni/conversations
# Response: Array of all conversations across platforms
[
  {"id": "zalo_123456789", "sender": "Nguyễn Văn A", "channel": "zalo"},
  {"id": "fb_thread_123", "sender": "User B", "channel": "facebook"}
]
```

### Send Message (POST)

```bash
curl -X POST http://localhost:8080/api/v1/omni/conversations/zalo_123/messages \\
  -H "Content-Type: application/json" \\
  -d '{"content": "Hello from Telegram!"}'
# Response: {"success": true, "message": "Sent to Zalo 123..."}
```

### Get Chat History

```bash
curl http://localhost:8080/api/v1/omni/conversations/zalo_123/messages?limit=50
# Returns paginated messages with timestamps and sender info
```

### Mark All as Read

```bash
curl -X POST http://localhost:8080/api/v1/omni/conversations/read-all
# Marks all conversations across platforms as read
```

---

## File Structure

```
$HAGENT_HOME/plugins/platforms/omnichannel/
├── __init__.py          # Core manager - SimpleAI API compatible ✅
├── router.py            # Gateway integration layer ✅
├── plugin.yaml          # Plugin configuration ✅
├── init.py              # Initialization script ✅
├── test_omnichannel.py  # Test runner (executable) ✅
├── README.md            # Vietnamese documentation ✅
└── SUMMARY.md           # Architecture overview ✅
```

---

## Environment Variables

### Core Omnichannel Config (`$HAGENT_HOME/omnichannel.env`)

```bash
# Omnichannel hub settings
export OMNICHANNEL_ENABLED=true
export OMNICHANNEL_ZALO_ADAPTER=$HAGENT_HOME/plugins/platforms/zalo/adapter.py
export OMNICHANNEL_FB_ADAPTER=$HAGENT_HOME/plugins/platforms/facebook/adapter.py

# Zalo (REQUIRED for basic functionality)
export ZALO_COOKIE_STRING='PHPSESSID=abc123; zalome_userid=xxx; _zalo_session=yyy'
export ZALO_BOT_UID='9876543210'  # Optional, auto-detect if not set

# Facebook (OPTIONAL)
export FACEBOOK_COOKIE_STRING='c_user=123; ux=xxx; datr=yyy'
export FACEBOOK_HEADLESS=false    # Default, keep for debugging
```

---

## Setup Commands

### Initialize Omnichannel Hub

```bash
python $HAGENT_HOME/plugins/platforms/omnichannel/init.py
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

### Test Omnichannel Hub

```bash
cd $HAGENT_HOME/plugins/platforms/omnichannel
python3 test_omnichannel.py $HAGENT_HOME/omnichannel.env
```

---

## Telegram Bot Commands

Once omnichannel hub is running, use these commands with Hagent bot:

```
/omnichannel list      # List all connected platforms and conversations
/omnichannel send zalo <user_id> "<message>"  # Send to Zalo chat
/omnichannel read-all  # Mark all as read
```

---

## Usage Pattern

### SimpleAI-Compatible Usage

```python
from gateway.plugins.omnichannel import create_omnichannel_router

router = create_omnichannel_router(config)

# List conversations
conversations = await router.list_conversations()

# Send message to specific platform
result = await router.send_message(
    chat_id="zalo_123456789",
    message="Hello from Telegram! 🎉"
)

# Get chat history
messages = await router.get_messages(chat_id="zalo_123456789", limit=50)

# Mark all conversations as read
await router.mark_all_as_read()
```

---

## Pitfalls

### Omnichannel Hub-Specific Issues

1. **Cookie String Format**: Must be complete string with all cookies, not individual lines. Use "Copy as curl" function in browser DevTools.

2. **Bot UID Auto-detection**: If not set in env var, adapter will auto-detect from session token after successful login.

3. **Omnichannel Hub API Port**: Default is `8080`. Override with `--port 9000` flag if needed.

4. **Platform Loading Order**: Zalo loads first (REQUIRED), then Facebook (OPTIONAL). If Facebook fails to load, hub continues with Zalo-only functionality.

5. **Cross-Platform Messaging Limits**: Each platform has its own message size limits and rate limits. Hub doesn't aggregate these - they're enforced per-platform.

---

## Migration from SimpleAI

For migrating existing SimpleAI-style bots:

### Option 1: Zero Core Changes (Recommended)

```bash
# Copy existing bot as plugin
cp /Volumes/HatAI/Pending/SimpleAI/backend/zalo_bot.py \\
   $HAGENT_HOME/plugins/platforms/zalo/bot_migration.py

# Create plugin.yaml
cat > $HAGENT_HOME/plugins/platforms/zalo/plugin.yaml << 'EOF'
name: zalo-migration
platform: zalo
description: "Migrated from SimpleAI bot"
requires_env:
  ZALO_COOKIE_STRING: Cookie string from browser DevTools
optional_env:
  ZALO_BOT_NAME: "SimpleAI Zalo Bot"
EOF

# Register with Hagent
hagent setup add-platform zalo \\
  --adapter-path $HAGENT_HOME/plugins/platforms/zalo/adapter.py \\
  --plugin-yaml $HAGENT_HOME/plugins/platforms/zalo/plugin.yaml
```

### Option 2: Use Omnichannel Hub

For unified inbox across multiple platforms, use the hub pattern instead.

---

## Quick Reference

| Task | Command |
|------|---------|
| Initialize hub | `python $HAGENT_HOME/plugins/platforms/omnichannel/init.py` |
| Test hub | `python3 test_omnichannel.py $HAGENT_HOME/omnichannel.env` |
| List conversations | `curl http://localhost:8080/api/v1/omni/conversations` |
| Send message | `curl -X POST http://localhost:8080/api/v1/omni/conversations/zalo_123/messages -H "Content-Type: application/json" -d '{"content": "..."}'` |
| Setup wizard | `source $HAGENT_HOME/omnichannel_setup.sh` |

---

## See Also

- [platforms-integration skill](../SKILL.md) - Platform integration patterns
- [$HAGENT_HOME/OMNICHANNEL_QUICK_START.md](../../OMNICHANNEL_QUICK_START.md) - Vietnamese quick start guide
- [$HAGENT_HOME/plugins/platforms/omnichannel/README.md](./README.md) - Full documentation

---

## Version History

### v1.0.0 (Created May 2026)
- Initial omnichannel hub implementation
- SimpleAI API compatibility layer
- Plugin-based architecture for zero core changes

### Upcoming
- WebSocket real-time messaging
- Attachment forwarding across platforms