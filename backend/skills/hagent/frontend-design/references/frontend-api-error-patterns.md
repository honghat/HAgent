# Frontend API Error Handling Patterns

## Overview

This document captures **frontend API error handling patterns** learned from production usage. These patterns ensure graceful, user-friendly data loading experiences.

---

## HTTP Status Mapping Pattern

### Problem

Generic HTTP errors (502, 503, 404) confuse users who don't understand what they mean or how to proceed.

### Solution

Map status codes to actionable messages:

```jsx
const r = await fetch(`${BASE}${endpoint}`)
if (!r.ok) {
  let msg = "Không thể tải dữ liệu"
  
  // Map HTTP status to user-friendly messages
  if (r.status === 404) {
    msg = "Chưa có truyện nào trong kho. Hãy bật chế độ 'Cập nhật' hoặc đợi cron crawl tự động."
  } else if (r.status === 503) {
    msg = "Nguồn crawl đang tạm dừng. Thử lại sau vài phút."
  } else if (r.status === 502 || r.status === 500) {
    msg = "Server error. Thử lại sau vài phút."
  }
  
  throw new Error(msg)
}
```

### Status Code Meanings

| Status | Meaning | User Message | Action |
|--------|---------|--------------|--------|
| **404** | Not Found (DB empty) | "Chưa có truyện nào..." | Wait for crawl / browse mode |
| **503** | Service Unavailable | "Nguồn crawl đang tạm dừng" | Retry in few minutes |
| **502/500** | Server Error | "Server error" | Retry later |

### When to Use Each

- **404**: Data source exists but has no records (cron not run, DB empty)
- **503**: Upstream service temporarily unavailable  
- **502/500**: Backend crashed or timeout

---

## Empty State vs Error State

### Critical Distinction

**Empty state ≠ Error state!** These are fundamentally different UX patterns:

| State | HTTP Status | Cause | UI Pattern | Color Theme |
|-------|-------------|-------|------------|-------------|
| **Error** | 5xx, network error | Backend crashed / timeout / bad gateway | Red alert card + reload button | `bg-red-50`, `text-red-700` |
| **Empty (with cause)** | 200 OK | DB empty but API returned success | Amber/info card explaining "why" + hint | `bg-amber-50/30`, `text-amber-800` |
| **Empty (no data yet)** | 200 OK | First load, no crawl history yet | Friendly message | `bg-blue-50` or `bg-amber-50/30` |
| **Loading** | N/A | Fetch in progress | Skeleton spinners | Gray animations |

### Example: StoryBrowser Empty States

```jsx
// ✅ ERROR (red) - API failed
{error && (
  <div className="rounded-xl border border-red-100 bg-red-50 p-4">
    <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
    <p className="text-xs font-bold text-red-700">Lỗi tải dữ liệu</p>
    <p>{error}</p>
    <button onClick={() => loadStories(page)}>Thử tải lại</button>
  </div>
)}

// ✅ EMPTY (amber) - DB rỗng, API OK  
{!loading && stories.length === 0 && !error && (
  <div className="rounded-xl border border-amber-100 bg-amber-50/30 p-6 text-center">
    <BookOpen className="h-8 w-8 text-amber-500 mx-auto mb-2" />
    <p className="text-sm font-semibold text-amber-800">Kho truyện đang trống</p>
    <p className="text-[10px] text-amber-600/80 mt-1">
      Chưa có truyện nào trong database. Hãy bật chế độ "Cập nhật" 
      hoặc đợi hệ thống tự động crawl.
    </p>
  </div>
)}

// ✅ DATA (normal) - Có truyện rồi
{stories.length > 0 && (
  <ul className="space-y-3">{stories.map(s => <li>{s}</li>)}</ul>
)}
```

---

## Conditional Rendering Checklist

### When rendering lists from API results, check in this order:

```jsx
if (loading) {
  return <SkeletonLoaders />
} else if (error) {
  return <ErrorAlert message={error.message} onRetry={retry} />
} else if (data.length === 0) {
  return <EmptyState reason={getReason(data.source)} />
} else {
  return <DataList items={data} />
}
```

### Decision Flow

```
         ┌─────────────────┐
         │    Fetch API    │
         └──────┬──────────┘
                │
         ┌──────▼───────┐
         │ Is loading?  │ ← Skeletons
         └──────┬───────┘
                │ NO
         ┌──────▼───────┐
         │ Has error?   │ ← Red error card
         └──────┬───────┘
                │ NO
         ┌──────▼───────┐
         │ Empty list?  │ ← Amber info card
         └──────┬───────┘
                │ NO
         ┌──────▼───────┐
         │ Render data  │ ← List!
         └────────────────┘
```

---

## Best Practices

### ✅ DO

- Map HTTP status to user-friendly messages (never show "502 Bad Gateway")
- Handle empty state as informational, not error
- Provide clear action hints (retry, wait for crawl, etc.)
- Use color semantics: red = problem, amber = info, blue = neutral

### ❌ DON'T

- Show raw HTTP status codes to users
- Treat "no data" as an error condition
- Hide empty states with loading spinners forever
- Use the same UI for errors and empty states

---

## Related Files

- `frontend-design/SKILL.md` - Main skill documentation
- StoryBrowser component example: `/frontend/src/components/StoryBrowser.jsx`
