#!/usr/bin/env python3
"""Add PEKPIK_API_KEY to .env if not present."""
import os

env_path = os.path.expanduser("~/HAgent/backend/.env")

with open(env_path) as f:
    content = f.read()

if "PEKPIK_API_KEY" not in content:
    content += '\n# ── Backend: PEKPIK API ────────────────────────────────\nPEKPIK_API_KEY=sk-fN3IbLtVPkRM7gRXe1OGY0jM1a8rfbMUD2BacWN3LH50jW\n'
    with open(env_path, 'w') as f:
        f.write(content)
    print("✅ PEKPIK_API_KEY added to .env")
else:
    print("⏭️ PEKPIK_API_KEY already in .env")
