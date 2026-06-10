# HAgent SSE Architecture Map

*Discovered 2026-05-30. Implemented 2026-05-30. Use this before implementing any agent-push or real-time feature.*

---

## Existing SSE Endpoints

| Endpoint | File | Scope | Consumer |
|---|---|---|---|
| `GET /api/omni/events?t={token}` | `api/routers/omni.py` | Omnichannel platform events | `OmniChat.jsx` line 778 |
| `GET /api/chat/events?t={token}` | `api/routers/chat_events.py` | Chat session/message updates | Not yet consumed by any component |
| `GET /api/video/tasks/{taskId}/progress?t={token}` | `api/routers/make_video.py` | Per-task video pipeline progress | `VideoPage.jsx` line 261 |
| **`GET /api/agent/stream?t={token}`** | **`api/routers/agent_stream.py`** | **Global agent push — all tabs** | **`AgentStore.jsx` via `useAgentStream`** |

---

## Global Agent Event Bus (IMPLEMENTED)

### Backend

**New file:** `backend/api/services/agent_events.py`

```python
# Same thread-safe queue fan-out as chat_events.py, but global scope
_listeners: list[queue.Queue] = []

def broadcast_agent_event(event_type: str, data: dict[str, Any]) -> None:
    event = {"type": event_type, "ts": time.time(), **data}
    with _lock:
        for q in _listeners:
            q.put_nowait(event)   # maxsize=100 per client queue

def register_listener() -> queue.Queue: ...
def unregister_listener(q: queue.Queue) -> None: ...
def listener_count() -> int: ...
```

**New router:** `backend/api/routers/agent_stream.py`
- `GET /api/agent/stream?t={token}` — SSE stream, requires auth
- `GET /api/agent/stream/status` — returns `{"connected_clients": N}`
- `POST /api/agent/stream/broadcast` — manual push for debugging

**Registered in:** `backend/api/main.py`
```python
from api.routers import ... agent_stream ...
app.include_router(agent_stream.router, prefix="/api")
```

### Integration point — call from anywhere in backend

```python
from api.services.agent_events import broadcast_agent_event

# Push jobs data to JobHunter tab
broadcast_agent_event("agent.data", {"tab": "jobs", "payload": [...]})

# Global notification (toast)
broadcast_agent_event("agent.notification", {"message": "Xong rồi!"})

# Progress bar update
broadcast_agent_event("agent.progress", {"tab": "video", "percent": 72})

# Agent status
broadcast_agent_event("agent.status", {"status": "thinking"})  # idle|running|thinking|error
```

---

## Chat Events Bus (Original, unchanged)

**File:** `backend/api/services/chat_events.py`

```python
_chat_listeners: list[queue.Queue] = []

def broadcast_chat_event(event_type: str, data: dict) -> None: ...
def register_listener() -> queue.Queue: ...
def unregister_listener(q: queue.Queue) -> None: ...
```

**Current callers:** `chat_events.py` router + `messages.py`. No agent code calls it yet.
**Kept separate** from `agent_events.py` to avoid breaking existing chat UI.

---

## SSE Streaming Pattern (router)

Both `/api/chat/events` and `/api/agent/stream` use the same `StreamingResponse` + generator pattern:

```python
def event_gen():
    yield f"data: {json.dumps({'type': 'agent.connected', 'clients': listener_count()})}\n\n"
    while True:
        try:
            event = q.get(timeout=15)   # blocks up to 15s
            yield f"data: {json.dumps(event)}\n\n"
        except:                          # timeout → keepalive
            yield ": keepalive\n\n"
```

Headers: `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`

---

## Frontend — Shared Hook + Store (IMPLEMENTED)

### `frontend/src/hooks/useAgentStream.js`

```js
export function useAgentStream(onEvent, { enabled = true } = {}) {
  // Connects to /api/agent/stream?t={token}
  // Auto-reconnects after 3s on error
  // Cleans up EventSource on unmount
  // Keeps onEvent ref fresh to avoid stale closure
}
```

### `frontend/src/lib/AgentStore.jsx`

React Context + `useReducer` (no Zustand — not installed, no need to add).

