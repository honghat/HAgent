# Model & Language Support Detection Patterns

## Pattern 1: Model Config Inspection

### Check ML Model Registration Files

```bash
# Find model config files
curl -sL "https://api.github.com/repos/{REPO}/contents/" | \
  jq -r '.[] | select(.type=="file") | 
    select(.name | test("model|config|language"; "i")) | 
    "https://raw.githubusercontent.com/\(.url?name=\(.path))"' | \
  xargs -d '\n' curl -s | grep -lE "language|supported_languages|languages" || echo "No model config with language field found"

# Example patterns to look for:
# {
#   "supported_languages": ["en", "vi", "zh-CN"],
#   "language_models": {"vietnamese": "model_vn.pt"},
#   "i18n": { "vi": true }
# }
```

### Check GGUF/PyTorch Model Files

```bash
# Look for multilingual model indicators  
curl -sL "https://api.github.com/repos/{REPO}/contents/models/" | \
  jq -r '.[] | select(.name | test(".*vi.*|.*multilingual.*|.*bilingual.*"; "i")) | 
        .name'

# Common multilingual model names:
# - "f5_tts_v1.0-vi.pt"
# - "bilingual-whisper.pt"  
# - "tortoise-multilingual-3pt2.bin"
```

## Pattern 2: Source Code Language Detection

### Scan Import Statements

```bash
# Check for language-specific model imports
curl -sL "https://raw.githubusercontent.com/{REPO}/main/src/models/loader.py" | \
  grep -iE "(load.*vietnamese|register.*vi|lang.*vn)" || echo "No Vietnamese import found"

# Look for language enumeration patterns
grep -r "LANGS\|LANGUAGES\|supported_languages\s*=" --include="*.py" --include="*.js" \
  "https://api.github.com/repos/{REPO}/contents/src/" || true
```

### Check Language Enum Constants

```python
# Pattern to detect in code:
LANGS = {
    "en": "english",
    "vi": "vietnamese",  # ← Vietnamese support!
    "zh-CN": "chinese"
}
```

## Pattern 3: API Endpoint Analysis

### Check Model Selection Endpoints

```bash
# If app has model selection API, check its schema
curl -sL "{BASE_URL}/api/models" | jq '
  .models[]? | 
    select(.language or .languages) |
    {name: .name, language: (.language // empty)}
' 

# Example response:
{
  "models": [
    {"name": "whisper-large-v3", "language": "multi"},
    {"name": "f5-tts-zh", "language": "zh-CN"}
  ]
}
```

## Pattern 4: Config File Parsing

### Check .env.example / config templates

```bash
# Look for language configuration patterns
curl -sL "https://raw.githubusercontent.com/{REPO}/main/.env.example" | \
  grep -E "(LANG|LANGUAGE|LOCALE|i18n)" || echo "No LANG variables in .env.example"

# Check docker-compose.yml  
curl -sL "https://raw.githubusercontent.com/{REPO}/main/docker-compose.yml" | \
  grep -iE "(vi_|vietnamese|language.*=)" || true
```

### Model Config JSON Parsing

```bash
# Extract supported languages from model config
curl -sL "https://raw.githubusercontent.com/{REPO}/main/src/models/config.json" | jq '
  .supported_languages // 
  (if type == "array" then join(", ") else "Not found" end)
' || echo "Config file not found or invalid JSON"
```

## Pattern 5: Package Dependencies Check

### Identify Language-Specific Model Packages

```bash
# Check package.json for language-specific deps
curl -sL "https://raw.githubusercontent.com/{REPO}/main/package.json" | jq '
  .dependencies, .devDependencies | flatten | 
  unique | .[] | select(. | test("viet|f5-tts|whisper.*vi|multilingual"; "i"))
'

# Example packages:
# - "f5-tts-vietnamese": "^0.1.2"
# - "torchaudio-lobas-tortoise-multilingual": "^1.0.0"
```

## Pattern 6: README Evidence Extraction

