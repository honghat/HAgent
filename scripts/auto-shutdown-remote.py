#!/Users/nguyenhat/HAgent/backend/.venv/bin/python3
"""Auto shutdown remote machine after 10 minutes of inactivity.

Runs every 2 minutes via launchd.
Checks SSH sessions on remote, shuts down if idle > 10 min.
"""

import os
import subprocess
import time
import json
from pathlib import Path

# Load .env from project root
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    import dotenv
    dotenv.load_dotenv(env_path)

REMOTE_HOST = "100.69.50.64"
REMOTE_USER = "hatnguyen"
SSH_PASSWORD = os.environ.get("SSH_PASSWORD")
if not SSH_PASSWORD:
    print("❌ SSH_PASSWORD env var not set")
    exit(1)
SSHPASS = "/opt/homebrew/bin/sshpass"
STATE_FILE = "/tmp/hagent_remote_activity.json"
IDLE_TIMEOUT = 20 * 60  # 20 minutes


def ssh(cmd):
    try:
        r = subprocess.run(
            [SSHPASS, "-p", SSH_PASSWORD, "ssh", "-o", "StrictHostKeyChecking=no",
             "-o", "ConnectTimeout=10", f"{REMOTE_USER}@{REMOTE_HOST}", cmd],
            capture_output=True, text=True, timeout=15,
        )
        return r.stdout.strip(), r.returncode
    except Exception as e:
        return str(e), -1


def check_activity():
    """Check multiple signals of activity on remote machine."""
    checks = []

    # 1. SSH user sessions
    out, rc = ssh("who | grep -v '^$\|reboot\|shutdown' | wc -l")
    if rc != 0:
        return False, f"SSH failed: {out[:100]}"
    ssh_count = int(out.strip() or "0")
    if ssh_count > 0:
        checks.append(f"🖥 SSH:{ssh_count}")

    # 2. SMB connections (connected clients)
    out, rc = ssh("sudo smbstatus -p 2>/dev/null | grep -cE '^[0-9]' || true")
    if rc == 0:
        smb_clients = int(out.strip() or "0")
        if smb_clients > 0:
            checks.append(f"📁 SMB:{smb_clients}")

    # 3. SMB open files (actively being read/written)
    out, rc = ssh("sudo smbstatus -L 2>/dev/null | grep -cE '(DENY_NONE|DENY_ALL|RW)' || true")
    if rc == 0:
        smb_files = int(out.strip() or "0")
        if smb_files > 0:
            checks.append(f"📄 Files:{smb_files}")

    # 4. LAN connections to the machine (from our IPs)
    out, rc = ssh("ss -tnp state established 2>/dev/null | grep -cE '(192\.168|100\.1[0-9][0-9]\.)' || true")
    if rc == 0:
        lan_cons = int(out.strip() or "0")
        if lan_cons > 0:
            checks.append(f"🌐 LAN:{lan_cons}")

    # 5. CPU load — skip shutdown if machine is busy
    out, rc = ssh("uptime | awk -F'load average:' '{print \$2}' | awk -F, '{print \$1+0}'")
    if rc == 0:
        load = float(out.strip() or "0")
        if load > 2.0:
            checks.append(f"⚡ Load:{load:.1f}")

    total = len(checks) > 0
    return total, f"Active: {', '.join(checks) or 'none'}"


def load_state():
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"last_activity": 0, "last_check": 0}


def save_state(last_activity=None, last_check=None):
    state = load_state()
    if last_activity is not None:
        state["last_activity"] = last_activity
    if last_check is not None:
        state["last_check"] = last_check
    with open(STATE_FILE, "w") as f:
        json.dump(state, f)


def main():
    now = time.time()
    state = load_state()
    has_activity, msg = check_activity()

    if has_activity:
        save_state(last_activity=now, last_check=now)
        print(f"✅ Active — {msg}")
        return

    last_active = state.get("last_activity", 0)
    if last_active == 0:
        save_state(last_activity=now, last_check=now)
        print("📝 First check — recording start time")
        return

    idle_seconds = now - last_active
    print(f"ℹ️  No activity — idle for {idle_seconds:.0f}s / {IDLE_TIMEOUT}s")

    if idle_seconds < IDLE_TIMEOUT:
        save_state(last_check=now)
        print("⏳ Within grace period")
        return

    print(f"🔌 Idle for {idle_seconds:.0f}s, shutting down...")
    out, rc = ssh("sudo shutdown -h now")
    if rc == 0:
        print("✅ Shutdown command sent")
    else:
        print(f"❌ Shutdown failed: {out[:200]}")
    save_state(last_check=now)


if __name__ == "__main__":
    main()
