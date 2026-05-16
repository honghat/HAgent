# Gateway Autostart on macOS: LaunchAgents vs LaunchDaemons

## Overview

When configuring Hagent Gateway for autostart on macOS, you'll encounter permission issues writing to `/Library/LaunchDaemons/`. This directory requires root access. The preferred alternative is using **LaunchAgents** in user space (`~/Library/LaunchAgents/`).

---

## Common Pitfall: Permission Denied

```bash
❌ Failed: /Library/LaunchDaemons/
sudo mkdir -p /Library/LaunchDaemons && chmod 755 /Library/LaunchDaemons
```

Error: `Permission denied` — requires sudo password.

**Why?** LaunchDaemon plists live in `/Library/` (system-level). Your user account lacks write access without elevated privileges.

---

## ✅ Solution 1: LaunchAgents (No Sudo Required) ⭐

LaunchAgents run in the user context and don't need sudo. Ideal for personal setups.

### Steps

```bash
# 1. Create the plist (adjust path as needed)
cat > ~/Library/LaunchAgents/com.nguyenhat.hagent-gateway.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
    <dict>
        <key>Label</key>
        <string>com.nguyenhat.hagent-gateway</string>
        <key>ProgramArguments</key>
        <array>
            <string>/Users/nguyenhat/hagent-agent/venv/bin/python</string>
            <string>-m</string>
            <string>hagent_cli.main</string>
            <string>gateway</string>
            <string>run</string>
            <string>--replace</string>
        </array>
        <key>WorkingDirectory</key>
        <string>/Users/nguyenhat/hagent-agent</string>
        <key>EnvironmentVariables</key>
        <dict>
            <key>VIRTUAL_ENV</key>
            <string>/Users/nguyenhat/hagent-agent/venv</string>
        </dict>
        <key>RunAtLoad</key>
        <true/>
        <key>KeepAlive</key>
        <true/>
        <key>StandardErrorPath</key>
        <string>/Users/nguyenhat/.hagent/logs/gateway-autostart-error.log</string>
        <key>StandardOutPath</string>
        <string>/Users/nguyenhat/.hagent/logs/gateway-autostart-output.log</string>
    </dict>
</plist>
EOF

# 2. Load the agent
launchctl load ~/Library/LaunchAgents/com.nguyenhat.hagent-gateway.plist

# 3. Verify it's loaded
launchctl list | grep hagent-gateway

# 4. Stop if running in foreground (optional)
sudo launchctl bootout /Users/nguyenhat/.hagent/gateway-autostart.plist 2>/dev/null || true
```

---

## ✅ Solution 2: LaunchDaemons (With Sudo)

If you have admin access and prefer system-level service:

```bash
# Copy plist with sudo
sudo mkdir -p /Library/LaunchDaemons
sudo cp ~/.hagent/gateway-autostart.plist /Library/LaunchDaemons/com.nguyenhat.hagent-gateway.plist
sudo chown root:wheel /Library/LaunchDaemons/com.nguyenhat.hagent-gateway.plist
sudo chmod 644 /Library/LaunchDaemons/com.nguyenhat.hagent-gateway.plist

# Load it
sudo launchctl load -w /Library/LaunchDaemons/com.nguyenhat.hagent-gateway.plist
```

---

## ✅ Solution 3: Hagent Built-in Autostart

Easiest option if available — uses Hagent' own scheduler:

```bash
hagent config set autostart true
```

This may use a different mechanism depending on your Hagent version. Check with `hagent status` or `hagent gateway start`.

---

## Verification Checklist ✅

After setting up, verify:

```bash
# 1. Check if running
ps aux | grep hagent | grep gateway

# 2. Check logs (if configured)
tail -f ~/.hagent/logs/gateway-autostart-output.log

# 3. Kill it for testing
sudo launchctl bootout /Library/LaunchDaemons/com.nguyenhat.hagent-gateway.plist || \
   launchctl bootout ~/Library/LaunchAgents/com.nguyenhat.hagent-gateway.plist || \
   pkill hagent

# 4. Restart
hagent gateway restart
```

---

## Common Issues

### Gateway dies on logout/SSH disconnect

**Cause:** macOS doesn't keep services alive when the terminal session ends.

**Fix:** Add `KeepAlive` set to `true` in your plist (see examples above).

### Port already in use after stopping manually

```bash
# Kill any lingering process
pkill hagent

# Or find the PID
lsof -i :8000  # or whatever port Hagent uses
```

---

## References

- [Hagent Agent Autostart docs](https://hagent-agent.nousresearch.com/docs/)
- [launchctl man page](https://developer.apple.com/library/archive/preview/LaunchDaemons.html)
- [LaunchDaemon vs LaunchAgent](https://apple.stackexchange.com/a/270643)

---

## Notes

- **LaunchAgents** = user space, per-user daemon (no sudo needed)
- **LaunchDaemons** = system space, requires sudo/root
- For personal setups: **LaunchAgents is preferred** — avoids sudo entirely

---

## Related Skills

- `hagent-agent` — for gateway CLI commands
- `native-mcp` — MCP server management (if applicable)
- `autonomous-ai-agents/subagent-driven-development` — for background task patterns