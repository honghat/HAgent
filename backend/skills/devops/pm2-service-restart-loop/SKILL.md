---
name: pm2-service-restart-loop
description: "Diagnose and fix PM2 services that restart excessively (100+ times in minutes). Covers watchdog vs PM2 restart-loop detection, logging chain analysis, configuration tuning, and conflict resolution between multiple restart mechanisms."
version: 1.0.0
author: Hagent Agent
license: MIT
platforms: [linux, macos]
metadata:
  hagent:
    tags: [pm2, watchdog, restart-loop, devops, process-management, production]
    related_skills: [command-execution-workarounds, cron-jobs]
---

# PM2 Service Restart Loop — Diagnosis & Fix

## Overview

A service that restarts 50-200+ times in minutes is almost never a code crash. It's usually one of:

1. **PM2's own restart logic** hitting `max_restarts` + `min_uptime` limits and cycling
2. **An external watchdog** (separate PM2 process, Python script, cron job) restarting the service repeatedly
3. **Both at the same time** — watchdog restarts → PM2 counts a crash → PM2 restarts → watchdog sees service down → watchdog restarts → compound loop
4. **Memory limit** — `max_memory_restart` triggers a restart when the service reaches the limit, then the fresh process quickly re-accumulates memory

**First principle:** A "restart loop" does NOT mean the service is crashing. It means *something* is telling it to restart. The service itself may be perfectly healthy.

## When to Use This Skill

- PM2 shows `restarts: 50+` within an hour
- User reports "service keeps refreshing" / "WebSocket disconnects repeatedly"
- `pm2 logs` shows `Shutting down` → `Started server process` cycling every few minutes
- System feels unstable but individual service endpoints respond 200 OK

## Step 1: Gather Baseline Evidence

### 1a. Check PM2 process stats

```bash
pm2 list
# Note: restarts count, uptime, status per service
```

### 1b. Get detailed per-process info

```bash
pm2 show <service-name> | grep -E "restarts|status|exit|killed|max_memory|min_uptime"
```

Key fields:
- **restarts** — raw count (the symptom)
- **unstable restarts** — PM2 considered the process unstable (different from normal restarts)
- **max memory restart** — memory limit that triggers auto-restart
- **status** — "online" even when restarting 200 times (PM2 considers it "online" if it starts successfully)

### 1c. Check PM2 config for restart parameters

Look in the ecosystem config file (`ecosystem.config.cjs` or `ecosystem.config.js`):

```bash
grep -E "max_restarts|min_uptime|restart_delay|exp_backoff|max_memory_restart" ecosystem.config.* 2>/dev/null
```

**Dangerous values:**
- `min_uptime: '10s'` — very tight, any brief unavailability triggers restart
- `restart_delay: 500` — aggressive retry
- `max_restarts: 10` — low threshold that, once hit, shifts PM2 into a different restart mode

### 1d. Check for external watchdog

Look for any process or script that restarts PM2 services:

```bash
# 1. Watchdog PM2 process
pm2 list | grep -i watch

# 2. Watchdog script on disk
ls -la scripts/watchdog.py 2>/dev/null || find . -name "watchdog*" 2>/dev/null

# 3. Cron jobs that restart services
crontab -l 2>/dev/null | grep -i pm2 || grep -r "pm2.*restart" backend/cron/ 2>/dev/null

# 4. PM2 ecosystem entries
pm2 describe hagent-watchdog 2>/dev/null | grep script
```

## Step 2: Read the Logs — Not Just the Error Log

The **out log** (`fastapi-out.log`) is often more informative than the error log for restart loops because PM2 and the watchdog write to it.

### What to look for in the out log:

```bash
# Lines that show restarts
grep -E "Shutting down|Started server|Application startup|Application shutdown" logs/fastapi-out.log | tail -20

# Lines from watchdog script
grep -E "restart|fail|hồi phục|cooldown" logs/watchdog-out.log 2>/dev/null | tail -20
```

### Separation pattern (critical diagnostic):

