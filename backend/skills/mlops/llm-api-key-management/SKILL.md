---
name: llm-api-key-management
description: >-
  Source, verify, and update LLM API keys for HAgent providers. Covers free
  public key repos, provider key rotation, and config.yaml updates.
category: mlops
triggers:
  - "get api key"
  - "lấy api key"
  - "update api key"
  - "rotate key"
  - "free api key"
  - "api key expired"
  - "thay key"
  - "đổi key"
---

# LLM API Key Management

Source and update API keys for HAgent LLM providers. Keys expire frequently —
this skill covers the common patterns for refreshing them.

## Trigger

Use this skill when the user asks to get a new API key, update an expired one,
rotate providers, or "lấy key từ" some source.

## Key Sources

### 1. free-llm-api-keys (GitHub)

Repo: `alistaitsacle/free-llm-api-keys`

**Architecture:**
- Keys are NOT hardcoded in code — they are created on-demand by the **Key Manager**
  (Pekpik's internal API) and published to the README.
- All keys share a single base URL: `https://aiapiv2.pekpik.com/v1`
- The repo updates keys **every 3 hours** via GitHub Actions cron.
- Keys expire in 24-48h and have budgets of $10-$20.

**How to extract keys:**
1. Navigate to `https://raw.githubusercontent.com/alistaitsacle/free-llm-api-keys/main/README.md`
2. Find the key tables under `## 📋 Available Keys`
3. Each table row has format: `| \`sk-xxx\` | <model> | 🆕 New | $<budget> | ...`
4. Keys for deepseek-chat, gpt-5.5, claude-opus-4-7, gemini-2.5-flash, smart-chat, etc.
5. Choose the key with the highest remaining budget and latest expiry

**Base URL for all keys:** `https://aiapiv2.pekpik.com/v1`

### 2. HAgent Config

Keys are stored in:
- `config.yaml` → under `providers.<provider_name>` (field: `api_key`)
- `.env` → environment-level keys (DEEPSEEK_API_KEY, OPENAI_API_KEY, etc.)

**Provider shadowing** warning: if a provider name in `config.yaml` matches a
built-in provider name (deepseek, openai, anthropic, pekpik, ollama, etc.),
the custom config may be shadowed. Use a unique name like `pekpik-custom` to
avoid this.

## Updating Keys

### config.yaml update

```bash
# After getting a new key, edit config.yaml:
# providers:
#   pekpik:
#     api_key: sk-NEW...KEY
```

Use `patch` tool with enough context for uniqueness (include the provider block
name and surrounding lines).

### .env update

```bash
# Edit .env for environment-level keys:
DEEPSEEK_API_KEY=sk-new...key
```

## Pitfalls

- **Keys expire fast.** free-llm-api-keys keys last 24-48h. Re-check README if
  you get authentication errors.
- **Same base URL.** All keys from free-llm-api-keys use the Pekpik gateway.
  They cannot be used with api.deepseek.com or api.openai.com directly.
- **Budget depletion.** Keys are shared publicly — budget may already be consumed.
  If a key doesn't work, try another one from the same README table.
- **Provider shadowing.** See the cron-jobs skill references for details.
- **README has full keys.** The `...` in displayed keys is GitHub's table
  truncation. The raw README.md has the full key string — extract via
  `curl -sL RAW_URL | grep 'sk-'`.
