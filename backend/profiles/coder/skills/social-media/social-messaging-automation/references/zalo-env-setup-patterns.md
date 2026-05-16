# Zalo Environment Setup Patterns ⭐⭐⭐

**Credential storage and auth setup for automated messaging.**

---

## Cookie-Based Authentication (Stored Files)

### Option 1: Omnichannel.env (Recommended Pattern)

```bash
cat > ~/.hagent/omnichannel.env << 'EOF'
export ZALO_COOKIE_STRING="sessionid=xxx; user_id=yyy; ..."
export OMNICHANNEL_BASE_URL="https://chat.zalo.me"
EOF
```

**Source:** Open browser DevTools (F12) → Application tab → Cookies  
**Copy as curl** for the Zalo cookie line.

### Option 2: Per-Platform Config

```bash
# ~/.hagent/zalo_creds.json
{
    "zalo": {
        "cookie": "sessionid=xxx;...",
        "auth_method": "cookie",  # or "oauth"
        "base_url": "https://chat.zalo.me"
    }
}
```

### Option 3: OAuth Token (For Apps)

```bash
# ~/.hagent/zalo_oauth.json
{
    "client_id": "app_xyz123",
    "access_token": "eyJhbGciOiJ...",
    "refresh_token": "ey...",
    "expires_at": 1736558400
}
```

---

## Playwright Setup (Browser Automation)

### Installation Commands ⭐⭐⭐

```bash
# Install Playwright Python package
pip3 install playwright

# Download Chromium browser dependencies
playwright install chromium
playwright install-deps chromium  # For full browser libs

# Verify installation
python3 -c "from playwright.sync_api import sync_playwright; print('OK')"
```

### Browser Configuration

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=False,  # Show window for manual auth setup
        args=[
            '--no-sandbox',           # macOS/Linux required
            '--disable-blink-features=AutomationControlled'  # Anti-bot detection
        ]
    )
    
    context = browser.new_context(
        viewport={'width': 1280, 'height': 800},
        user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)...'  # Like Chrome
    )
    
    page = context.new_page()
    page.goto('https://chat.zalo.me')
    
    browser.close()
```

---

## Credential Detection Order (Auto-Fallback Pattern)

**Recommended detection sequence for scripts:**

```python
def get_auth_credentials():
    """Detect auth method in priority order"""
    
    # 1. Check omnichannel.env first
    env_file = Path.home() / '.hagent' / 'omnichannel.env'
    if env_file.exists():
        with open(env_file) as f:
            for line in f:
                if 'export ZALO_COOKIE_STRING=' in line:
                    return {'method': 'cookie', 'value': line.split('=', 1)[1].strip().strip('"\'')}
    
    # 2. Check platform-specific JSON files
    creds_file = Path.home() / '.hagent' / 'zalo_creds.json'
    if creds_file.exists():
        import json
        with open(creds_file) as f:
            creds = json.load(f)
            return {'method': 'cookie', 'value': creds.get('zalo', {}).get('cookie')}
    
    # 3. Check OAuth tokens
    oauth_file = Path.home() / '.hagent' / 'zalo_oauth.json'
    if oauth_file.exists():
        import json
        with open(oauth_file) as f:
            return {'method': 'oauth', **json.load(f)}
    
    # 4. No credentials - prompt user inline
    print("\n🔐 No auth found! Opening browser for manual setup...")
    input("Press Enter when you've logged into Zalo...\n")
    
    return None
```

---

## Session Persistence Patterns

### Option A: Reuse Browser Cookies (Best Performance)

```python
from playwright.sync_api import sync_playwright
import json

def reuse_existing_session():
    """Reuse existing browser cookie file if available"""
    
    cookies_file = Path.home() / '.hagent' / 'zalo_cookies.json'
    
    if cookies_file.exists():
        with open(cookies_file) as f:
            cookies = json.load(f)
        
        context = p.chromium.launch_persistent_context(
            user_data_dir=Path.home() / 'Library/Application Support/Google/Chrome',
            headless=False,
            store_user_data=True
        )
        
        page = context.pages[0]
        page.evaluate("() => document.cookie", cookies)  # Apply cookies
        
        return page
    else:
        print("No saved session found - starting fresh")
```

### Option B: Fresh Session (For Testing Only)

```python
def create_fresh_session():
    """Create new browser session for testing"""
    
    context = p.chromium.launch(
        headless=False,
        args=['--no-first-run', '--disable-blink-features=AutomationControlled']
    )
    
    page = context.new_page()
    page.goto('https://chat.zalo.me')
    
    # Wait for user to login manually
    page.wait_for_selector('.MessageList__Item', timeout=60000)
    
    return page
```

---

## Common Pitfalls ❌→✅

❌ **DON'T:** Store cookies in plaintext without encryption  
✅ **DO:** Use `~/.hagent/` (user-writable path, not `/etc` or system dirs)

❌ **DON'T:** Forget to include all cookie attributes (name=value; expires=...; domain=...)  
✅ **DO:** Use "Copy as curl" from DevTools to get full cookie string

❌ **DON'T:** Assume OAuth is required for simple messaging  
✅ **DO:** Cookie-based auth works fine for sending messages only

❌ **DON'T:** Launch headless=True without login first  
✅ **DO:** Use `headless=False` initially for manual auth setup, then reuse saved session

---

## Testing Auth Setup

```bash
# Test 1: Check cookie file exists
cat ~/.hagent/omnichannel.env | grep ZALO_COOKIE_STRING

# Test 2: Verify Playwright can load cookies
python3 -c "
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context()
    
    # Load saved cookies
    try:
        with open('~/.hagent/zalo_cookies.json') as f:
            cookies = json.load(f)
        context.add_cookies(cookies)
        print('✅ Cookies loaded')
    except:
        print('⚠️  No saved cookies (will need login)')
    
    page = context.new_page()
    page.goto('https://chat.zalo.me/messages')
    print(f'Status: {page.title()}')"
```

---

## Related Files

- See: `omnichannel_env.example` - Cookie storage template  
- See: `send_name_only.py` - Uses cookie detection pattern  
- See: `social-messaging-automation/SKILL.md` - Pitallls on credential handling