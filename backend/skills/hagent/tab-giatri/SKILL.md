---
name: tab-giatri
description: "Manage Tab Giải Trí (entertainment) — manga/light novel import, API crawling, DB queries."
tags: ["hagent", "entertainment", "manga", "truyen"]
author: HAgent Agent + Teknium
license: MIT
platforms: [linux, macos]
---

# Tab Giải Trí (Entertainment) — Story Crawling & Import

## Overview
Tab Giải Trí uses backend APIs at `/api/truyencv/*` to serve manga/light novel content. Crawls stories from **sitruyencv.com** via direct API calls.

⚠️ **CRITICAL CORRECTION**: Older docs say "crawl từ truyencv.io via TruyenTVScraper" — this is WRONG. The actual working source is **sitruyencv.com API**.

## Database Location
- **Canonical path**: `/Users/nguyenhat/HAgent/data/hagent.db` (root level, NOT `backend/data/`)
- Tables: `stories`, `story_chapters`
- Service: `api/services/truyencv_store.py` (TruyenCVStore)

## Endpoints

### GET /api/truyencv/recent
Get list of recent stories.

**Query Params:**
- `page`: 1-100 (default: 1)
- `refresh`: false/true (default: false)

**Response**: List of story metadata with title, slug, cover_url, tags, last_chapter, last_chapter_time

### POST /api/truyencv/import ⭐ PRIMARY IMPORT METHOD
Import a single story from sitruyencv.com URL.

**Request Body:**
```json
{"url": "https://sitruyencv.com/truyen/story-slug-123.html"}
```

**Workflow:**
1. Extract story ID: `/(?:truyen|story)/(?:[^/]+-)?(\d+)/`
2. Call sitruyencv API: `https://api.sitruyencv.com/api/stories/{story_id}`
3. Fetch all chapters: `https://api.sitruyencv.com/api/chapters/{story_id}?page=1&limit=100&sort_order=asc`
4. Insert into DB

### DELETE /api/truyencv/story/{slug}
Delete a specific story from the system.

## Import Workflow (Terminal)

```bash
# Import single story via API
curl -X POST http://localhost:8010/api/truyencv/import \
  -H "Content-Type: application/json" \
  -d '{"url": "https://sitruyencv.com/truyen/ma-kiem-dai-duong-chuong-1.html"}'

# Or use hagent CLI if configured
hagent chat -q "Import story from https://sitruyencv.com/truyen/example-story-123.html"
```

## DB Verification Queries

```bash
# Check story count
sqlite3 /Users/nguyenhat/HAgent/data/hagent.db "SELECT COUNT(*) FROM stories;"

# View recent stories
sqlite3 /Users/nguyenhat/HAgent/data/hagent.db \
  "SELECT slug, title, updated_at FROM stories ORDER BY updated_at DESC LIMIT 5;"

# Check DB size
ls -lh /Users/nguyenhat/HAgent/data/hagent.db
```

## Common Pitfalls

### DB Path Confusion ❌
- **WRONG**: `/Users/nguyenhat/HAgent/backend/data/hagent.db`
- **CORRECT**: `/Users/nguyenhat/HAgent/data/hagent.db`

### Wrong Crawl Source ❌
- **sitruyencv.com** → actual working source ✅
- **truyencv.io** → mentioned in old docs, incorrect ❌

### Frontend Not Loading (Data Exists)
1. Backend running? `lsof -i :8010 | grep LISTEN`
2. DB has data? `sqlite3 <DB> "SELECT COUNT(*) FROM stories;"`
3. F5 browser to load new bundle

### Slow Initial Crawl
First call after server restart/cache clear takes ~8-15s. Subsequent calls are fast from cache.

## Checklist Before Reporting Empty Tab

- [ ] Backend running (port 8010)
- [ ] DB path correct (`/Users/nguyenhat/HAgent/data/hagent.db`)
- [ ] Stories table has records
- [ ] Recent API call returns data: `curl http://localhost:8010/api/truyencv/recent`
- [ ] Browser hard refresh (F5) to load new bundle

## References
- Service: `backend/api/services/truyencv_store.py`
- Router: `backend/api/routers/truyencv.py`
- DB service: `backend/api/services/db.py` (DB_PATH constant)
- Also see: [`tin-tuc`](../hagent/tin-tuc) for VnExpress news documentation
