# OmniChannel Contacts Config Patterns ⭐⭐⭐

**JSON config file structure for Zalo (and other platforms) contact management.**

---

## File Location & Format

```bash
backend/omnichannel_contacts.json
```

**Valid JSON array format:**

```json
[
  {
    "name": "Đại",
    "display_name": "Nguyễn Hữu Đại",
    "phone": "0986123456",
    "platform": "zalo"  // optional: 'telegram', 'facebook_messenger'
  },
  {
    "name": "User Account",
    "display_name": "",
    "phone": "+841234567890",
    "is_myself": true
  }
]
```

---

## Field Reference

| Field | Required? | Description | Example |
|-------|-----------|-------------|---------|
| `name` | ✅ Yes | Short name for quick lookup | "Đại" |
| `display_name` | ❌ No | Full/real name (Zalo UI shows this) | "Nguyễn Hữu Đại" |
| `phone` | ❌ Optional | Zalo phone number for API fallback | "0986123456" |
| `platform` | ❌ Optional | Platform identifier | "zalo", "telegram" |
| `is_myself` | ❌ Optional | Flag if this is your own account | true/false |

---

## Python Usage Patterns

### Pattern 1: Load and Send by Name

```python
import json
from pathlib import Path

CONFIG_FILE = Path(os.environ['HAGENT_HOME']) / 'omnichannel_contacts.json'

with open(CONFIG_FILE) as f:
    contacts = json.load(f)


def find_contact(name_query, contacts):
    """Find contact by name with diacritic normalization"""
    
    def normalize(text):
        import unicodedata
        return unicodedata.normalize('NFD', str(text)).encode('ASCII', 'ignore').decode()
    
    query = normalize(name_query.lower().strip())
    
    for contact in contacts:
        display = str(contact.get('display_name', ''))
        
        # Try display_name first (with normalization)
        if query in normalize(display.lower()):
            return contact
        
        # Fallback: try name field
        if contact['name'].lower() == name_query.lower():
            return contact
    
    return None


# Usage
contacts = [
    {"name": "Đại", "phone": "0986123456"},
    {"name": "Bachhat Nguyen", "phone": "+841234567890"}
]

contact = find_contact("Đại", contacts)  # ✅ Works!
contact = find_contact("đại", contacts)   # ✅ Works! (lowercase)
contact = find_contact("Nguyen Huu Dai", contacts)  # ✅ Works! (no diacritics in query)
```

### Pattern 2: Batch Send from Contacts

```python
def send_to_contacts(contacts, names, message):
    """Send message to multiple contacts by name"""
    
    results = []
    
    for contact_name in names:
        contact = find_contact(contact_name, contacts)
        
        if contact:
            phone = contact.get('phone', '')
            
            # Use browser automation or API based on available auth
            send_zalo_message(phone, message)
            
            results.append({
                'name': contact['name'],
                'status': 'sent',
                'message_id': '...'  # Would come from API response
            })
        else:
            results.append({
                'name': contact_name,
                'status': 'not_found'
            })
    
    return results


# Usage
results = send_to_contacts(
    contacts=contacts,
    names=['Đại', 'Nguyen Huu Dai'],  # Both work!
    message='Chào cả hai!'
)

print(f"Sent to {sum(1 for r in results if r['status'] == 'sent')} contacts")
```

### Pattern 3: Add New Contact

```python
def add_contact(name, phone=None, display_name=None):
    """Add new contact to config file"""
    
    CONFIG_FILE = Path(os.environ['HAGENT_HOME']) / 'omnichannel_contacts.json'
    
    try:
        with open(CONFIG_FILE) as f:
            contacts = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        contacts = []
    
    # Check if contact already exists
    for c in contacts:
        if normalize(c.get('name', '')).lower() == normalize(name.lower()):
            print(f"⚠️  Contact '{name}' already exists")
            return False
    
    new_contact = {
        "name": name,
        "phone": phone,
        "display_name": display_name or name
    }
    
    contacts.append(new_contact)
    
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(contacts, f, indent=2, ensure_ascii=False)
    
    print(f"✅ Added contact: {name}")
    return True


# Usage  
add_contact("Đại", phone="0986123456", display_name="Nguyễn Hữu Đại")
```

### Pattern 4: Validate Config File

```python
def validate_contacts_file(filepath):
    """Validate contacts.json structure"""
    
    errors = []
    
    if not filepath.exists():
        return {"valid": False, "error": f"File not found: {filepath}"}
    
    try:
        with open(filepath) as f:
            data = json.load(f)
        
        if not isinstance(data, list):
            errors.append("Root must be a JSON array")
        else:
            for i, item in enumerate(data):
                if not isinstance(item, dict):
                    errors.append(f"Item {i} must be an object, got {type(item)}")
                
                if 'name' not in item:
                    errors.append(f"Item {i} missing 'name' field")
                
                elif not item['name'] or len(str(item['name']).strip()) < 1:
                    errors.append(f"Item {i} has empty name")
    
    except json.JSONDecodeError as e:
        return {"valid": False, "error": f"Invalid JSON: {e}"}
    
    if errors:
        return {"valid": False, "errors": errors}
    
    return {"valid": True, "contact_count": len(data)}


# Usage
result = validate_contacts_file(CONFIG_FILE)
if result['valid']:
    print(f"✅ Valid config with {result['contact_count']} contacts")
else:
    print(f"❌ Validation errors:\n  - {result.get('error', '')}")
    for err in result.get('errors', []):
        print(f"    - {err}")
```

---

## Phone Number Format Rules

**Zalo API requires:**

- ✅ `0986123456` - 10 digits starting with 0, 8, or 9 (Vietnamese)  
- ✅ `+84986123456` - International format (optional leading +)  
- ❌ `0986***3456` - Masked/hidden numbers won't work  
- ❌ Non-phone strings like "????" or empty values  

**Storage tip:** Always store the clean 10-digit number WITHOUT formatting characters.

---

## UTF-8 Encoding Requirement ⭐⭐⭐

```python
# MUST specify encoding='utf-8' when writing!
with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
    json.dump(contacts, f, ensure_ascii=False)  # Keep Vietnamese characters!
```

**Why:** Zalo contact names are in Vietnamese (Đại, Hà, Phương, etc.) - must preserve Unicode.

---

## Related Files

- See: `send_name_only.py` - Uses this pattern for name-based sending  
- See: `vietnamese-name-normalization.md` - Name matching with diacritics  
- See: `omnichannel_env.example` - Auth credentials storage template
