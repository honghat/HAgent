# Docker Setup: Authentication & Login

## Setup (port 3000)

The user runs chatgpt2api via a standalone `docker-compose.yml` at `/Users/nguyenhat/chatgpt2api/`:

```yaml
services:
  app:
    image: ghcr.io/basketikun/chatgpt2api:latest
    container_name: chatgpt2api
    restart: unless-stopped
    ports:
      - "3000:80"
    volumes:
      - ./data:/app/data
      - ./config.json:/app/config.json
    environment:
      - STORAGE_BACKEND=json
```

- Config file: `/Users/nguyenhat/chatgpt2api/config.json`
- Container name: `chatgpt2api`

## Login Mechanism

The Web UI login at `/login` uses **`Authorization: Bearer <auth-key>`** header, NOT body fields.

### Correct login command:

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H "Authorization: Bearer chatgpt2api" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Success response:
```json
{"ok": true, "version": "1.1.7", "role": "admin", "subject_id": "admin", "name": "管理员"}
```

### Common mistakes:
- ❌ POST body `{"username":"admin","password":"chatgpt2api"}` — returns 401 "密钥无效或已失效"
- ❌ POST body `{"auth_key":"chatgpt2api"}` — same error
- ❌ POST body `{"key":"chatgpt2api"}` — same error
- ✅ `Authorization: Bearer chatgpt2api` — correct

### How Web UI login works (source from `web/src/lib/api.ts`):

```typescript
export async function login(authKey: string) {
  const normalizedAuthKey = String(authKey || "").trim();
  return httpRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: {},
    headers: {
      Authorization: `Bearer ${normalizedAuthKey}`,
    },
    redirectOnUnauthorized: false,
  });
}
```

## Auth key

Read from `/Users/nguyenhat/chatgpt2api/config.json`:
```json
{"auth-key": "chatgpt2api"}
```

## After Login

Once authenticated, all subsequent API calls (with the session cookie from the login response) work normally. Key endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/accounts` | GET | List accounts |
| `/api/accounts` | POST | Add accounts (body: `{"tokens": [...]}`) |
| `/api/accounts` | DELETE | Remove accounts |
| `/v1/models` | GET | List available models |
| `/v1/chat/completions` | POST | Chat completion (OpenAI-compatible) |
| `/v1/images/generations` | POST | Generate images |

## Container Status Check

```bash
docker ps --filter name=chatgpt2api --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
docker logs chatgpt2api 2>&1 | tail -50
```
