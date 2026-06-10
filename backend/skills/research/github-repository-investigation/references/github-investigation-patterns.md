# GitHub Investigation Patterns

## Pattern 1: Language Support Verification

```bash
# Multi-stage language detection
curl -sL "https://raw.githubusercontent.com/{REPO}/main/README.md" | \
  grep -i -E "(language|lang|locale|ví|tiếng việt)" || echo "❌ No explicit language mention"

# Check for language config files
curl -sL "https://api.github.com/repos/{OWNER}/{REPO}/contents/" | \
  jq -r '.[] | select(.type=="file" and (.name | test("i18n|l10n|locale|language|lang"; "i"))) | .name'

# Scan source code for language strings  
curl -sL "https://api.github.com/repos/{OWNER}/{REPO}/contents/src" | \
  jq -r '.[] | select(.type=="file") | "https://raw.githubusercontent.com/\(.url?name=\(.path))"' | \
  xargs -d '\n' grep -l "vietnamese\|tiếng việt\|Vietnam" 2>/dev/null || echo "No Vietnamese code found"
```

## Pattern 2: Model/ML Support Detection

```bash
# Find ML model config files
curl -sL "https://api.github.com/repos/{OWNER}/{REPO}/contents/" | \
  jq -r '.[] | select(.type=="file" and (.name | test("model|config|weight|gguf|pytorch"; "i"))) | .path'

# Check supported languages in model config  
curl -sL "https://raw.githubusercontent.com/{REPO}/main/src/models/config.json" | \
  jq 'keys, ."supported_languages" // empty'
```

## Pattern 3: Issue/PR Feature Tracking

```bash
# Get all issues with language/model mentions (last 50)
curl -sL "https://api.github.com/repos/{OWNER}/{REPO}/issues?state=all&sort=updated&direction=desc&per_page=50" | \
  jq '[.[] | {number: .number, title: .title, state: .state, created_at: .created_at, labels: [.l.name]}]' > /tmp/issues.json

# Filter for support requests
jq --arg query "vietnamese|vi|Tiếng Việt" '[.[] | select(.title | test($query; "i"))]' /tmp/issues.json
```

## Pattern 4: Quick Capability Check (Terminal)

```bash
#!/bin/bash
REPO="freestyle-voice/freestyle"

echo "=== QUICK CHECK: $REPO ==="
echo ""

# README analysis
readme=$(curl -sL "https://raw.githubusercontent.com/$REPO/main/README.md")
if echo "$readme" | grep -qi "vietnamese\|tiếng việt"; then
  echo "✅ README mentions Vietnamese"
else
  echo "❌ No Vietnamese mention in README"
fi

# Config files
configs=$(curl -sL "https://api.github.com/repos/$REPO/contents/?ref=main" | \
  jq -r '.[] | select(.type=="file") | .name' | grep -iE "config|model|language|locale" || echo "")
if [ -n "$configs" ]; then
  echo "🔍 Found config files:"
  echo "$configs"
fi

echo ""
echo "=== VERDICT ==="  
echo "Requires deep code inspection - no quick confirmation"
```

## Pattern 5: TDD (Test-Driven Discovery) for Feature Claims

```bash
# Claim: "Repo supports Vietnamese voice input"
CLAIM="Vietnamese voice input support"

readme=$(curl -sL "https://raw.githubusercontent.com/{REPO}/main/README.md")
issues=$(curl -sL "https://api.github.com/repos/{OWNER}/{REPO}/issues?per_page=200" | \
  jq '[.[] | select(.title | contains("vietnamese"))] | length')

# Evidence matrix
{
  echo "Claim: $CLAIM"
  echo "=========================================="
  echo "Evidence Level:"
  
  if echo "$readme" | grep -qi "vietnam\|việt"; then
    echo "  ✅ README: Explicit mention"
  else
    echo "  ❌ README: No mention"
  fi
  
  echo "  ℹ️  Issues: $issues issues with 'vietnamese'"
  
  # Check for Vietnamese model configs  
  models=$(curl -sL "https://api.github.com/repos/{OWNER}/{REPO}/contents/" | \
    jq -r '.[] | select(.type=="file") | .name' | grep -iE "viet|vi_.*\.json" || echo "")
  if [ -n "$models" ]; then
    echo "  ✅ Config: Vietnamese model references found"
  else  
    echo "  ❌ Config: No Vietnamese model configs"
  fi
  
  echo ""
  echo "=== CONCLUSION ==="  
  if [ $issues -eq 0 ] && ! echo "$models" | grep -q ".json"; then
    echo "❓ UNCLEAR - Feature may exist but not well-documented"
  else  
    echo "✅ SUPPORTED (with caveats)"
  fi
}
```

## Pattern 6: Evidence-Based Verdict Template

Use this when investigating claims about repo capabilities:

```markdown
## 📦 Repository: {REPO}

### ✅ Confirmed Features
- [Feature X] — `docs/models.md` explicitly lists Vietnamese support  
- [Feature Y] — PR #123 added Vietnamese voice cloning

### ❌ Not Supported (or Unclear)  
- [Feature Z] — No evidence found in README, configs, or code

### 🔍 Evidence Locations
- **README**: `/main/README.md` — mentions only English API
- **Config**: `/src/models/config.json` — no language field  
- **Issues**: 0 open issues requesting Vietnamese support

### 🎯 Recommendation
[Use case-specific guidance]
```

---

## Key Learnings from Sessions

### Session: freestyle-voice/freestyle (Vietnamese TTS Check)

**Workflow used:**
1. ✅ Web search for repo + language keywords  
2. ✅ Direct GitHub page navigation → README analysis  
3. ✅ Issues/PRs scan with Vietnamese filter  
4. ✅ docs/ folder inspection (test-mlx-local.md)  
5. ✅ API GitHub contents listing (package.json, model configs)  

**Key finding**: `freestyle` does NOT have explicit Vietnamese language support documented.

**Pitfall discovered**: README-only approach gives false positives — always check:
- Code imports (`from xxx import vietnamese_model`)
- Config schemas (`.env.example` for language params)
- Model registration files (which models are registered)

**Output pattern**: Verdict with evidence locations → not just "yes/no"