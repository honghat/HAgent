---
name: agent-chat-ui
description: "UI patterns for agent/LLM chat interfaces: typing indicators, streaming text, thinking states, step-by-step progress, and message rendering for production chat UIs."
tags: [chat, streaming, typing-indicator, react, ui-patterns, llm-ui]
related_skills: [frontend-design, test-driven-development]
---

# Agent Chat UI Patterns

> Reusable UI patterns for building production-grade chat interfaces for LLM agents.

## Overview

This skill covers the key UI interaction patterns needed when building a chat interface that communicates with an AI agent. The patterns are framework-agnostic but examples use React/JSX for a codebase like HAgent's frontend.

---

## Core States

An agent chat UI needs to handle these states during a conversation turn:

| State | When | What to show |
|-------|------|-------------|
| **Idle** | No active request | Input field + send button |
| **Thinking** | `loading=true, streamingText=""` | Typing indicator (3 dots animation + "Đang suy nghĩ…") |
| **Streaming** | `loading=true, streamingText!=""` | Live text being rendered + blinking cursor |
| **Steps** | Agent executing multi-step tasks | Expandable step tracker with done/running status |
| **Done** | `loading=false` | Final rendered message with actions |

---

## Pattern: Compact Spacing

When a chat UI has excessive whitespace — gaps between messages that feel too wide, card padding that wastes vertical space, action icons floating far from their message, or progress bars stretching endlessly — apply these compact spacing values.

### Target zones and recommended Tailwind values

| Zone | Overly spacious | Compact (recommended) |
|------|----------------|----------------------|
| **Between messages** (container) | `space-y-5 sm:space-y-8` | `space-y-3 sm:space-y-5` |
| **Container max-width** | `max-w-6xl` | `max-w-5xl` |
| **Message card padding** (mobile) | `px-4 sm:px-6 py-3 sm:py-4` | `px-3 sm:px-4 py-2 sm:py-3` |
| **Action toolbar gap** | `gap-2.5 mt-1.5 px-3` | `gap-1.5 mt-1 px-2` |
| **Progress bar & typing indicator max-width** | `max-w-[92vw] sm:max-w-[96%]` | `max-w-[75vw] sm:max-w-[85%]` |
| **Header padding** | `min-h-14 px-3 py-2 sm:h-16 sm:px-8` | `min-h-12 px-2 py-1 sm:h-14 sm:px-5` |

### How to apply

Search for these exact Tailwind class combinations in the chat component and reduce them:

1. **Container spacer** — look for `space-y-5 sm:space-y-8` on the message list wrapper
2. **Card bubble** — look for `px-4 sm:px-6 py-3 sm:py-4` on assistant/user message divs
3. **Action icons row** — look for `mt-1.5 gap-2.5 px-3` below each message
4. **Loading/progress bubbles** — look for `max-w-[92vw] sm:max-w-[96%]` on typing indicator + streaming container
5. **Header** — look for `min-h-14 sm:h-16` on the chat header

### When to apply

- User reports "spacing is too wide", "cards are too padded", "action buttons float away from text"
- After adding a new chat sub-component that introduces a new container gap
- On mobile-first responsive reviews where elements consume too much vertical real-estate

### Verification

After patching, verify with:
- `npm run build` (no build errors)
- Manual visual check: message stacks should have ~12-16px gap (desktop) / ~8-12px (mobile)
- Action icons should visually group with their parent message, not float between conversations

### Pitfalls

1. **Don't overshrink**: `max-w-[75vw]` works for content-heavy bubbles, but if assistant messages contain wide tables or code blocks, they may wrap awkwardly. Consider `max-w-[85%] sm:max-w-[90%]` as a lighter reduction.
2. **Header height**: Reducing `min-h-14` → `min-h-12` saves 8px but may clip content if the header has multi-line selects or dropdowns — test on narrow windows.
3. **Mobile vs desktop**: Compact values on mobile (`px-3 py-2`) should still leave enough touch target (44px min for buttons). Action icon buttons at `h-8 w-8` on mobile are fine; `h-5 w-5` on desktop is tight but okay for secondary actions.

---

## Pattern: Typing Indicator (Pre-Stream)

When the agent is loading but hasn't started sending text yet, show a typing indicator bubble.

### Condition

```jsx
{loading && !streamingText && (
  <TypingIndicator />
)}
```

### CSS (3-dot flashing animation)

