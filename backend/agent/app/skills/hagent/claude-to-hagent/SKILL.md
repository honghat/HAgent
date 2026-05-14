---
name: claude-to-hagent
description: "Interact with HAgent AI agent platform via its HTTP API. Use this skill when the user wants to send messages or questions to HAgent for research/analysis, start a HAgent conversation thread, check HAgent status or health, list available models/skills/agents in HAgent, manage HAgent memory, upload files to HAgent threads, or delegate complex research tasks to HAgent. Also use when the user mentions hagent or wants to run a deep research task that HAgent can handle."
---

# HAgent Skill

Communicate with a running HAgent instance via its HTTP API. HAgent is an AI agent platform that orchestrates tools for research, code execution, web browsing, and more.

## Architecture

HAgent exposes its API on port 8004.

| Service        | Direct Port | Via Proxy                        | Purpose                          |
|----------------|-------------|----------------------------------|----------------------------------|
| HAgent API     | 8004        | `$HAGENT_URL`                    | Chat, tools, wiki, etc.          |

## Environment Variables

All URLs are configurable via environment variables. **Read these env vars before making any request.**

| Variable                | Default                                  | Description                        |
|-------------------------|------------------------------------------|------------------------------------|
| `HAGENT_URL`            | `http://localhost:8004`                  | HAgent backend API URL             |

When making curl calls, always resolve the URL like this:

```bash
# Resolve base URL from env (do this FIRST before any API call)
HAGENT_URL="${HAGENT_URL:-http://localhost:8004}"
```

## Available Operations

### 1. Health Check

Verify HAgent is running:

```bash
curl -s "$HAGENT_URL/api/health"
```

### 2. Create a Session

```bash
curl -s -X POST "$HAGENT_URL/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{"title": "New Research Session"}'
```

Response: `{"id": "<session_id>", "title": "..."}`

### 3. Send a Message (Streaming SSE)

```bash
curl -s -N -X POST "$HAGENT_URL/api/sessions/<session_id>/messages" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Phân tích giá vàng hôm nay",
    "provider": "deepseek"
  }'
```

The response is an SSE stream. Events:
- `think`: Agent's thinking process or tool status updates.
- `tool`: Tool execution details.
- `content`: Incremental chunks of the final response.
- `wiki`: Notifications about new wiki entries created.
- `done`: Signal that the response is complete.

### 4. List Chat Sessions

```bash
curl -s "$HAGENT_URL/api/sessions"
```

### 5. Get Session Messages

```bash
curl -s "$HAGENT_URL/api/sessions/<session_id>/messages"
```

### 6. Search Wiki Knowledge

```bash
curl -s -X POST "$HAGENT_URL/api/wiki/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "giá vàng"}'
```

### 7. List Wiki Entries

```bash
curl -s "$HAGENT_URL/api/wiki/list"
```

---

## Usage Script

For sending messages and collecting the full response from terminal, use:

```bash
bash backend/agent/app/skills/hagent/claude-to-hagent/scripts/chat.sh "Your question here"
```

## Parsing SSE Output

The stream returns SSE events in `data: {...}` format.
- To get the final text, concatenate all `content` data.
- `think` events provide insights into what the agent is doing (searching web, reading files, etc.).

## Tips

- Use `provider: "deepseek"` for standard tasks.
- HAgent automatically extracts knowledge from conversations into its Wiki.
- Multi-round tool execution (searching web -> reading page -> calculating) is handled automatically on the server.
