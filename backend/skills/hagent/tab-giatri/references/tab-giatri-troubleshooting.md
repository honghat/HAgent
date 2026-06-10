# Tab Giải Trí Troubleshooting Guide

## Quick Diagnostic Commands

### Check Backend Health
```bash
lsof -i :8010 | grep LISTEN
# Should show: python3.x 67974 nguyenhat   ... TCP localhost:8010 (LISTEN)
```

### Verify DB Path & Size
```bash
ls -lh /Users/nguyenhat/HAgent/data/hagent.db
# Should be ~12-19MB, not 0 bytes or backend/data/hagent.db
```

### Count Stories in DB
```bash
sqlite3 /Users/nguyenhat/HAgent/data/hagent.db "SELECT COUNT(*) as story_count FROM stories;"
# Returns: number (e.g., "1" if only 1 story exists)
```

### View Recent Stories
```bash
sqlite3 /Users/nguyenhat/HAgent/data/hagent.db \
  "SELECT slug, title, updated_at FROM stories ORDER BY updated_at DESC LIMIT 5;"
# Shows: last 5 stories with timestamps
```

### Test API Endpoint Directly
```bash
curl -s http://localhost:8010/api/truyencv/recent | jq '.'
# Returns JSON list of stories (empty [] if no data)
```

## Import New Story via API

```bash
curl -X POST http://localhost:8010/api/truyencv/import \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://sitruyencv.com/truyen/ma-kiem-dai-duong-chuong-1.html"
  }'

# Response on success:
# {"status":"success","story_id":"...", "chapters_imported": 45}

# Or use hagent CLI (if chat mode enabled):
hagent chat -q "Import story from https://sitruyencv.com/truyen/example-123.html"
```

## Common Errors & Fixes

### Error: "DB not found" / Path Wrong
**Symptom**: `sqlite3` says file doesn't exist or is 0 bytes

**Fix**: Verify canonical path:
```bash
ls -lh /Users/nguyenhat/HAgent/data/hagent.db
# CORRECT path (root level, NOT backend/data/)
```

### Error: "truyencv.io API" in logs
**Symptom**: Logs mention truyencv.io instead of sitruyencv.com

**Fix**: This is old docs bug. Actual working source is **sitruyencv.com**. No action needed if using direct API imports.

### Frontend Shows Empty But DB Has Data
**Symptom**: `sqlite3` shows 50+ stories, but browser shows nothing

**Fix Steps**:
1. F5 hard refresh browser to load new bundle
2. Check frontend console for JS errors
3. Verify backend mounting: `curl http://localhost:8010/api/truyencv/recent` should return JSON

### Slow Initial Load (8-15 seconds)
**Cause**: First crawl from sitruyencv.com after server restart or cache clear

**Mitigation**: 
- Run import once manually before opening frontend
- Or just wait 10 seconds — DB caches result for subsequent calls

### "Đang tải..." Forever on Frontend
**Symptom**: Tab shows loading indicator indefinitely

**Diagnosis**:
1. Open browser DevTools → Network tab
2. Check if `/api/truyencv/recent` request is hanging or taking >30s
3. If backend takes >10s, frontend timeout may kick in

**Solutions**:
- Pre-populate: `curl http://localhost:8010/api/truyencv/recent?refresh=true > /dev/null`
- Or rebuild frontend: `cd frontend && pnpm build && cd ..`

## API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/truyencv/recent?page=1&refresh=true` | List stories (paginated) |
| POST | `/api/truyencv/import` | Import from sitruyencv.com URL |
| DELETE | `/api/truyencv/story/{slug}` | Delete specific story |

## DB Table Structure

```sql
-- Stories table
CREATE TABLE stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,  -- e.g., "xuyen-qua-tieu-binh..."
  title TEXT,
  author TEXT,
  translator_group TEXT,
  status TEXT,
  genres TEXT,              -- JSON encoded list
  description TEXT,
  cover_url TEXT,
  chapter_count INTEGER,
  source TEXT DEFAULT '',   -- 'sitruyencv' or '' for self-imported
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Chapters table
CREATE TABLE story_chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_slug TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT,
  chapter_number INTEGER,
  updated_time TIMESTAMP,
  created_at TIMESTAMP
);
```

## Import/Export Workflow

### Manual Import (Single Story)
1. Get story URL from sitruyencv.com
2. POST to `/api/truyencv/import` with JSON body
3. Wait for success response
4. Verify in DB: `sqlite3 ... "SELECT * FROM stories WHERE slug='...';"`

### Bulk Import Alternative
If you need many stories, consider:
- Writing a script that loops through sitruyencv.com category pages
- Or using the frontend's import feature if available

### Delete Stories (Cleanup)
```bash
# Find old stories
sqlite3 /Users/nguyenhat/HAgent/data/hagent.db \
  "SELECT slug FROM stories ORDER BY updated_at ASC LIMIT 5;"

# Delete oldest story
curl -X DELETE "http://localhost:8010/api/truyencv/story/<old-slug-here>"
```

## Health Check Checklist ✅

- [ ] Backend running on port 8010
- [ ] DB path correct (`/Users/nguyenhat/HAgent/data/hagent.db`)
- [ ] DB has stories: `SELECT COUNT(*) FROM stories;` > 0
- [ ] API test works: `curl http://localhost:8010/api/truyencv/recent` returns JSON
- [ ] Frontend bundle fresh (F5 or rebuild)

## References
- Main skill: [`tab-giatri`](SKILL.md)
- Service implementation: `backend/api/services/truyencv_store.py`
- Router: `backend/api/routers/truyencv.py`