#!/Users/nguyenhat/HAgent/backend/.venv/bin/python3
"""Auto shutdown remote machine after 10 minutes of inactivity.

Runs every 2 minutes via launchd.
Checks SSH sessions on remote, shuts down if idle > 10 min.
"""

import os
import subprocess
import time
import json

REMOTE_HOST = "100.69.50.64"
SSH_PASSWORD = os.environ.get("SSH_PASSWORD", "NgocNhi@1811")
STATE_FILE = "/tmp/hagent_remote_activity.json"
IDLE_TIMEOUT = 10 * 60  # 10 minutes


def ssh(cmd):
    try:
        r = subprocess.run(
            ["sshpass", "-p", SSH_PASSWORD, "ssh", "-o", "StrictHostKeyChecking=no",
             "-o", "ConnectTimeout=10", f"root@{REMOTE_HOST}", cmd],
            capture_output=True, text=True, timeout=15,
        )
        return r.stdout.strip(), r.returncode
    except Exception as e:
        return str(e), -1


def check_activity():
    out, rc = ssh("who | grep -v '^$\|reboot\|shutdown' | wc -l")
    if rc != 0:
        return False, f"SSH failed: {out[:100]}"
    count = int(out.strip() or "0")
    return count > 0, f"Active users: {count}"


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
    out, rc = ssh("shutdown -h now")
    if rc == 0:
        print("✅ Shutdown command sent")
    else:
        print(f"❌ Shutdown failed: {out[:200]}")
    save_state(last_check=now)


if __name__ == "__main__":
    main()
