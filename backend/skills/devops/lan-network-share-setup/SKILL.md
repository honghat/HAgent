---
name: lan-network-share-setup
description: "Setup LAN network shares (Samba, NFS) on remote servers via SSH automation."
version: 1.0.0
author: Hagent Agent
license: MIT
platforms: [linux]
metadata:
  hagent:
    tags: [lan, samba, nfs, network-share, ssh-automation, smb, windows-compat]
---

# LAN Network Share Setup (Samba/NFS)

Class-level skill for setting up file-sharing protocols (primarily Samba on Linux/Ubuntu, NFS) on remote servers via SSH automation. This skill encodes a proven multi-step workflow that emerged from practical experience with Ubuntu 24.04+ servers and macOS clients.

## Trigger Conditions

Use this skill when the user wants to:
- ✅ Create a new network share (Samba for Windows/macOS compatibility)
- ✅ Mount remote SMB shares on their local machine
- ✅ Setup cross-platform file sharing (Windows ↔ Linux ↔ macOS)
- ✅ Automate Samba/NFS configuration via SSH from Hagent

**Not for:**
- ❌ Just connecting to an existing share (`smb://...`)
- ❌ Troubleshooting permission issues only
- ❌ Setting up shares on the local machine itself (use local file tools)

---

## Standard Workflow (Samba Share)

### Phase 1: Verify Remote Access

```bash
ssh <user>@<ip> 'whoami && ls -la /mnt/<path> | head -5'
```

Confirm:
- ✅ SSH login works
- ✅ Target mount point exists and is accessible
- ✅ User has sudo privileges (needed for config changes)

### Phase 2: Install Dependencies

```bash
sudo apt update -y
sudo apt install -y samba smbclient cifs-utils
```

Verify installed packages are up-to-date. Skip `apt update` if packages are already current.

**Pitfall:** On Ubuntu 24.04+, some tools (like `smbtree`) may segfault due to Samba version quirks. The service itself (`smbd`) still works even if diagnostic tools crash. Ignore `smbtree` errors if the share is mountable via Finder/terminal.

### Phase 3: Backup Existing Config

```bash
sudo cp /etc/samba/smb.conf /etc/samba/smb.conf.backup
```

Always backup before modifying `/etc/samba/smb.conf`.

### Phase 4: Add Share Configuration

**DO:** Use multiple `echo | tee -a` commands (one per line):

```bash
echo "[<SHARE_NAME>]" | sudo tee -a /etc/samba/smb.conf
echo "   path = /mnt/<mount_point>" | sudo tee -a /etc/samba/smb.conf
echo "   browseable = yes" | sudo tee -a /etc/samba/smb.conf
echo "   read only = no" | sudo tee -a /etc/samba/smb.conf
echo "   writable = yes" | sudo tee -a /etc/samba/smb.conf
echo "   guest ok = no" | sudo tee -a /etc/samba/smb.conf
echo "   security = user" | sudo tee -a /etc/samba/smb.conf
echo "   valid users = <username>" | sudo tee -a /etc/samba/smb.conf
echo "   create mask = 0755" | sudo tee -a /etc/samba/smb.conf
echo "   directory mask = 0755" | sudo tee -a /etc/samba/smb.conf
```

**DON'T:** Use heredocs (`cat << 'EOF' ... EOF`) for multi-line config in SSH sessions — the terminal tool has issues parsing complex heredocs across remote connections.

### Phase 5: Set Samba Password

**Use `printf` with two lines (password + retype):**

```bash
printf "<PASSWORD>\n<PASSWORD>\n" | sudo smbpasswd -a <username>
```

Example:
```bash
printf "NgocNhi@1811\nNgocNhi@1811\n" | sudo smbpasswd -a hatnguyen
# Output: Added user hatnguyen.
```

**Pitfall:** Interactive prompts fail in SSH automation. Always pipe both password and retype simultaneously via `printf`.

### Phase 6: Fix Permissions

```bash
sudo chmod 755 /mnt/<mount_point>
sudo chown <username>:<username> /mnt/<mount_point>
```

Ensure the share directory is owned by the Samba user.

### Phase 7: Restart Samba Service

```bash
sudo systemctl restart smbd
sudo systemctl enable smbd
```

**Verify:**
```bash
sudo systemctl status smbd | head -n 5
# Expected: Active: active (running)
```

### Phase 8: Test Configuration

```bash
testparm /etc/samba/smb.conf
```

Look for:
- ✅ `Loaded services file OK.`
- ⚠️ Ignore warnings about unknown parameters (e.g., `apple_publish_remote_path`)
- ✅ `Server role: ROLE_STANDALONE`

**Known Samba Version Issue:** On Ubuntu 24.04+, some Apple-specific parameters may trigger warnings but still work on macOS clients. Focus on core share settings (`path`, `browseable`, `writable`, `valid users`).

### Phase 9: Firewall Setup (if needed)

Samba uses port 445/TCP by default.

```bash
sudo ufw allow from <client_network> to any port 445 proto tcp
sudo ufw reload
```

If UFW is inactive, it's not blocking traffic. Check with `sudo ufw status`.

### Phase 10: Verify Share

**Test from server (if smbtree works):**
```bash
smbtree
```

**If smbtree fails (segfault), skip and test from client:**
- ✅ Connect via Finder: `Cmd+K` → `smb://<IP>/ShareName`
- ✅ Connect via terminal: `open smb://<IP>/ShareName`
- ✅ Verify login with credentials provided in Phase 5

---

## Apple/macOS Compatibility Notes

macOS SMB clients support several optional parameters for better integration. However, on newer Samba versions (4.19+), some are ignored or cause warnings:

### Working Parameters:
```
vfs objects = fruit,xattrvfs,streams_xattr
store dos attributes = yes
create mask = 0755
directory mask = 0755
max connections = 200
```

### Ignored/Warned (Safe to Remove):
```
apple_publish_remote_path   # Samba 4.19+ ignores this
apple_unix extensions       # Triggers warnings, optional
```

**Recommendation:** On Ubuntu 24.04+, keep core Apple parameters (`vfs objects`, `store dos attributes`) but remove `apple_publish_remote_path` to avoid warnings. macOS still mounts the share correctly either way.

### Best Practice for macOS Clients:

1. **Use simple, clean config** — fewer ignored parameters = less confusion
2. **Test on actual macOS client** — some Samba 4.19+ quirks only visible with real hardware
3. **Time Machine works** — even without `apple_publish_remote_path`, macOS backs up successfully to the share

---

## Reference Files

### references/samba-config-template.conf.md
Example config file with Apple optimizations for macOS clients.

### references/ubuntu-2404-samba-notes.md
Known issues and workarounds for Samba on Ubuntu 24.04+ (segfaults, ignored parameters).

---

## Related Skills

- `terminal` — for SSH commands and remote automation
- `hagent-agent` — for broader server configuration tasks

---

## Quick Command Reference

```bash
# Check Samba service status
ssh <user>@<ip> 'sudo systemctl status smbd'

# Test share connectivity from client
open smb://100.69.50.64/My4TBShare

# View share list (if smbtree works)
ssh hatnguyen@100.69.50.64 'smbtree'

# Reset Samba password
printf "NEW_PWD\nNEW_PWD\n" | ssh hatnguyen@100.69.50.64 'sudo smbpasswd -a hatnguyen'
```
