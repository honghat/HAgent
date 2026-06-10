# Wiki Management for HAgent System

## Overview

HAgent's system wiki is stored in **SQLite database** at `/Users/nguyenhat/HAgent/data/hagent.db`, NOT as markdown files. This differs from research/wiki skills which save to separate documentation stores.

## Schema

```sql
CREATE TABLE wiki_entries (
    id TEXT PRIMARY KEY,                    -- UUID or custom ID
    user_id TEXT NOT NULL,                  -- User identifier for ownership
    title TEXT NOT NULL,                    -- Display name/title
    content TEXT,                           -- Full content/markdown body
    summary TEXT,                           -- Short description for listing/search
    topics TEXT                             -- Comma-separated: "topic1, topic2"
);
```

## Finding an Entry

```python
import sqlite3

db_path = "/Users/nguyenhat/HAgent/data/hagent.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Find by ID (most common)
cursor.execute("SELECT title, content[:500] FROM wiki_entries WHERE id=? LIMIT 1",
               ("6e56f7d3-4bbd-4a36-9c89-603961bbe8c7",))

# Find by title (prefix match)
cursor.execute("SELECT title, summary FROM wiki_entries WHERE title LIKE ? LIMIT 5",
               ("%old.hatai.io.vn%",))

conn.close()
```

## Common Management Tasks

### Update Summary Only
```python
import sqlite3
new_summary = "Setup domain old.hatai.io.vn trỏ về server hat-pi..."

sqlite3.connect(db_path).execute(
    "UPDATE wiki_entries SET summary=? WHERE id=?",
    (new_summary, "6e56f7d3-4bbd-4a36-9c89-603961bbe8c7")
)
```

### Update Both Content and Summary
```python
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

new_summary = "Setup domain old.hatai.io.vn trỏ về server hat-pi..."
new_content = """## 1. SSH vào hat-pi
..."""

cursor.execute(
    "UPDATE wiki_entries SET summary=?, content=? WHERE id=?",
    (new_summary, new_content, "6e56f7d3-4bbd-4a36-9c89-603961bbe8c7")
)
conn.commit()

# Verify update
cursor.execute("SELECT summary FROM wiki_entries WHERE id=?", ("..."))
print(cursor.fetchone())
conn.close()
```

### Check if Entry Exists Before Updating
```python
cursor.execute("SELECT id, title FROM wiki_entries WHERE id=?",
               ("6e56f7d3-4bbd-4a36-9c89-603961bbe8c7",))
existing = cursor.fetchone()

if existing:
    print(f"Entry exists: {existing[0]} - {existing[1]}")
else:
    print("Entry not found!")
```

### Insert New Entry (if missing)
```python
# First get a valid user_id
cursor.execute("SELECT id FROM users LIMIT 1")
user_id = cursor.fetchone()[0] if cursor.fetchone() else None

cursor.execute(
    "INSERT OR REPLACE INTO wiki_entries (id, title, content, summary, topics) VALUES (?, ?, ?, ?, ?)",
    ("new-id", "Title", "Content...", "Summary...", "topic1, topic2")
)
```

### List All Wiki Entries (Debug)
```python
cursor.execute("""
    SELECT id, title, substr(content, 1, 100) as preview 
    FROM wiki_entries 
    ORDER BY id DESC 
    LIMIT 10
""")
for row in cursor.fetchall():
    print(f"[{row[0]}] {row[1]} ...")
```

## Important Notes

1. **Always verify entry exists** before UPDATE operations
2. **Use `id` as primary key**, not title (titles can be duplicated)
3. **Get user_id from DB first** — required for INSERT/UPDATE operations
4. **Backup before bulk operations**: Check existing entries, note their IDs
5. **Canonical path**: `/Users/nguyenhat/HAgent/data/hagent.db` (NOT `backend/data/`)

## When to Use This Skill vs Research Wiki Skills

| Task | Use This | Use Research Wiki |
|------|----------|-------------------|
| Update HAgent system docs | ✅ SQLite wiki | ❌ Wrong tool |
| Save research findings | ❌ Wrong tool | ✅ GitHub-research-wiki or llm-wiki |
| Store domain knowledge | ❌ System wiki | ✅ Separate documentation |
| Research external topics | ❌ System wiki | ✅ External research tools |

**Key distinction**: System wiki = internal HAgent docs. Research wiki = external knowledge base.