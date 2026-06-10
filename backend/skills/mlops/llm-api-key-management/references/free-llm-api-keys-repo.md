# free-llm-api-keys Extraction Recipe

## Repo
https://github.com/alistaitsacle/free-llm-api-keys

## Latest keys (raw README)
```bash
curl -sL "https://raw.githubusercontent.com/alistaitsacle/free-llm-api-keys/main/README.md" | grep -E '^\| `sk-' | sort
```

## Architecture
- Keys are created on-demand by a custom **Key Manager** API at `https://aiapiv2.pekpik.com/km`
- The `publish_keys.py` script calls `GET /keys?status=active` to list existing keys,
  creates new featured keys via `POST /keys/batch`, then updates README.md
- Keys have: name, model, budget_usd ($10-$20), duration_hours (24-48), rpm (5-20)
- Bot commits keys 3-5x/day with message format `feat: +N keys, -M expired`

## Provider
All keys use base URL: `https://aiapiv2.pekpik.com/v1`
Compatible with OpenAI SDK format.

## Key table from session (2026-05-28)

### DeepSeek (deepseek-chat)
| Key | Budget | RPM | Expires |
|-----|--------|-----|---------|
| sk-fNf...iNvY | $18 | 20 | 2026-05-30 |
| sk-DQ5...Kw7f | $13 | 20 | 2026-05-30 |

### GPT-5.5
| Key | Budget | Expires |
|-----|--------|---------|
| sk-HgB...k4ZV | $20 | 2026-05-29 |
| sk-s6w...H6W5 | $20 | 2026-05-29 |
| sk-AlW...WXVp | $20 | 2026-05-29 |
| sk-sDd...mb7G | $20 | 2026-05-29 |

### Claude Opus 4.7
sk-Mx4...rka5, sk-ILE...qL3x, sk-FR8...HQZY, sk-DFi...bycF, sk-oSp...FWu3, sk-jcK...4jqh
(all $20, expires 2026-05-28)

### Multi-Model / Smart Chat
sk-Dh0...2RUT ($15, 10 RPM), sk-yaD...KPG3 ($10), sk-KB2...P43F ($11)

## Update command for reference
Replace the `api_key` field under provider `pekpik` in `config.yaml`:
```yaml
  pekpik:
    name: Pekpik API
    base_url: https://aiapiv2.pekpik.com/v1
    api_key: sk-NEW...KEY
    default_model: deepseek-chat
```