```css
.dot-flashing {
  position: relative;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #4b5563;
  color: #4b5563;
  animation: dot-flashing 1s infinite linear alternate;
  animation-delay: 0.5s;
  display: inline-block;
  margin: 0 12px;
}
.dot-flashing::before, .dot-flashing::after {
  content: "";
  display: inline-block;
  position: absolute;
  top: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #4b5563;
  color: #4b5563;
}
.dot-flashing::before {
  left: -12px;
  animation: dot-flashing 1s infinite alternate;
  animation-delay: 0s;
}
.dot-flashing::after {
  left: 12px;
  animation: dot-flashing 1s infinite alternate;
  animation-delay: 1s;
}

@keyframes dot-flashing {
  0% {
    background-color: #4b5563;
  }
  50%, 100% {
    background-color: rgba(75, 85, 99, 0.25);
  }
}
```

### JSX Component (compact version)

```jsx
{loading && !streamingText && (
  <div className="flex w-full min-w-0 justify-start animate-fade-in">
    <div className="min-w-0 max-w-[75vw] sm:max-w-[85%] bg-white border border-black/[0.06] rounded-[1.8rem] rounded-bl-sm px-4 sm:px-5 py-3 sm:py-3.5 shadow-sm flex items-center gap-3">
      <div className="dot-flashing" />
      <span className="text-[13px] text-gray-400 font-medium">Đang suy nghĩ…</span>
    </div>
  </div>
)}
```