```jsx
// State shape:
{
  jobs: [],
  video: null,
  system: null,
  automation: [],
  notifications: [],   // capped at 50
  agentStatus: 'idle', // idle | running | thinking | error
  progress: {},        // { [tab]: 0-100 }
  connected: false,
}

// Event type → reducer action mapping (direct dispatch):
// "agent.connected"   → sets connected: true
// "agent.data"        → sets state[tab] = payload
// "agent.notification" → prepends to notifications[]
// "agent.progress"    → updates progress[tab]
// "agent.status"      → sets agentStatus
```

**Exported hooks:**
```js
export function useAgentStore()  // { state, dispatch, clearNotification }
export function useBroadcast()   // dispatch shortcut for debug
```

### `frontend/src/App.jsx`

```jsx
import { AgentStoreProvider } from './lib/AgentStore.jsx'

// Wraps entire authenticated app (after Login):
return (
  <AgentStoreProvider>
    <div ...>...</div>
  </AgentStoreProvider>
)
```

Provider calls `useAgentStream` internally — single SSE connection for entire app, shared across all tabs.

---

## Hub Integration

All Hub components now import `useAgentStore` for future tab-level data binding:

| Hub | File | Import added |
|---|---|---|
| SystemHub | `frontend/src/components/SystemHub.jsx` | ✅ |
| EarningHub | `frontend/src/components/EarningHub.jsx` | ✅ |
| AutomationHub | `frontend/src/components/AutomationHub.jsx` | ✅ |

**Usage in a Hub/tab component:**
```jsx
import { useAgentStore } from '../lib/AgentStore.jsx'

function JobHunter() {
  const { state } = useAgentStore()
  const jobs = state.jobs  // populated when agent pushes agent.data {tab:"jobs", payload:[...]}
  // ...
}
```

---

## Event Types Reference

| Type | Backend call | Frontend effect |
|---|---|---|
| `agent.connected` | (automatic on connect) | `state.connected = true` |
| `agent.data` | `broadcast_agent_event("agent.data", {"tab": "jobs", "payload": [...]})` | `state[tab] = payload` |
| `agent.notification` | `broadcast_agent_event("agent.notification", {"message": "..."})` | prepend to `state.notifications` |
| `agent.progress` | `broadcast_agent_event("agent.progress", {"tab": "video", "percent": 72})` | `state.progress[tab] = 72` |
| `agent.status` | `broadcast_agent_event("agent.status", {"status": "thinking"})` | `state.agentStatus = "thinking"` |

---

## Files Changed / Created (2026-05-30)

| File | Status | Description |
|---|---|---|
| `backend/api/services/agent_events.py` | **NEW** | Global event bus |
| `backend/api/routers/agent_stream.py` | **NEW** | SSE endpoint + status + broadcast |
| `backend/api/main.py` | **MODIFIED** | Import + register agent_stream router |
| `frontend/src/hooks/useAgentStream.js` | **NEW** | Shared SSE hook with reconnect |
| `frontend/src/lib/AgentStore.jsx` | **NEW** | Context + useReducer store |
| `frontend/src/App.jsx` | **MODIFIED** | Wrapped in AgentStoreProvider |
| `frontend/src/components/SystemHub.jsx` | **MODIFIED** | Added useAgentStore import |
| `frontend/src/components/EarningHub.jsx` | **MODIFIED** | Added useAgentStore import |
| `frontend/src/components/AutomationHub.jsx` | **MODIFIED** | Added useAgentStore import |

---

## Pitfalls

1. **No Zustand** — not installed in frontend. Use React Context + useReducer (already done in AgentStore.jsx). Don't add Zustand without asking.
2. **Two buses exist** — `chat_events.py` (old, chat-only) and `agent_events.py` (new, global). Don't mix them. New features → `agent_events`.
3. **fan-out is global** — all connected clients receive all events. No per-user filtering. If needed in future, add `uid` field and filter in the generator.
4. **Queue maxsize=100** — if a client is slow, oldest events are dropped (put_nowait). For critical data, use polling fallback.
5. **Token auth required** — `resolve_user_id(token)` must return truthy. Test with `?t=<valid_token>` in browser.
6. **`ts` field auto-added** — `broadcast_agent_event` always adds `"ts": time.time()`. Don't add `ts` manually in the payload dict.
