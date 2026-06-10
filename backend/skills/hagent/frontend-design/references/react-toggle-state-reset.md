# React Toggle State Reset During Operations

## The Problem

A toggle button (e.g., "Continue Mode") correctly updates visual state on click via `useState`, but gets **silently reset to `false`** when a related operation runs — such as `stopChat()`, `createSession()`, or any async cleanup handler.

```
User clicks toggle → state = true ✅ (button is visually active)
User sends message → loading starts → message done → (stopChat runs?) → state = false ❌
User creates new session → state = false ❌
```

## Root Cause

Somewhere in the component, a **reset/cleanup function** unconditionally calls `setToggleState(false)` without checking whether the user had explicitly enabled it. Common culprits:

- `stopChat()` — clears loading, streaming, steps, AND toggle state
- `createSession()` or `newChat()` — resets entire UI to defaults
- `handleDone()` / stream `'done'` handler — may reset UI state at end of every response

## Code Pattern to Fix

```javascript
// ❌ BAD: unconditional reset
const stopChat = () => {
  setLoading(false)
  setContinueMode(false)         // ← clobbers user's intention
  continueModeRef.current = false
  setSteps([])
}

// ✅ GOOD: preserve toggle, only clear operation-specific state
const stopChat = () => {
  setLoading(false)
  // DON'T touch continueMode — user set it intentionally
  // continueModeRef.current stays as-is
  setSteps([])
}
```

## Detection

Search for `set<ToggleState>(false)` calls outside the toggle's own `onClick` handler. Specifically:

```bash
grep -n 'setContinueMode(false)' src/**/*.jsx
```

Every occurrence outside the toggle button's `onClick` is a potential bug.

## Why It Matters for Chat/Copilot UIs

- **Toggle state represents user intent** — a mode the user explicitly chose
- **Operational state** (loading, streaming, steps) is temporary and should reset
- **Conflating the two** causes the UI to silently "forget" the user's choice after every operation
- Users perceive this as "it works for one round, then reverts"

## Fix Strategies

| Strategy | When to Use |
|----------|-------------|
| **Remove reset** entirely from stop/new-session handlers | Toggle is per-session (user sets it once and expects it to stick) |
| **Use ref-based guard** — check a ref before resetting | Toggle should survive until user explicitly turns it off |
| **Add confirmation** — ask user before resetting toggle on new session | Toggle is expensive or has side effects |
| **Persist to localStorage** — survive page refreshes | Toggle is a user preference, not a session setting |