> **Note**: The original code used `max-w-[92vw] sm:max-w-[96%]` and `px-4 sm:px-6 py-4` which creates overly wide bubbles. See [Compact Spacing](#pattern-compact-spacing) for rationale.

---

## Pattern: Streaming Text (Active Generation)

When the agent is actively sending response text character by character.

### Condition

```jsx
{loading && streamingText && (
  <StreamingBubble text={streamingText} />
)}
```

### JSX Component (compact version)

```jsx
{loading && streamingText && (
  <div className="flex w-full min-w-0 justify-start animate-fade-in">
    <div className="min-w-0 max-w-[75vw] sm:max-w-[85%] bg-white border border-black/[0.06] rounded-[1.8rem] rounded-bl-sm px-4 sm:px-5 py-3 sm:py-3.5 text-[14.5px] leading-relaxed shadow-sm overflow-hidden [overflow-wrap:anywhere]">
      <MarkdownContent content={streamingText} role="assistant" />
      <span className="inline-block w-1.5 h-4 bg-gray-300 animate-pulse ml-1 align-middle" />
    </div>
  </div>
)}
```

> **Note**: The original code used `max-w-[92vw] sm:max-w-[96%]` and `px-4 sm:px-6 py-4`. The compact values produce a more balanced visual weight when the chat also has sidebar, header, and composer components.

- The blinking cursor (`.animate-pulse`) signals ongoing generation.
- Use `[overflow-wrap:anywhere]` to prevent long unbroken tokens from breaking layout.
- The `animate-fade-in` on the container provides smooth appearance.

### Anti-Pattern: Per-Chunk setState (Causes Jank)

The **naive approach** — calling `setStreamingText(collected)` on every SSE chunk — causes React re-render on every received packet. When the backend emits small chunks (1-3 chars each) at network speed, the resulting re-render storm often exceeds 200+ updates/second, causing visible jank, especially when the streaming bubble renders an expensive `<MarkdownContent>` component that re-parses markdown on each frame.

```js
// ❌ Bad: triggers React re-render on every tiny chunk
case 'content':
  collected += data.content || ''
  setStreamingText(collected)  // ← called 100+ times/sec
  break
```

### Fix: requestAnimationFrame Throttling

Instead of calling `setStreamingText` directly in the SSE loop, write to a `useRef` (no re-render) and schedule a single `requestAnimationFrame` callback. This caps React re-renders at 60fps regardless of chunk rate.

**Hook pattern:**

```jsx
const _streamingLatestRef = useRef('')
const _rafRef = useRef(null)

const _scheduleStreamingUpdate = () => {
  if (_rafRef.current) return // already scheduled for this frame
  _rafRef.current = requestAnimationFrame(() => {
    _rafRef.current = null
    streamingTextRef.current = _streamingLatestRef.current  // sync ref
    setStreamingText(_streamingLatestRef.current)            // sync state
  })
}
```

**Usage in SSE handler:**

```js
// ✅ Good: only causes React re-render once per frame (~16ms)
case 'content':
  _streamingLatestRef.current += data.content || ''
  _scheduleStreamingUpdate()
  break
```

### Edge Cases When Using rAF

1. **`case 'done'` must read from `_streamingLatestRef.current`**, not a local `collected` variable. The local variable no longer exists because content accumulates in the ref.
2. **Cancel the pending rAF** when the stream ends (done/error) to prevent a stale frame from firing after state is already final:

   ```js
   if (_rafRef.current) {
     cancelAnimationFrame(_rafRef.current)
     _rafRef.current = null
   }
   ```

3. **Reset `_streamingLatestRef.current = ''`** at stream end so the next session starts clean.
4. **Keep `streamingTextRef` in sync** — the rAF callback updates both. Any downstream code that reads `streamingTextRef.current` (e.g. persistence debounce) must be called *after* `_scheduleStreamingUpdate` completes (inside a useEffect or the rAF itself).

### Benchmark

| Approach | Re-renders for 10K chars (streamed typ.) | Jank visible? |
|----------|------------------------------------------|---------------|
| Naive `setState` per chunk | 200-500+ (one per chunk) | ✅ Yes |
| `requestAnimationFrame` throttle | ~60 (one per frame) | ❌ No |

### Beyond rAF: Secondary Bottlenecks (Production Tuning)

Even with rAF throttling, a production chat UI can still feel laggy during streaming. These are the **next-tier causes** to check when a user reports "giật" (jank) despite having rAF in place:

#### 1. localStorage Persist Frequency

Writing to `localStorage` is **synchronous and blocking** (DOM storage write can take 5-20ms). If a `useEffect` persists chat state on every `streamingText` change, and rAF fires 60 times/sec, that's 60 blocking writes per second — competing directly with the React render cycle.

**Bad:**
```js
useEffect(() => {
  localStorage.setItem(PERSIST_KEY, JSON.stringify({ ...streamingText, ... }))
}, [streamingText]) // ← fires on every rAF tick
```

**Fix — debounce to 500ms:**
```js
const persistTimerRef = useRef(null)
useEffect(() => {
  if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
  persistTimerRef.current = setTimeout(() => {
    localStorage.setItem(PERSIST_KEY, JSON.stringify({ ... }))
  }, 500) // ← only writes once per 500ms during streaming
  return () => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
  }
}, [activeId, messages, streamingText, loading, steps, fileChanges])
```

#### 2. Expensive Child Components

If the streaming bubble renders `<MarkdownContent>` (which wraps `<ReactMarkdown>` with remarkGfm), **every rAF tick triggers a full markdown re-parse**. `ReactMarkdown` is CPU-heavy even with React.memo, because a new string reference always breaks shallow comparison.

**Compounding effect:** rAF + localStorage debounce fixes the network/render jank, but if the child component takes 10-20ms to re-parse markdown, the browser still drops frames.

**Fix options (in order of effectiveness):**
- **(Recommended)** Reduce rAF frequency: instead of 60fps, throttle to every 4th frame (~15fps). The human eye cannot perceive the difference on streaming text that's already accumulating character by character, but React re-renders drop from 60→15 per second.
  
  ```js
  const _streamingFrameCountRef = useRef(0)
  const _streamingScheduleUpdate = () => {
    _streamingFrameCountRef.current++
    if (_streamingFrameCountRef.current % 4 !== 0) return // ← 15fps cap
    const val = _streamingLatestRef.current
    streamingTextRef.current = val
    setStreamingText(val)
  }
  ```

- Move `<MarkdownContent>` to a `useMemo` with deep string comparison (length-based or `endsWith`-based).
- Debounce the markdown render separately from the state update (e.g., only re-render MarkdownContent every 100ms with a separate timer).

#### 3. Propagating Effects

Every `streamingText` change also triggers:
- `streamingTextRef.current = streamingText` effect
- Multi-state persist effect (if not debounced)
- Downstream component re-renders (parent is the Chat component, which re-renders EVERYTHING)

**Fix:** The `streamingTextRef` sync can be moved directly into the rAF callback (already done in the throttle pattern), eliminating one effect entirely.

#### 4. Diagnostic Checklist

When a user reports streaming jank:

1. ✅ Is rAF throttling in place? → If no, add it first.
2. ✅ Is localStorage persist debounced? → If still janky, add 500ms debounce.
3. ✅ Is streamingText throttled below 60fps? → Apply every-Nth-frame reduction.
4. ✅ Is the streaming bubble loading an expensive child (markdown parser, syntax highlighter)? → Apply secondary debounce or memoization.
5. ✅ Are there unnecessary effects on `streamingText`? → Merge into rAF callback.

### Pitfalls — Advanced Throttling

1. **Frame counter reset**: The `_streamingFrameCountRef` is never reset. On long streams, it grows unbounded (but since it's a `useRef`, this is just a big number — no memory issue). If you need predictable cadence, use `Date.now()` with a minimum interval:

   ```js
   const _lastUpdateRef = useRef(0)
   const _streamingScheduleUpdate = () => {
     const now = Date.now()
     if (now - _lastUpdateRef.current < 66) return // ~15fps
     _lastUpdateRef.current = now
     setStreamingText(_streamingLatestRef.current)
   }
   ```

   However, the count-based approach is simpler and avoids `Date.now()` overhead on hot paths.

2. **`case 'done'` must flush immediately**: When the stream ends, you MUST synchronously set `streamingText` to the final value before clearing it. The `_streamingFlush()` helper handles this:

   ```js
   const _streamingFlush = () => {
     const val = _streamingLatestRef.current
     streamingTextRef.current = val
     setStreamingText(val)
   }
   ```

   Called in `case 'done'` and `case 'error'` to ensure the final chunk is always visible, even if it falls between throttled frames.

3. **Throttle ≠ debounce for streaming**: A debounce (e.g., 100ms `setTimeout`) would introduce visible input lag — the cursor appears to stop and then text jumps. Throttle with rAF (or every-Nth-frame) is smoother because it preserves the framerate cadence.

4. **Verify with build**: After any streaming performance change, run `pnpm build` (or `npm run build`) and force-reload (F5 + hard refresh) in browser — Vite's dev mode can mask performance issues that only appear in production bundles.

---

## Pattern: Inline Diff View (GitHub-style)

When a `file_change` journal entry carries `patches` data (array of `{filename, diff}` objects from the `patch` tool), the file row becomes clickable and reveals a syntax-highlighted diff view.

### Condition

Each file in the FileChanges section shows its patches only when:
- `fc.patches` is a non-empty array
- User clicks the file row to toggle the diff

### Data Flow

Backend (`messages.py` `_emit_file_change`):
- For `patch` tool calls, `data.get("diff", "")` + `data.get("patches", [])` are extracted
- Both are included in the WS `file_change` event AND the journal entry
- `patches` is an array of `{filename, diff}` objects from the patch tool's result

Frontend (`Chat.jsx` `parseJournal`):
- Parsed from `entry.content` JSON: `{..., patches: parsed.patches || []}`
- Passed into `fileChanges` state → `StepsTimeline` component

### JSX Implementation (StepsTimeline.jsx)

```jsx
// Each file row becomes a button when patches exist
{hasPatches && (
  <svg
    width="10" height="10" viewBox="0 0 24 24" fill="none" ...
    className={`shrink-0 text-gray-300 transition-transform ${isDiffOpen ? 'rotate-180' : ''}`}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
)}

// Diff view rendered below the file row when expanded
{isDiffOpen && fc.patches && fc.patches.length > 0 && (
  <div className="ml-5 mt-1 mb-1.5 bg-gray-900 rounded-md overflow-hidden">
    {fc.patches.map((p, pi) => (
      <div key={pi}>
        {p.filename && (
          <div className="px-3 py-1 text-[10px] text-gray-400 font-mono bg-gray-800/60">
            {p.filename}
          </div>
        )}
        <pre className="text-[11px] leading-[1.4] font-mono overflow-x-auto p-2 m-0">
          {p.diff?.split('\n').map((line, li) => {
            let lineClass = 'text-gray-300'
            let prefix = ' '
            if (line.startsWith('+')) {
              lineClass = 'text-green-400 bg-green-500/10'
              prefix = '+'
            } else if (line.startsWith('-')) {
              lineClass = 'text-red-400 bg-red-500/10'
              prefix = '-'
            } else if (line.startsWith('@@')) {
              lineClass = 'text-purple-400 bg-purple-500/10'
              prefix = ''
            } else if (line.startsWith('diff --git') || line.startsWith('---') || line.startsWith('+++')) {
              lineClass = 'text-gray-500'
              prefix = ''
            }
            return (
              <div key={li} className={`${lineClass} px-2 whitespace-pre`}>
                {prefix}{line}
              </div>
            )
          })}
        </pre>
      </div>
    ))}
  </div>
)}
```

### Color Scheme (dark terminal)

| Line type | Background | Text color | Prefix |
|-----------|-----------|------------|--------|
| Added (`+`) | `bg-green-500/10` | `text-green-400` | `+` |
| Removed (`-`) | `bg-red-500/10` | `text-red-400` | `-` |
| Hunk header (`@@`) | `bg-purple-500/10` | `text-purple-400` | (none) |
| Meta lines (diff --git, ---, +++) | none | `text-gray-500` | (none) |
| Context | none | `text-gray-300` | space |

### Container

- Wrapped in `<div className="bg-gray-900 rounded-md">` for a code-editor dark feel
- Monospace `font-mono` at `text-[11px]` for compactness
- `overflow-x-auto` for long lines
- Each patch file gets a header bar (`bg-gray-800/60`) showing the filename
- Indented `ml-5` to visually nest under the file row

### Pitfalls

1. **State per file**: Use `diffExpanded` state object keyed by file index (`useState({})`), not a single boolean — otherwise clicking one file expands all.
2. **Only for `patch` tool**: `write_file` currently has no `patches` data — the diff view won't show for write-only operations. This is acceptable; patch tool inherently produces diffs.
3. **Empty diff**: Guard with `fc.patches && fc.patches.length > 0` to avoid rendering an empty container.
4. **Clickable row**: The entire file row becomes clickable when `hasPatches` is true — use `cursor-pointer` and `hover:bg-white/60 rounded` on the button to signal interactivity.
5. **Nested toggles**: FileChanges uses `fcExpanded` (show more files) separate from `diffExpanded` (show diff per file) — two independent state variables.

---

## Pattern: Tool Display Label Mapping (`toolMeta`)

The `Chat.jsx` component has a central `toolMeta()` function (around line 226) that maps each tool name to a display tuple: `{icon, title, source, preview}`. This controls how tool calls are rendered in the steps timeline and in progress messages.

### Function Signature

```js
const toolMeta = (name, label) => {
  const toolName = String(name || '')         // e.g. "read_file", "web_search"
  const raw = String(label || name || '')      // e.g. "backend/src/main.py" (contains primary arg)
    .replace(/\s·\sSearXNG local/g, '').trim()
  const fallback = compactText(raw || toolName)
  // ... tool-specific cases ...
  return { icon: '🛠️', title: fallback, source: toolName, preview: '' }  // fallback
}
```

### How It Works

- `name` — the registered tool name from backend (e.g. `"read_file"`, `"web_search"`)
- `label` — the primary argument extracted by backend `display.py`. For `read_file`/`write_file`/`patch`, this is the `path` parameter value (the file path)
- The returned `{icon, title, source, preview}` is consumed by:
  - `displayToolLabel()` → joins `title · source`
  - `formatToolProgress()` → formats `icon **title** · source · state`
  - `parseJournal()` → builds step entries from journal events

### Adding a New Tool Case

When adding a new tool to the display, add a case block before the fallback return:

```js
if (toolName === 'my_tool' || toolName === 'my_alias') {
  return { icon: '🔧', title: 'My Tool Label', source: compactText(raw, 86) || toolName, preview: '' }
}
```

Components of the return value:

| Field | Usage | When to use |
|-------|-------|-------------|
| `icon` | Emoji prefix | Always — choose a distinctive emoji per tool category |
| `title` | Human-readable name | Shown in timeline header + progress message |
| `source` | Subtitle or context | Shows the tool's primary param (query, path, URL) or tool name fallback |
| `preview` | Extra detail line | optional — shown below header in progress messages |

### Current Tool Cases

| Tool name(s) | Icon | Title | Source |
|-------------|------|-------|--------|
| `get_weather` | 🌤 | Thời tiết | `'Open-Meteo'` (static) |
| `web_search` | 🔎 | Tìm web | `'SearXNG local'` (static) |
| `web_extract` | 📄 | Đọc trang | label (URL) |
| `browser_navigate` | 🌐 | Mở trình duyệt | label (URL) |
| `job_hunter_*`, `cv_generate_docx` | 💼 | Săn việc | raw tool name |
| `read_file`, `read` | 📖 | Đọc file | label (file path) |
| `write_file`, `write_to_file` | ✍️ | Ghi file | label (file path) |
| `patch` | 🔧 | Sửa file | label (file path) |
| fallback | 🛠️ | compactText(label) | tool name |

### Registering New Aliases in Backend

Backend `file_tools.py` registers the canonical names:

```python
registry.register(name="read_file", toolset="file", schema=READ_FILE_SCHEMA, ...)
registry.register(name="write_file", toolset="file", schema=WRITE_FILE_SCHEMA, ...)
# Aliases:
registry.register(name="read", toolset="file", ...)
registry.register(name="write_to_file", toolset="file", ...)
```

When adding a new frontend case, verify both the canonical name AND any aliases are covered.

### How Backend Populates the Label

Backend `display.py` line 180-191 defines `primary_args` — which tool argument becomes the label:

```python
primary_args = {
    "read_file": "path", "write_file": "path", "patch": "path",
    "web_search": "query", "web_extract": "urls",
    "browser_navigate": "url",
    # ...
}
```

- The label passed to `toolMeta()` as the second arg is this primary argument value
- For file tools: it's the `path` parameter (e.g. `"frontend/src/components/Chat.jsx"`)
- The label is already compacted/truncated by backend to fit preview length

### When to Add a Case

- Any tool that should show a **friendly Vietnamese label** instead of raw English tool name
- Any tool where the **label content** (path, URL, query) is more useful than the tool name
- Tools that **lack** a primary_args entry in backend display.py — their label may be empty, so fallback behavior may be preferred

### Pitfalls

1. **Alias coverage**: When adding `read_file`, also add `read` (if registered). When adding `write_file`, also add `write_to_file`. Missed aliases fall through to the generic fallback.
2. **Static vs dynamic source**: For tools like `web_search` and `get_weather`, `source` is hardcoded because the label (query/city) is more useful in `preview`. For file tools, the label IS the path — put it in `source` not `preview`.
3. **Label stripping**: The `.replace(/\s·\sSearXNG local/g, '')` removes the " · SearXNG local" suffix from search labels. If your tool's label contains this pattern, it will be stripped — consider a more specific replacement.
4. **Fallback visibility**: Any tool without an explicit case shows as `🛠️ toolName · toolName`, which hides the actual contents. Always add cases for tools the user interacts with.

---

## Pattern: Step-by-step Progress Tracker

When the agent performs multi-step tasks (tool calls, research steps, etc.). The tracker shows:
- A **collapsible header** — always visible, shows step count + loading state
- **Tool timeline** with status indicators (done/running/pending) and vertical connectors
- **File changes section** — nested collapsible inside, shows git-style diff stats

### Container Component

Extract the timeline into its own component (e.g. `StepsTimeline.jsx`) to keep the main chat component clean. The component receives `steps`, `fileChanges`, and `isLoading` as props.

### Pattern: Collapsible Design

Use React `useState` (not `<details>`) for toggling, to allow nested collapsible sections:

```jsx
const [expanded, setExpanded] = useState(false)

return (
  <div className="...">
    <button type="button" onClick={() => setExpanded(e => !e)}>
      {/* Header: status icon + step count + chevron */}
      <Chevron className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
    </button>

    {expanded && (
      <>
        {/* Tool timeline with vertical connectors */}
        {steps.map(...)}

        {/* File changes (also collapsible) */}
        <FileChanges fileChanges={fileChanges} />
      </>
    )}
  </div>
)
```

### Header (always visible, clickable)

```
[⠿/✓] Hoàn thành · 4/4 bước   ▼
```

- Loading: animated ping dot + "Đang xử lý" label
- Done: green checkmark + "Hoàn thành · N/M bước"
- Click anywhere on header to expand/collapse
- Chevron rotates 180° when expanded

### Tool Timeline (expanded content)

Each step row:
```
  ✓  🔎 Tìm web · SearXNG local
  ✓  📄 Đọc trang · web_extract
  ●  🌐 Mở trình duyệt · browser
```

- Vertical connector line between steps (absolute positioned, `left-[9px]`)
- Status icon column (left, 18×18px):
  - `done` → green circle with checkmark SVG (`bg-emerald-100 text-emerald-600`)
  - `running` → gray circle with pulse dot (`bg-gray-200 text-gray-600`)
  - `pending` → outlined empty circle (`border-2 border-gray-200 bg-white`)
- Tool name + source label, truncated with `min-w-0 flex-1 truncate`
- Running step gets `font-semibold text-gray-800`
- Done step gets `text-gray-500`
- Count badges: `(3)` in lighter gray for tools that processed multiple results

### File Changes Section (nested collapsible)

Shown only when `fileChanges.length > 0`. Also collapsible — shows first 3 files by default:

```
Thay đổi file  3 files  [+2] ▼

  📄 Chat.jsx           +12  -5  ████░
  📄 types.ts            +3  -1  ██░░░

3 files changed  +15  -6
```

- Header: "Thay đổi file" + file count + "+N more" if truncated
- Each row: file icon + path (dir in gray, filename in bold) + +/- counts + bar blocks
- Bar blocks: up to 5 blocks, proportional green/red ratio
- Collapse/expand toggle on the header
- Summary footer: total files changed + total +/- lines

### Condition

```jsx
{steps.length > 0 && (
  <StepsTimeline steps={steps} fileChanges={fileChanges} isLoading={loading} />
)}
```

Calls are in two places (both in chat main render):
1. **In-message journals** — after each assistant message with `m.journal` data
2. **Live loading** — shown below messages while `loading=true` and `steps.length > 0`

```jsx
// Per-message journal timeline
{m.role === 'assistant' && m.journal && m.journal.length > 0 && (
  <StepsTimeline steps={parseJournal(m.journal).steps} fileChanges={parseJournal(m.journal).fileChanges} isLoading={false} />
)}

// Live loading timeline
{loading && steps.length > 0 && (
  <StepsTimeline steps={steps} fileChanges={fileChanges} isLoading={true} />
)}
```

### Data Flow

Steps arrive as SSE events during streaming:
- `data: {"type":"tool","name":"web_search","status":"start","label":"🔎 Tìm web · SearXNG local"}`
- `data: {"type":"tool","name":"web_search","status":"done","label":"...","count":3}`
- `data: {"type":"file_change","path":"src/Chat.jsx","added":12,"removed":5}`
- On `type: "done"`, steps + fileChanges are bundled into the message's `journal` array for persistence

Key points:
- Use `useState` + chevron toggle for expand/collapse — richer control than `<details>`.
- Steps are **always collapsed by default** (`expanded: false`) so the UI stays compact. User clicks to expand when they want to inspect progress.
- File changes section **inside** the timeline is also collapsed by default, showing only a preview (first 3 files).
- Vertical connector lines between step items create a visual timeline.
- The component is stateless (receives data as props) so it works for both live streaming and replayed journal data.

---

## Pattern: Render Order (Priority)

When all three are present, order them top-to-bottom:

1. **Steps tracker** — shows what the agent is doing
2. **Typing indicator** — shows agent is thinking (before stream)
3. **Streaming text** — shows live response (after stream starts)
4. **Sent/received messages** — final rendered messages

---

## Pitfalls

1. **Don't overlay**: Typing indicator and streaming text should never appear simultaneously. Use exclusive conditions (`loading && !streamingText` vs `loading && streamingText`).
2. **Animation timing**: The `dot-flashing` animation delays (0s, 0.5s, 1s) create a cascading wave effect. Adjust if dots look synchronous.
3. **Text overflow**: Always use `[overflow-wrap:anywhere]` on streaming text to prevent layout breaks from long model outputs.
4. **Fade-in**: Use `animate-fade-in` to avoid jarring appearance when indicators pop in during state transitions.
5. **Mobile**: Use responsive max-widths (`max-w-[75vw] sm:max-w-[85%]`) so bubbles work on narrow screens without dominating viewport width.

---

## Pattern: Retry / Ask-Again from a User Message

Allow the user to re-send a previous question, effectively "rewinding" the conversation to that point. This is useful when the agent gave a wrong answer or the user wants to refine their question.

### UX Design

Each **user message** (role=`'user'`) shows a retry button (↻ `RefreshCcw` icon) in its action toolbar, alongside copy/speak/delete buttons. It only appears on user messages — not assistant responses.

```
┌──────────────────────────────┐
│  "What's the weather in     │  ← user bubble (right-aligned)
│   Tokyo?"                   │
└──────────────────────────────┘
        ↻  ⧉  🔊  ×           ← action toolbar: retry, copy, speak, delete
```

### Implementation

**1. The `resendMessage` function:**

This function:
1. Finds the clicked message's index in the messages array
2. Deletes that message AND ALL messages after it (both from UI state and from the backend)
3. Re-sends the original content via the existing `send()` function

```js
async function resendMessage(msgId, content) {
  // Xoá message này và tất cả message phía sau (khỏi UI)
  setMessages((p) => {
    const idx = p.findIndex((m) => m.id === msgId)
    if (idx === -1) return p
    // Xoá từ msgId trở đi
    const idsToDelete = p.slice(idx).map((m) => m.id)
    // Xoá trên server
    idsToDelete.forEach((id) => {
      fetch(withBackendBase(`/api/sessions/${activeId}/messages/${id}`, true), {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
      }).catch(() => {})
    })
    return p.slice(0, idx)
  })
  // Gửi lại nội dung
  await send(content)
}
```

- Uses the existing `/api/sessions/:id/messages/:msgId` DELETE endpoint
- Sends server deletes fire-and-forget (`.catch(() => {}))` since client-side deletion already removed them from UI
- Reuses the existing `send()` function so all normal send logic (retry fallback, loading state) applies

**2. The Retry Button (JSX):**

Place this in the action buttons row, before the copy/speak/delete buttons, only for `m.role === 'user'`:

```jsx
{m.role === 'user' && (
  <button
    type="button"
    onClick={() => resendMessage(m.id, m.content)}
    className="flex h-8 w-8 sm:h-5 sm:w-5 items-center justify-center rounded-md
               text-gray-300 transition-all hover:bg-gray-100 hover:text-gray-500
               cursor-pointer touch-manipulation"
    title="Hỏi lại"
  >
    <RefreshCcw size={14} />
  </button>
)}
```

### Pitfalls

1. **Race condition with server state**: Because server deletes are fire-and-forget and happen inside a `setMessages` callback, the server state may not sync perfectly if multiple resends happen rapidly. For a single retry, this is fine — the server eventually catches up.
2. **Session must exist**: The function assumes `activeId` is already set (the user is in an active session). If called before session init, the DELETE fetch will fail silently (`.catch`).
3. **Only user messages**: Do NOT add this to assistant messages — those have copy/speak but not retry. The retry conceptually means "I want to ask this question again."
4. **Queue safety**: If `loading` is true when `resendMessage` fires, `send()` will queue the content as a pending follow-up rather than sending immediately. This is acceptable behavior (the retry is queued behind the current response).
5. **No image repaste**: If the original user message contained images (via base64 data URLs), those are included in `m.content` and will be re-sent. No need to re-paste the image.

### When to Apply

- Adding a retry/resend feature to any chat UI that persists messages
- When the user needs the ability to "rewind" the conversation to a specific question
- Standard feature for chat UIs with history (similar to ChatGPT's edit/resend)

When a user refreshes (F5), React state is lost. For a production chat UI, the **active session** must survive reloads so the user doesn't lose context.

### Problem

On mount, `useEffect` typically fetches sessions and picks the first one (or creates a new one). After F5, `activeId` is `null`, so a new session is created — the chat appears "reset".

### Solution: localStorage + useState Lazy Init

**Step 1 — Initialize `activeId` from localStorage directly in `useState`:**

```js
const [activeId, setActiveId] = useState(() => localStorage.getItem('chat_active_session') || null)
```

This ensures the value is available synchronously on the first render, before any `useEffect` runs. This avoids the classic "effect race" where a restore effect and an init effect both fire on the same render.

**Step 2 — Init logic (runs once on mount):**

```js
useEffect(() => {
  let cancelled = false
  const doInit = async () => {
    try {
      const list = await fetchSessions()
      if (cancelled) return
      if (activeId) {
        // Restored from localStorage — check if session still exists on server
        const exists = list.some((s) => s.id === activeId)
        if (!exists) {
          localStorage.removeItem('chat_active_session')
          await createSession() // fallback to new session
        }
        // If exists, the [activeId] effect below handles loadMessages
      } else {
        // Normal first load — pick most recent or create
        if (list.length > 0) {
          setActiveId(list[0].id)
          localStorage.setItem('chat_active_session', list[0].id)
        } else {
          await createSession()
        }
      }
    } catch {
      if (!cancelled && !activeId) await createSession()
    }
  }
  doInit()
  return () => { cancelled = true }
}, [])
```

**Step 3 — Persist on every change:**

```js
useEffect(() => {
  if (activeId) {
    localStorage.setItem('chat_active_session', activeId)
  }
}, [activeId])
```

**Step 4 — Load messages + workspace when activeId is set:**

```js
useEffect(() => {
  if (activeId) {
    loadMessages(activeId)
    fetchWorkspace(activeId)
  }
  return () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }
}, [activeId])
```

### Restore Flow (F5)

```
1. Component mounts → useState lazy reads localStorage → activeId = "session-abc"
2. init effect runs → fetchSessions() → "session-abc" exists on server → no-op
3. [activeId] effect runs → loadMessages("session-abc") → messages restored
4. Workspace data fetched → full state restored
5. User sees their previous conversation intact
```

If the server-side session was deleted (e.g., database reset), step 2 detects it, clears localStorage, and creates a fresh session.

### Pitfalls

1. **Double init**: Avoid having two effects both trying to init sessions. The init logic must run exactly once (`deps=[]`).
2. **Stale activeId**: If the saved `activeId` is stale but `fetchSessions` fails (network error), ensure you don't accidentally `createSession()` when the session actually exists — guard with `!activeId` on the catch branch.
3. **SSR safety**: `localStorage` only exists in the browser. If this code runs server-side (Next.js etc.), guard with `typeof localStorage !== 'undefined'`.
4. **Cleanup**: On logout or session delete, always call `localStorage.removeItem('chat_active_session')`.

---

## References

- CSS animation `dot-flashing` is defined in `frontend/src/index.css` of HAgent.
- The three-state loading pattern (`loading + !streamingText` / `loading + streamingText` / `!loading`) is implemented in `frontend/src/components/Chat.jsx`.
- Session persistence pattern (localStorage + useState lazy init) is implemented in `frontend/src/components/Chat.jsx`.
- **HAgent SSE Architecture Map** — `references/hagent-sse-architecture.md`: exact endpoint locations, event bus internals, all consumers, implemented global agent-push architecture (`/api/agent/stream` + `AgentStore.jsx`), pitfalls, and event type reference. Load this before implementing any real-time/push feature in HAgent.
- **Global Agent Push** — `backend/api/services/agent_events.py` + `backend/api/routers/agent_stream.py` implement the unified SSE bus. Frontend: `frontend/src/hooks/useAgentStream.js` (hook) + `frontend/src/lib/AgentStore.jsx` (Context + useReducer). Provider wraps entire app in `App.jsx`. No Zustand — React Context + useReducer only.
