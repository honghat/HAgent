# React Stale Closures: Detection & Fix Patterns

## What Are Stale Closures?

A stale closure occurs when a React **callback** (event handler, `useEffect`, SSE data handler, `setTimeout`, `setInterval`) captures a **state value** at the time it was created, not the time it runs. The function "closes over" an outdated snapshot of state.

## Detection Symptoms

| Symptom | Likely Cause |
|---------|-------------|
| Toggle doesn't take effect until next interaction/rerender | Callback captured stale state |
| UI updates but logic still uses old value | State used in an effect or callback, not in render |
| `useEffect` watcher runs with stale values | Dependencies array is stale or missing refs |
| SSE/WebSocket handler uses old state | Handler created once, never re-created with new state |

## Canonical Fix: Ref + State Pattern

The most reliable pattern: keep **state for re-renders**, keep **ref for callbacks**.

```jsx
// 1. Define both
const [continueMode, setContinueMode] = useState(false)
const continueModeRef = useRef(false)

// 2. Sync ref whenever state changes (toggle handler)
const handleToggle = () => {
  setContinueMode((v) => {
    const next = !v
    continueModeRef.current = next   // ← sync ref
    return next
  })
}

// 3. Use ref (NOT state) inside callbacks that may fire after user action
//    This includes: SSE handlers, setTimeout, setInterval, event listeners
case 'done':
  if (continueModeRef.current) {   // ← reads latest value
    setTimeout(() => send('Continue...'), 300)
  }
  break

// 4. Reset both on cleanup / new session
setContinueMode(false)
continueModeRef.current = false
```

## Why This Works

- **`useRef`** — mutable object that survives renders; `ref.current` always reads the latest value
- **`useState`** — immutable snapshot; a closure captures the value at creation time
- By syncing ref on every state write, and reading ref in callbacks, you get the best of both

## Common React Contexts Where Stale Closures Bite

### 1. SSE / EventSource / WebSocket Handlers

```jsx
// ❌ BAD: handler captures stale state
reader.read().then(function process({ done, value }) {
  if (data.type === 'done' && continueMode) { ... }  // stale!
})

// ✅ GOOD: use ref
reader.read().then(function process({ done, value }) {
  if (data.type === 'done' && continueModeRef.current) { ... }
})
```

### 2. `setTimeout` / `setInterval`

```jsx
// ❌ BAD
useEffect(() => {
  const id = setInterval(() => {
    console.log(count)  // always 0
  }, 1000)
}, [])

// ✅ GOOD: use ref
const countRef = useRef(count)
useEffect(() => { countRef.current = count }, [count])
useEffect(() => {
  const id = setInterval(() => {
    console.log(countRef.current)
  }, 1000)
}, [])
```

### 3. Event Listeners

```jsx
// ❌ BAD
useEffect(() => {
  window.addEventListener('resize', () => {
    console.log(size)  // stale
  })
}, [])

// ✅ GOOD
const sizeRef = useRef(size)
useEffect(() => { sizeRef.current = size }, [size])
useEffect(() => {
  window.addEventListener('resize', () => {
    console.log(sizeRef.current)
  })
}, [])
```

### 4. `useCallback` with Missing Dependencies

```jsx
// ❌ BAD
const handleClick = useCallback(() => {
  doSomething(count)  // stale — count not in deps
}, [])

// ✅ GOOD: either include deps or use ref
const countRef = useRef(count)
const handleClick = useCallback(() => {
  doSomething(countRef.current)
}, [])
```

## Alternative: Functional Updates

When a callback only needs to **update** state (not read it), use the functional form:

```jsx
// Safe — always reads latest state
setCount(prev => prev + 1)
```

But this only works for writes. For conditional logic based on current state, you need the ref pattern.

## Testing for Stale Closures

1. **Timing test**: Toggle a boolean flag mid-async-operation; check if the operation respects the new value
2. **Race condition test**: Rapidly toggle state while callbacks are queued
3. **Console.log proof**: Add `console.log('state:', stateValue, 'ref:', refValue)` inside the callback to compare

## Summary Decision Tree

```
Callback reads state?
├── Only writes state → use functional update (setState(prev => ...))
└── Reads state AND runs in async context (SSE, setTimeout, event listener)
    → Create useRef mirror, sync on every state change, read ref.current in callback
```