### Extract Language Mentions from README

```bash
curl -sL "https://raw.githubusercontent.com/{REPO}/main/README.md" | \
  grep -iE "(支持|supports|language:|locales:)" || echo "No explicit language list in README"

# Also check for model names that imply language support  
grep -iE "(zh_|vi_|vn_|multilang|bilingual|f5.*tts)" README.md
```

## Pattern 7: Issue Tracker Signals

### Analyze User Requests for Language Support

```bash
# Get Vietnamese-related issues
curl -sL "https://api.github.com/repos/{REPO}/issues?state=all&per_page=100" | \
  jq '[.[] | {
    number: .number, 
    title: .title,
    state: .state,
    language_hint: (if (.title|contains("tiếng việt")) then "vietnamese-mention" else empty end)
  } | select(.language_hint) | del(.language_hint)]'
```

### Look for Model Addition PRs

```bash
# Find PRs adding new language models
curl -sL "https://api.github.com/repos/{REPO}/pulls?state=all&per_page=50" | \
  jq '[.[] | select(.title | test("viet|vi_|f5.*tts|multilang"; "i"))]'
```

## Pattern 8: Hugging Face Model Hub Check

### If repo uses HF models, check hub directly

```bash
# For repos using huggingface-hub, check model cards
curl -sL "https://huggingface.co/{MODEL_NAME}/tree/main" | \
  grep -oE "(Supported languages:|[Ll]anguages:)" || true

# Example HF model card language field:
"Languages: Vietnamese (vi), English (en), Chinese (zh-CN)"
```

## Quick Verification Script

```bash
#!/bin/bash
REPO="$1"

echo "=== Model & Language Support Check for $REPO ==="
echo ""

# 1. README check  
echo "📄 README Analysis:"
readme=$(curl -sL "https://raw.githubusercontent.com/$REPO/main/README.md")
if echo "$readme" | grep -qiE "(支持|supports.*Vietnamese|locales.*vi)"; then
  echo "✅ README: Vietnamese mentioned"
else  
  echo "❌ README: No Vietnamese mention"
fi

# 2. Config files  
echo ""
echo "⚙️  Config Files:"
configs=$(curl -sL "https://api.github.com/repos/$REPO/contents/" | \
  jq -r '.[] | select(.type=="file") | .name' | grep -iE "config|model" || echo "")
[ -z "$configs" ] && echo "No config files found" || echo "Found: $configs"

# 3. Python/JS imports
echo ""
echo "💻 Code Imports:"  
curl -sL "https://api.github.com/repos/$REPO/contents/src/" | \
  jq -r '.[] | select(.type=="file") | .name' | head -5 || echo "No src folder"
```

## Key Patterns Summary

| Pattern Type | What to Check | Evidence Signal |
|-------------|---------------|-----------------|
| **Model Config** | `model_config.json`, `config.py` | `"supported_languages": ["vi", "en"]` |
| **Source Code** | Import statements, constants | `from models import VietnameseModel` |
| **API Endpoints** | Model selection API | `/api/models?lang=vi` works |
| **Dependencies** | `package.json`, `requirements.txt` | `"f5-tts-vietnamese": "^1.0"` |
| **README** | Feature lists, language mentions | "Supports Vietnamese voices" |
| **Issues** | Feature requests, add-on PRs | PR adding Vietnamese model support |

## Critical Caveats

### 🚨 Language Mention ≠ Model Support

A repo may mention languages in:
- UI/README (documentation language)
- Config file comments (not actual support)  
- Dependency names (e.g., `py-torch-vi` could be Vietnamese package OR generic naming)

**Always verify with:**
1. Actual model loading code
2. API requests accepting the language parameter  
3. Successful inference on Vietnamese audio/text

### 🚨 "Multi-language" Doesn't Mean All Languages

A model marked "multi-language" might support:
- English ✅
- French ✅  
- Vietnamese ❌ (still claims "multi")

**Check specific language lists in model config.**