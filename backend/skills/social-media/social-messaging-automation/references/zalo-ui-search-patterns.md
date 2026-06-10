# Zalo UI Search Patterns ⭐⭐⭐

**Browser automation to find chats by contact name (Playwright-based).**

---

## Overview

Zalo's public API does NOT expose a phonebook endpoint. To send messages by NAME without phone numbers:

1. ✅ **Browser automation** (Playwright) - Search UI for contact names
2. ⚠️ **API fallback** - Use known phone number with direct messaging endpoint  
3. ❌ **Phonebook scraping** - Not reliable, requires OAuth app registration

---

## Pattern 1: Direct Contact Search via Browser UI

```python
from playwright.sync_api import sync_playwright

def find_chat_by_name(contact_name, page):
    """Find chat by searching contact name in conversation list"""
    
    print(f"\n🔍 Searching Zalo UI for: '{contact_name}'...")
    
    try:
        # Locate conversation items in sidebar
        conversations = page.locator('.MessageList__Item, [class*="conversation"]')
        
        found = False
        
        for item in conversations.all()[:50]:  # Check first 50 items
            try:
                item_box = page.box_for_element(item)
                text = item_box.text_content().lower() if hasattr(item_box, 'text_content') else ''
                
                if contact_name.lower() in text or contact_name.replace('đ', 'd').lower() in text:
                    print(f"   ⚡ FOUND: {contact_name}")
                    
                    # Click on the conversation
                    item.click()
                    
                    return True
                    
            except Exception as e:
                continue
        
        return False
        
    except Exception as e:
        print(f"   ⚠️  Error searching UI: {e}")
        return False


def send_message_via_browser(contact_name, message, page):
    """Send message using browser automation (no phone number needed)"""
    
    print(f"\n📤 Sending to: '{contact_name}'")
    
    try:
        # Navigate to chat if not already there
        if 'chat' not in page.url.lower():
            page.goto('https://chat.zalo.me/messages')
            page.wait_for_selector('.MessageList__Item', timeout=30000)
        
        # Find and click conversation
        if find_chat_by_name(contact_name, page):
            
            # Type message
            try:
                text_input = page.locator('textarea, .message-input')
                text_input.fill(message.replace('\n', ' ').replace('  ', ' '))
                text_input.press('Enter')
                
                print("   ✅ Message sent successfully!")
                return True
                
            except Exception as e:
                print(f"   ⚠️  Error typing: {e}")
        
        else:
            print(f"   ❌ Could not find chat with '{contact_name}'")
            
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False


# Example usage
with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)  # Show window
    page = browser.new_page()
    
    # Navigate to Zalo
    page.goto('https://chat.zalo.me')
    
    # Find and send
    find_chat_by_name("Đại", page)
    send_message_via_browser("Đại", "Hello!", page)
    
    browser.close()
```

---

## Pattern 2: Direct API with Known Phone (Fallback)

If you have the phone number, use direct API:

```python
import http.client

conn = http.client.HTTPSConnection("zalo.me", timeout=30)

payload = {
    "to": "0986123456",  # Phone number needed
    "type": "text", 
    "message": "Hello from Zalo API"
}

headers = {
    "Content-Type": "application/json",
    "Cookie": "sessionid=xxx; user_id=yyy"  # Required for auth
}

conn.request("POST", "/messaging", str(payload).encode('utf-8'), headers)
response = conn.getresponse()

if response.status == 200:
    print("✅ Message sent!")
else:
    print(f"❌ HTTP {response.status}")

conn.close()
```

---

## Pattern 3: Contact JSON Config with Browser Automation

**Recommended hybrid approach:** Store phone numbers once in config, send via name lookup:

```json
[{
    "name": "Đại", 
    "phone": "0986123456",
    "display_name": "Nguyễn Hữu Đại"
}]
```

Then use browser automation to find by NAME only (no phone entry needed):

```python
def send_by_config_json(name, message):
    """Send via name lookup from contacts.json using browser UI"""
    
    import json
    from pathlib import Path
    
    config_file = Path(os.environ['HAGENT_HOME']) / 'omnichannel_contacts.json'
    
    with open(config_file) as f:
        contacts = json.load(f)
    
    # Find contact by name (with diacritic normalization)
    def normalize(text):
        import unicodedata
        return unicodedata.normalize('NFD', str(text)).encode('ASCII', 'ignore').decode()
    
    query = normalize(name.lower().strip())
    
    for contact in contacts:
        display_name = normalize(contact.get('display_name', ''))
        
        if query in display_name.lower():
            print(f"🎯 FOUND: {contact}")
            
            # Launch browser and send
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=False)
                page = browser.new_page()
                page.goto('https://chat.zalo.me/messages')
                
                # Send message (browser automation, not API)
                send_message_via_browser(name, message, page)
                browser.close()
            
            return True
    
    print(f"❌ Contact '{name}' not found")
    return False


# Usage
send_by_config_json("Đại", "Chào bạn!")
```

---

## UI Element Selectors Reference

| Element | Selector Pattern | Description |
|---------|------------------|-------------|
| Conversation item | `.MessageList__Item` | Sidebar chat list items |
| Message input | `textarea, .message-input` | Text area for typing |
| Send button | `[class*="send"]` | Send message button |
| User avatar | `.user-avatar` | Avatar image element |

---

## Common Pitfalls

❌ **NEVER:** Assume `/phonebook/` endpoint works without OAuth app  
✅ **ALWAYS:** Use browser automation for name-based contact lookup

❌ **DON'T:** Try to scrape phone numbers from HTML (rate limited)  
✅ **DO:** Store phone numbers in config once, use name-only searching

❌ **DON'T:** Compare Vietnamese names directly with diacritics  
✅ **DO:** Normalize using `unicodedata.normalize()` first

---

## Testing Commands

```bash
# Test browser automation setup
python3 -c "from playwright.sync_api import sync_playwright; print('OK')"

# Test contact matching pattern
python3 -c "
import unicodedata
def normalize(t): return unicodedata.normalize('NFD', str(t)).encode('ASCII', 'ignore').decode()
print(normalize('đại'))  # Should output: 'dai'
"

# Full send test (requires logged-in session)
python3 send_name_only.py Đại 'Chào bạn!'
```

---

## Related Files

- See: `send_name_only.py` - Complete browser automation sender
- See: `social-messaging-automation/SKILL.md` - Pitallls section on name-based sending