```
03:03:08 Shutting down          ← PM2 restart or kill
03:03:08 Finished server        ← process fully stopped
03:03:10 Started server         ← process restarts
03:03:10 Application startup    ← server is serving again
```

If you see this repeating every 2-10 minutes with **no error message between them**, it is NOT a crash — it's a restart command from somewhere.

## Step 3: Identify the Restart Mechanism

### Pattern A: PM2 internal restart loop
- PM2 `restarts` counter climbs steadily
- `unstable restarts` may also increase
- No watchdog script exists OR watchdog is not restarting
- The service log shows clean startup/shutdown cycles with no errors
- **Fix:** Increase `min_uptime` (e.g., 30s) and `restart_delay` (e.g., 5s). Or increase `max_restarts`.

### Pattern B: Watchdog restart loop
- Watchdog PM2 process exists and is running
- Watchdog's own logs show "fail X/3 → restart" messages
- After watchdog restart, PM2's restart counter increments by 1
- When watchdog cooldown expires, it probes again and may find the service still unstable
- **Fix:** Increase watchdog fail threshold (3→5), increase cooldown (120→300), or fix why the health check fails

### Pattern C: Compound loop (MOST COMMON — this session's finding)
- Watchdog restarts the service → PM2 counts it as a crash → PM2's `max_restarts` logic kicks in → PM2 restarts the service AGAIN → watchdog sees the second restart as a new fail → watchdog restarts again → PM2's `exp_backoff_restart_delay` accelerates
- The total restart count compounds (watchdog + PM2)
- **Fix:** One of:
  1. Increase watchdog cooldown well past PM2's restart window so they don't overlap
  2. Disable PM2's `autorestart` and let watchdog handle it exclusively
  3. Increase PM2 `min_uptime` to prevent it from restarting on watchdog-triggered restarts

### Pattern D: Memory limit restart
- `pm2 show` shows memory near `max_memory_restart` value (e.g., 1G)
- Service restarts, then gradually climbs back to the limit
- **Fix:** Increase `max_memory_restart` value, or fix the memory leak in the service

### Pattern E: Genuine crash from unhandled exception (new — added 2026-05-27)

> See `references/fastapi-global-exception-handler.md` for full details.

- The service **actually crashes** — uvicorn worker exits with a traceback
- The restart IS legitimate (process died), but the root cause is an unhandled exception, not a restart loop
- **Identification:** `pm2 logs` shows actual Python `Traceback (most recent call last)` lines before `Shutting down`. If you see `401`, `AuthenticationError`, or any exception type you can name, it's Pattern E.
- **Fix:** Add FastAPI global exception handler that catches all exceptions, logs them, and returns a 500 response instead of crashing the worker. Then diagnose the underlying error separately.
- **Why this matters:** Without the global handler, a single bad API call (e.g. expired Pekpik token returning 401) kills the whole server process, causing a restart storm that compounds through PM2 + watchdog.

## Step 4: Fix Strategies

### Quick diagnostic restart reset

```bash
# Reset the restart counter without bouncing the service
pm2 reset <service-name>
```

### Tune PM2 thresholds (ecosystem.config.cjs)

```javascript
// Safer defaults
const HARDENED = {
  autorestart: true,
  max_restarts: 15,
  min_uptime: '30s',     // was '10s' — give it time to stabilize
  restart_delay: 5000,   // was 500 — wait 5s before restart
  exp_backoff_restart_delay: 1000,
  max_memory_restart: '2G',  // raise if you suspect memory limit
  kill_timeout: 5000,
};
```

### Tune watchdog (scripts/watchdog.py)

```python
# In the environment variables or script defaults:
FAIL_THRESHOLD = 5        # was 3 — tolerate more brief failures
COOLDOWN_S = 300          # was 120 — wait 5 minutes between restarts
CHECK_INTERVAL = 60       # was 30 — probe less frequently
```

### Option: Let only one system handle restarts

If watchdog is your infra-managed layer, harden it and disable PM2 autorestart:

```javascript
// In ecosystem config for the service
{
  name: 'hagent-fastapi',
  autorestart: false,   // watchdog handles it
  // ... rest of config
}
```

