## Gmail Summarization Quick Reference

Use absolute paths only. Do not guess the current working directory.

```bash
GSETUP="python3 /Users/nguyenhat/HAgent/backend/skills/productivity/google-workspace/scripts/setup.py"
GAPI="python3 /Users/nguyenhat/HAgent/backend/skills/productivity/google-workspace/scripts/google_api.py"

$GSETUP --check
$GAPI gmail search "in:inbox" --max 5
$GAPI --account honghac404@gmail.com gmail search "in:inbox" --max 5
$GAPI gmail get ID1,ID2,ID3
```

Expected auth check:

```text
AUTHENTICATED
```

Rules:

- If auth check passes, do the user request immediately.
- If the user names an email address, pass `--account <email>` to the Gmail command without listing accounts first.
- Do not inspect `auth.json` for Gmail readiness.
- Do not suggest browser-token extraction.
- Keep summaries concise and direct.
- Group duplicate security alerts instead of repeating the same content.
