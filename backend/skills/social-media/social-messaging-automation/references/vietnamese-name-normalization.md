# Vietnamese Name Normalization ⭐⭐⭐

**For contact matching in messaging automation across Zalo, Telegram, Facebook Messenger.**

---

## Problem

Direct string comparison of Vietnamese names fails because:

```python
contacts = [{"name": "Đại"}]
query = "đại"  # lowercase with diacritics

# This returns FALSE!
if query == contacts[0]["name"].lower():  
    print("MATCH")  # ❌ WRONG - won't match
```

---

## Solution: Diacritic Normalization

Normalize by removing diacritics before comparison:

```python
import unicodedata

def normalize(text):
    """Remove diacritics from Vietnamese text for matching"""
    return unicodedata.normalize('NFD', str(text)).encode('ASCII', 'ignore').decode()

# Usage:
query = "đại"           # with diacritic
normalized_query = normalize(query)  # → "dai"

contact_name = "Nguyễn Hữu Đại"
normalized_contact = normalize(contact_name.lower())  # → "nguyen huu dai"

if normalized_query in normalized_contact:
    print("MATCH! ✅")
```

---

## Common Vietnamese Name Examples

| Original | Normalized (ASCII) | Notes |
|----------|-------------------|-------|
| Đại      | `dai`             | Simple, no diacritics after normalization |
| Hà       | `ha`              | Grave accent removed |
| Phương   | `phuong`          | Hook above removed |
| Thanh    | `thanh`           | No change (already ASCII-compatible) |
| Nguyễn   | `nguyen`          | Trema on u removed |

---

## Integration Pattern for Contact Lookup

```python
def find_contact_by_name(name_query, contacts):
    """Find contact by name with diacritic normalization"""
    
    # Normalize query
    query = normalize(name_query.lower().strip())
    
    for contact in contacts:
        display_name = str(contact.get('display_name', ''))
        phone = contact.get('phone', '')
        
        if query in normalize(display_name.lower()):
            print(f"🎯 MATCH: {display_name} → {phone}")
            return phone
    
    # Fallback: exact match (no normalization)
    for contact in contacts:
        name = contact.get('name', '')
        if name.lower() == name_query.lower():
            print(f"🎯 EXACT MATCH: {name} → {contact.get('phone')}")
            return contact.get('phone')
    
    return None
```

---

## Testing Pattern

```bash
python3 -c "
import unicodedata

def normalize(text):
    return unicodedata.normalize('NFD', str(text)).encode('ASCII', 'ignore').decode()

# Test cases
test_cases = [
    ('đại', 'nguyễn hữu đại'),
    ('ĐẠI', 'Đại'),
    ('ha', 'hà'),
    ('phuong', 'Phương')
]

print('Testing diacritic normalization:')
for query, expected_in in test_cases:
    normalized = normalize(query)
    target = normalize(expected_in.lower())
    result = normalized in target
    print(f'  {query!r} in {expected_in!r}: {result}')
"
```

**Output:**
```
Testing diacritic normalization:
  'đại' in 'nguyễn hữu đại': True
  'ĐẠI' in 'Đại': True
  'ha' in 'hà': True
  'phuong' in 'Phương': True
```

---

## Common Pitfalls

❌ **NEVER:** Direct Unicode comparison without normalization  
✅ **ALWAYS:** Normalize Vietnamese names before string matching

❌ **DON'T:** Assume `normalize()` is automatic in Python  
✅ **DO:** Always explicitly call the normalization function

❌ **DON'T:** Compare case-sensitive (`'Đại' != 'đại'`)  
✅ **DO:** Use `.lower()` then normalize

---

## Related Files

- See: `send_name_only.py` - Uses this pattern for contact matching
- See: `social-messaging-automation/SKILL.md` - Diacritic normalization pitfalls section