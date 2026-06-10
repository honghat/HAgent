---
name: react-state-persistence
description: Persist React component state across page refresh using localStorage. Covers useState initializer, useEffect watchers, and server-side fallback for session-based apps like chat.
---

# React State Persistence (Page Refresh Resilience)

## When to use

User asks to "hạn chế tải lại trang" / "keep state on refresh" / "persist on F5" for a React component. The goal is to prevent a page reload from resetting all component state.

## Core pattern

```jsx
// 1. Define the localStorage key + load helper
const PERSIST_KEY = 'my_component_state'
const loadPersistedState = () => {
  try {
    const raw = localStorage.getItem(PERSIST_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    return data
  } catch { return null }
}

// 2. Initialize state from localStorage (via lazy initializer — avoids flicker)
const [activeId, setActiveId] = useState(() => loadPersistedState()?.activeId || null)

// 3. Persist state on every change
useEffect(() => {
  try {
    const current = JSON.parse(localStorage.getItem(PERSIST_KEY) || '{}')
    localStorage.setItem(PERSIST_KEY, JSON.stringify({ ...current, activeId }))
  } catch { /* ignore */ }
}, [activeId])
```

## Pitfalls

- **DO NOT persist transient state** (streaming text, loading flags, open/closed panels) — only persist the keys needed to restore the view. Everything else fetches from API on mount.
- **initializer vs setState**: Using `useState(() => ...)` runs only once on first render. Using `setState` in useEffect would cause a double-render with null → value, which could flash empty UI.
- **localStorage quota**: For large state (e.g. message arrays), persist only identifiers (session ID, item ID) and let the server rehydrate.
- **Security**: Never persist tokens or secrets in localStorage. Only non-sensitive view identifiers.

## Chat-specific example (session-based)

For a chat app where sessions live on the server:

1. Persist only `activeId` (session ID) to localStorage
2. On mount, fetch session list from API and check if persisted `activeId` still exists server-side
3. If yes → set it; if no → fall back to first session or create new

```jsx
useEffect(() => {
  fetchSessions().then((list) => {
    const persisted = loadPersistedState()
    if (persisted?.activeId && list.some(s => s.id === persisted.activeId)) {
      setActiveId(persisted.activeId)
    } else if (list.length > 0) {
      setActiveId(list[0].id)
    } else {
      createSession()
    }
  })
}, [])
```

## Verification

- Hard-refresh (Cmd+Shift+R) the page — the active session/view should survive.
- Delete the session on the server and refresh — should gracefully fall back (not crash).
- Check localStorage (`DevTools → Application → Local Storage`) to confirm the key exists with correct value.

## Related: Stale Closures in Async Callbacks

See [references/react-stale-closures.md](references/react-stale-closures.md) for the ref+state pattern — a common companion bug when state is read inside SSE handlers, setTimeout, or event listeners that outlive the render cycle.
