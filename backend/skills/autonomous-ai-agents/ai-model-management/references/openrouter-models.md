# OpenRouter Model Pricing Reference (2026)

## Free Tier Models (Prompt Price ≈ 0)

| ID | Name | Prompt/Token | Completion/Token | Notes |
|----|------|--------------|------------------|-------|
| `inclusionai/ring-2.6-1t:free` | Ring-2.6 thinking model | FREE | FREE | 1T param, 63B active |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | NVIDIA Nemotron 30B | FREE | FREE | Multimodal support |
| `openrouter/owl-alpha` | Owl Alpha | FREE | FREE | Agentic workflows |
| `baidu/cobuddy:free` | CoBuddy | FREE | FREE | Code generation |
| `poolside/laguna-xs.2:free` | Laguna XS.2 | FREE | FREE | Coding agent, 8K context |
| `poolside/laguna-m.1:free` | Laguna M.1 | FREE | FREE | Complex software engineering |

## Budget-Friendly Models (< $0.000001/token)

| ID | Name | Prompt/Token | Completion/Token | Context | Best For |
|----|------|--------------|------------------|---------|----------|
| `meta-llama/llama-3.1-8b-instruct` | Llama 3.1 8B | $0.0000004 | $0.0000004 | 128K | General tasks ⭐ **TOP PICK** |
| `meta-llama/llama-3.1-70b-instruct` | Llama 3.1 70B | $0.00000051 | $0.00000074 | 128K | Complex reasoning |
| `ibm-granite/granite-4.1-8b` | Granite 4.1 8B | $0.00000005 | $0.0000001 | 131K | Enterprise tasks |
| `gryphe/mythomax-l2-13b` | MythoMax 13B | $0.00000006 | $0.00000006 | 4K | Roleplay/narrative |
| `mistralai/mistral-7b-instruct-v0.1` | Mistral 7B | $0.00000011 | $0.00000019 | 2824 | Fast, cheap |
| `nousresearch/hagent-2-pro-llama-3-8b` | Hagent 2 Pro Llama 3 8B | $0.00000014 | $0.00000014 | 8K | Instruction following |

## Standard Tier ($0.0000005 - $0.000002/token)

| ID | Name | Prompt/Token | Completion/Token | Context | Notes |
|----|------|--------------|------------------|---------|-------|
| `x-ai/grok-4.3` | Grok 4.3 | $0.00000125 | $0.0000025 | 1M | xAI, web search |
| `~anthropic/claude-haiku-latest` | Claude Haiku | $0.000001 | $0.000005 | 200K | Latest model |
| `openai/gpt-chat-latest` | GPT Chat Latest | $0.000005 | $0.00003 | 400K | Instant chat model |
| `~google/gemini-flash-latest` | Gemini Flash | $0.0000005 | $0.000003 | 1M | Multimodal |
| `openai/gpt-4o-mini` | GPT-4o mini | $0.00000015 | $0.0000006 | 128K | Fast, capable |
| `mistralai/mistral-medium-3-5` | Mistral Medium 3.5 | $0.0000015 | $0.0000075 | 256K | Coding focus |

## Premium Tier (>$0.000002/token)

| ID | Name | Prompt/Token | Completion/Token | Context | Best For |
|----|------|--------------|------------------|---------|----------|
| `anthropic/claude-3-haiku` | Claude 3 Haiku | $0.00000025 | $0.00000125 | 200K | Reasoning tasks |
| `openai/gpt-4o` | GPT-4o | $0.0000025 | $0.00001 | 128K | High intelligence |
| `mistralai/mistral-large` | Mistral Large | $0.000002 | $0.000006 | 128K | Enterprise tasks |
| `openai/gpt-4-turbo` | GPT-4 Turbo | $0.00001 | $0.00003 | 128K | Legacy, deprecated |

---

## Cost Calculation Examples

### Example 1: Llama 3.1 8B (Budget Pick)
```
Input: 1000 tokens × $0.0000004 = $0.000400
Output: 500 tokens × $0.0000004 = $0.000200
Total: $0.000600 (0.6 cents) for 1500 tokens
```

### Example 2: GPT-4o (Standard)
```
Input: 1000 tokens × $0.00000015 = $0.000150
Output: 500 tokens × $0.0000006 = $0.000300
Total: $0.000450 (0.45 cents) for 1500 tokens
```

### Example 3: Claude Haiku (Premium)
```
Input: 1000 tokens × $0.00000025 = $0.000250
Output: 500 tokens × $0.00000125 = $0.000625
Total: $0.000875 (0.875 cents) for 1500 tokens
```

---

## Model Selection Guidelines

### For Free Tier Tasks
- **Coding:** `poolside/laguna-m.1:free` (dedicated coding agent)
- **General Chat:** `meta-llama/llama-3.1-8b-instruct` via `inclusionai/ring-2.6-1t:free`
- **Reasoning:** `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`

### For Cost-Conscious Users
- **Budget King:** `meta-llama/llama-3.1-8b-instruct` ($0.0000004/token)
- **Best Value:** `ibm-granite/granite-4.1-8b` ($0.00000005/token - essentially free!)

### For High-Performance Needs
- **Balanced:** `meta-llama/llama-3.1-70b-instruct` (70B params, 7x cheaper than GPT-4o)
- **Enterprise:** `mistralai/mistral-medium-3-5` (Mistral's flagship)

---

## Testing Command Templates

### Single Model Test
```bash
curl -s "https://openrouter.ai/api/v1/chat/completions" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"model":"MODEL_ID","messages":[{"role":"user","content":"test"}],"stream":false}' | python3 -m json.tool
```

### Batch Test Multiple Models
```bash
models=(\
  "meta-llama/llama-3.1-8b-instruct"\
  "inclusionai/ring-2.6-1t:free"\
  "openrouter/owl-alpha"\
)

for model in "${models[@]}"; do
  echo "Testing $model..."
  curl -s "https://openrouter.ai/api/v1/chat/completions" \
    -H "Authorization: Bearer $API_KEY" \
    -d "{\"model\":\"$model\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}],\"stream\":false}" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Model: {d[\"model\"]}, Cost: \${d[\"usage\"][\"cost\"]}')"
done
```

### Cost Monitor Script
```bash
# Track usage over time
cat backend/logs/openrouter-usage.jsonl 2>/dev/null | python3 -c "
import json, sys, csv
from collections import defaultdict
totals = defaultdict(float)
for line in sys.stdin:
    try:
        d = json.loads(line.strip())
        totals[d.get('model', 'unknown')] += float(d.get('cost', 0))
    except: continue
print('Total Cost per Model:')
for m, c in sorted(totals.items(), key=lambda x: -x[1]):
    print(f'  {m}: \${c:.6f}')
"
```

---

## API Key Management

### Best Practices
1. **Store in `.env`:** `OPENROUTER_API_KEY=sk-or-v1-...`
2. **Use Hagent config:** Edit `backend/config.yaml` under `openrouter:` section
3. **Rotate keys:** Create new keys in OpenRouter dashboard regularly
4. **Set spend limits:** Configure monthly spending caps in OpenRouter settings

### API Key Format
```
sk-or-v1-XXXXXXXXXXXXXXXXXXXXXXXXXX
┌─────┬───────────────────────────────┐
│     │ This is the bearer token      │
│     │ required for all requests     │
└─────┴───────────────────────────────┘
```

---

## Last Updated: 2026-05-12
Data source: OpenRouter API `/api/v1/models` endpoint.