**Risk:** If watchdog also fails, the service stays down forever. Use only with a reliable watchdog.

### Apply and verify

```bash
# After config change:
pm2 restart ecosystem.config.cjs
# or for a single service:
pm2 restart <service-name>

# Monitor for 5-10 minutes:
watch -n 30 'pm2 list | grep <service-name>'
```

## Verifying the Fix

- [ ] Restart count stopped increasing
- [ ] Service uptime > 10 minutes without interruption
- [ ] Health endpoint responds 200 consistently
- [ ] No watchdog restart messages in watchdog log
- [ ] User reports stable connections (WebSocket, chat, etc.)

## Pitfalls

- **Don't confuse PM2 `restarts` with `unstable restarts`:** A high restarts count + 0 unstable restarts means PM2 itself is NOT treating it as crashing — some external force (watchdog, another script) is doing the restarting.
- **`pm2 logs` grep for "error" often misses the restart:** PM2 shutdown/startup messages are `INFO`, not errors. Read the out log, not just the error log.
- **Watchdog and PM2 compound counts:** A single health-check failure can trigger 2 restarts (watchdog + PM2), so a watchdog with threshold=3 may produce 6+ restarts in the PM2 counter before it settles.
- **PM2 memory limits interact with restart counters:** If the service hits `max_memory_restart` and restarts, every restart resets memory. The service might look healthy and then OOM again. Monitor memory trend across restarts.
- **Never assume "restarts = crashes":** The most common cause of high restart counts in this project is compound watchdog+PM2 behavior. Root-cause the restart **source** before tuning any single parameter.

## Quick Reference

| Symptom | Likely Cause | First Check |
|---------|------------|-------------|
| 50-200 restarts in minutes, no error messages | Compound watchdog + PM2 loop | Check watchdog-out.log for restart commands |
| Restarts count but unstable_restarts = 0 | External script/service triggering restart | `ps aux | grep pm2` for second PM2 instance |
| Restarts every 2-3 minutes regularly | Watchdog cooldown cycle | Check watchdog FAIL_THRESHOLD and COOLDOWN_S |
| Restarts accelerate over time | PM2 exp_backoff_restart_delay compounding | Check PM2 min_uptime vs watchdog detection speed |
| Restarts slow but memory grows each cycle | Memory limit restart | Check `pm2 show` for memory near max_memory_restart |
| Service log shows actual traceback before restart | **Genuine crash — unhandled Python exception** | Check `pm2 logs` for Traceback lines. Add FastAPI global exception handler (see `references/fastapi-global-exception-handler.md`) |
| Backend starts OK, watchdog restart-loop for 50+ cycles, no error traceback on stdout | Pekpik/upstream 401 killing uvicorn worker silently | Same as above — global handler prevents worker death |

## Real-World Case: HAgent hagent-fastapi (2026-05-27)

**Symptom:** `pm2 list` showed 207 restarts in 26 minutes for `hagent-fastapi`. The service was "online" per PM2 status.

**Evidence chain:**
1. `pm2 logs hagent-fastapi --lines 50` — clean shutdown/startup cycles, no errors
2. `pm2 show hagent-fastapi` — restarts=207, **unstable restarts=0** (indicates external restart, not crash)
3. Read `ecosystem.config.cjs` — `min_uptime: '10s'`, `restart_delay: 500`
4. Read `scripts/watchdog.py` — `FAIL_THRESHOLD=3`, `COOLDOWN_S=120`, `CHECK_INTERVAL=30`

**Root cause:** Compound loop. Watchdog probed `/health` every 30s. If the service was briefly slow (e.g., during compression model initialization), watchdog saw 3 failures → restarted → PM2 counted the watchdog-triggered restart as a crash (uptime < 10s) → PM2 also restarted → watchdog saw PM2's restart as a new failure → cycle repeated.

**Fix applied:** Increased `min_uptime` from 10s to 30s and `FAIL_THRESHOLD` from 3 to 5, preventing the overlap between watchdog restart triggers and PM2 restart logic.
