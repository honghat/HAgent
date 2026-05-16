---
name: ai-model-management
description: "Set up, configure, and test AI models via OpenRouter for Hagent Agent integration."
version: 1.0.0
author: User + Hagent Agent
platforms: [macos, linux, windows]
metadata:
  openrouter:
    tags: [openrouter, models, free-tier, testing, config]
---

# AI Model Management

Set up, configure, and test AI models via OpenRouter for Hagent Agent integration.

## Usage Patterns

### Adding a New Model

```bash
# 1. Query model catalog
curl -s "https://openrouter.ai/api/v1/models?limit=20&sort=recommended_score" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps([{'id':m['id'],'name':m['name'],'pricing':m.get('pricing','')}[:3]} for m in d.get('data',[])[:10]], indent=2))"

# 2. Test model endpoint
curl -s "https://openrouter.ai/api/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"YOUR_MODEL_ID","messages":[{"role":"user","content":"Hello!"}],"stream":false}'

# 3. Update config.yaml
patch config.yaml to add model to openrouter section
```

### Config Pattern (config.yaml)

```yaml
openrouter:
  enabled: true
  api_key: sk-or-v1-XXXXXXXX
  model: provider/model-name          # e.g., meta-llama/llama-3.1-8b-instruct
```

## Free Tier Models

### Currently Available Free Models

| Model | Pricing | Best For |
|-------|---------|----------|
| `meta-llama/llama-3.1-8b-instruct` | $0.0000004/token | General chat, coding |
| `inclusionai/ring-2.6-1t:free` | FREE! | Reasoning tasks |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | FREE! | Multimodal support |
| `openrouter/owl-alpha` | FREE! | Agentic workflows |
| `baidu/cobuddy:free` | FREE! | Code generation |

### Free Model Query Command

```bash
curl -s https://openrouter.ai/api/v1/models?limit=50&sort=recommended_score \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
# Filter free tier models (prompt price < 0.000001 or 'free')
models = [m for m in d.get('data', []) 
          if float(m.get('pricing','{}').get('prompt','1')) < 0.000001 or 'free' in m.get('name','').lower()]
print(json.dumps([{'id':m['id'],'name':m['name'],'pricing':m.get('pricing','')}[:3]} for m in models[:15]], indent=2))
"
```

## Testing Model Endpoints

### Basic Test Template

```bash
curl -s "https://openrouter.ai/api/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "provider/model-name",
    "messages": [{
      "role": "user", 
      "content": "Test message"
    }],
    "stream": false
  }' | tail -5
```

### Response Fields to Monitor

- `prompt_tokens` - Input token count
- `completion_tokens` - Output token count  
- `total_tokens` - Combined total
- `cost` - Actual cost in USD
- `model` - Which model actually ran
- `provider` - Hosting provider (e.g., Nebius, Phala)

## Pitfalls & Common Issues

### ⚠️ Model ID Validation

❌ **Wrong:** `qwen/qwen-2.5-vl-7b-instruct`  
✅ **Correct:** Verify exact model slug from API or documentation

Example error:
```json
{"error":{"message":"No endpoints found for qwen/qwen-2.5-vl-7b-instruct.","code":404}}
```

### ⚠️ Context Window Limits

| Model | Context | Notes |
|-------|---------|-------|
| Llama 3.1 8B | 128K | Generous |
| Gemini Flash | 1M tokens | Very large |
| CoBuddy | 131K | Moderate |

### ⚠️ Price Discrepancies

Free models may still have small costs:
- `meta-llama/llama-3.1-8b-instruct`: $0.0000004/prompt (not free, but cheap!)
- Always check actual pricing in API response

### ⚠️ Provider Variations

Same model may run on different providers:
```json
{"model": "meta-llama/llama-3.1-8b-instruct", "provider": "Nebius"}
{"model": "qwen/qwen-2.5-7b-instruct", "provider": "Phala"}
```

## Supported Parameters

### Common OpenRouter Parameters

| Parameter | Description |
|-----------|-------------|
| `temperature` | 0.0-1.0 (creativity) |
| `max_tokens` | Max output tokens |
| `top_p` / `top_k` | Sampling parameters |
| `stop` | Stop sequences |
| `presence_penalty` | Penalize new topics |
| `frequency_penalty` | Penalize repeated tokens |
| `seed` | Reproducible outputs |
| `tools` | Function calling |
| `tool_choice` | Auto/required/function name |
| `response_format` | JSON mode, etc. |

### Model-Specific Features

- **Multimodal:** `text+image+file+audio+video→text` (Gemini, Grok)
- **Reasoning:** `include_reasoning`, `reasoning_effort` (Claude, Gemini)
- **Web Search:** `web_search`, `web_search_options` (supported models only)

## Quick Reference Commands

### List All Models
```bash
curl -s "https://openrouter.ai/api/v1/models?limit=50&sort=recommended_score" | python3 -c "import json,sys; print(json.dumps([{'id':m['id'],'name':m['name'],'pricing':m.get('pricing','')}[:3]} for m in json.load(sys.stdin).get('data',[])[:20]], indent=2))"
```

### Test Model (Generic Template)
```bash
curl -s "https://openrouter.ai/api/v1/chat/completions" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"model":"MODEL_ID","messages":[{"role":"user","content":"test"}]}'
```

### Cost Calculator (for a message)
```bash
# Formula: (prompt_tokens × prompt_price + completion_tokens × completion_price)
# Example: Llama 3.1 8B at $0.0000004/token
# 50 tokens input × $0.0000004 = $0.000020 (0.00002 USD)
```

## Reference Files

- `references/openrouter-models.md` - Model catalog with pricing details
- `templates/test-openrouter.py` - Test script for batch model testing