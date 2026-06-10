# Inline Detail / Description Panel Pattern

> Pattern for showing detail info (description, author, genres, metadata) when user clicks a list item — **without navigating away or opening a modal/reader**. All happens inline in the same component.

## Trigger

A story/card/entity browser where clicking an item should reveal its **description** and **metadata** (author, genres, status, chapter count) fetched from a detail API endpoint, rather than navigating to a separate detail page or reader view.

## Component Flow

```
[Story List]  ──click──>  [Inline Detail Panel]
                                ▲
                                │ ← Quay lại
                                ▼
[Story List]  (re-shown)
```

### State Structure

```jsx
const [selectedStory, setSelectedStory] = useState(null) // null = list view
const [detailLoading, setDetailLoading] = useState(false)
```

### Click Handler

```jsx
async function handleSelectStory(s) {
  setSelectedStory(s)         // immediately show "loading" state
  setDetailLoading(true)
  try {
    const data = await apiGet(`/api/truyencv/story/${s.slug}`)
    setSelectedStory(data)    // replace placeholder with full detail
  } catch (e) {
    setSelectedStory({ ...s, error: e.message })
  } finally {
    setDetailLoading(false)
  }
}

function backToList() {
  setSelectedStory(null)
}
```

### Render Condition

```jsx
{/* Detail panel - replaces list */}
{selectedStory && (
  <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 animate-fade-in">
    <div className="flex items-start gap-3">
      <button onClick={backToList} className="...">← Quay lại</button>
      <div className="flex-1 min-w-0">
        {detailLoading ? (
          <p className="text-xs text-gray-500">Đang tải...</p>
        ) : selectedStory.error ? (
          <p className="text-xs text-red-600">Lỗi: {selectedStory.error}</p>
        ) : (
          <>
            {/* Title, Author, Genres, Status, Description */}
          </>
        )}
      </div>
    </div>
  </div>
)}

{/* Story list - hidden when detail is shown */}
{!selectedStory && readingHistory && ...}
{!selectedStory && storyList && ...}
```

## Key Design Decisions

1. **Single component, no new file** — detail panel is rendered inside the same StoryBrowser component, not a new page/modal/sidebar. Avoids navigation complexity.

2. **Fake-it-till-you-make-it** — `setSelectedStory(s)` fires immediately with the story summary object (title, slug, cover_url), so the UI feels instant. Then `setSelectedStory(data)` replaces it with the full detail once the API responds.

3. **Back button hides panel, not resets state** — `backToList()` only clears `selectedStory`, keeping the existing story list and search state intact. User returns to exactly where they were.

4. **Loading state is minimal text** — no skeleton/spinner, just a text line "Đang tải mô tả truyện...". Matches the minimal aesthetic.

5. **Styling cues** — amber tones (`bg-amber-50/30`, `border-amber-200`) to visually distinguish the detail panel from the regular list cards.

## API Pattern

The detail API returns a `StoryDetailResponse` with `description`, `author`, `genres`, `status`, `chapters[]`. Frontend renders the first N fields (description most important), and could later expand to show chapters or TTS controls.

## Pitfalls

- **Double `onClick`**: If the story cards have both `onClick` and a `button` with `stopPropagation`, make sure the outer `onClick` doesn't fire when the delete/action button is clicked. The `stopPropagation` on the button handles this — but if the button is conditionally rendered inside the card, the condition must evaluate to true before the card's `onClick` fires on the button.

- **Incomplete initial data**: The placeholder object passed to `setSelectedStory(s)` only has `{slug, title, cover_url, tags, last_chapter}` — fields from the list API. The detail API adds `author`, `description`, `genres`, `status`, `chapters[]`. If you render `selectedStory.description` before the detail API returns, it will be `undefined`. Always use `detailLoading` to guard the detail fields.

- **Nested parentheses in JSX**: When wrapping a large block (like the entire story list + load more) inside `{!selectedStory && (`, ensure the opening paren is on the same line as `{!selectedStory && (` and the closing `)}` is after the last closing `</div>`. Do NOT have:
  ```
  </div>
  
  {/* Separate element */}
  <LoadMore />
  )}   ←   BAD: closing paren is here, separated from the opening <div>
  ```
  Instead, move everything inside the one wrapping `<div>`.

## Before/After

**Before**: `onSelectStory(s)` was `() => {}` (no-op). Clicking a story card did nothing in the EarningHub tab.

**After**: Clicking a story card fetches the detail via `/api/truyencv/story/{slug}`, renders title, author, genre tags, status, and description in a warm-toned panel. Button "← Quay lại" returns to the story list.

---

*Part of the frontend-design skill. See also `responsive-data-dashboard.md` for list layout patterns.*
