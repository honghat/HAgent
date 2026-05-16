---
name: macos-filesystem-operations
description: "macOS filesystem operations: SMB mounts, permission management, volume handling."
version: 1.0.0
author: Hagent Agent
license: MIT
platforms: [macos]
metadata:
  hagent:
    tags: [macOS, Filesystem, SMB, Mounting, Network-Shares]
    related_skills: []
---

# macOS Filesystem Operations

Complete guide for mounting network shares, managing permissions, and troubleshooting filesystem operations on macOS. Each section shows the terminal approach first, then the Finder workaround when needed.

## Prerequisites

- Terminal with `mount_smbfs` (comes with macOS by default)
- Administrative privileges for some operations (handled automatically in home directory)

---

## Core Patterns

### Mounting SMB Network Shares on macOS

**Pattern 1: Terminal (mount_smbfs) - Use for PLAIN TEXT auth only**

```bash
mkdir -p ~/SMB_Share      # Create mount point BEFORE mounting
chmod 755 ~/SMB_Share     # Set permissions (no sudo needed in home dir)
mount_smbfs "//SERVER_IP/SHARE_PATH@USER:PASSWORD" ~/SMB_Share
```

✅ Works well for: Linux/Samba shares with plain text authentication  
⚠️ Limitations: 
- Cannot modify permissions on `/Volumes` (macOS protects mounted volumes)
- Fails with NTLM authentication (Windows/Ubuntu domain shares)
- Passwords with special chars (`@`, `$`, `#`) need proper escaping

**Pattern 2: Finder - RECOMMENDED for Windows/Ubuntu SMB shares**

For NTLM auth or complex scenarios, use Finder's Connect to Server:

```bash
open -a Finder                     # Opens Finder window
Cmd+K                              # Connect to Server dialog (or Menu → Go → Connect to Server)
smb://SERVER_IP/SHARE_PATH         # Paste URL in the dialog
username: USERNAME                 # Enter credentials interactively
password: PASSWORD                 # Or click "Connect" and enter in prompt
```

Finder automatically handles NTLM authentication that terminal commands cannot.

**Pattern 3: Create Persistent CDF File (for frequent access)**

```bash
# Create CDF file with server details
cat > ~/ConnectToSMBShare.cdf << 'EOF'
smb://SERVER_IP/SHARE_PATH
username: USERNAME
password: PASSWORD
EOF

# Later: Open in Finder, Menu → Go → Connect to Server, paste contents
open -a Finder
# Then Cmd+K and paste from CDF file
```

---

## Key Pitfalls (CRITICAL - DO NOT IGNORE)

### ❌ DON'T: Try chmod/chown on `/Volumes` for SMB shares

macOS **protects** mounted network volumes from permission changes via terminal. This is a system safeguard against data loss:

```bash
❌ This fails silently or returns errors:
chmod 755 /Volumes/SomeShare
chown user /Volumes/SomeShare
sudo chmod 755 /Volumes/SomeShare   # Can work but risky on some filesystems

# Why this fails: macOS mounts SMB shares read-only for security
# Solution: Create mount point BEFORE mounting with correct permissions
mkdir -p ~/SMB_Share              # In home directory, not /Volumes
chmod 755 ~/SMB_Share
mount_smbfs "..." ~/SMB_Share     # Mount to home dir instead
```

**Best practice:** Always mount network shares to a subdirectory in your home folder (`~/MyShares/...`) rather than trying to use `/Volumes`.

### ❌ DON'T: Use sudo unnecessarily on mounted shares

```bash
❌ Avoid (can break filesystem):
sudo chmod 755 /Volumes/SomeShare
sudo chown user /Volumes/SomeShare

✅ Instead: Change permissions on HOME directory before mounting
mkdir -p ~/MyShares/SMB_Folder
chmod 755 ~/MyShares/SMB_Folder
mount_smbfs "..." ~/MyShares/SMB_Folder
```

### ❌ DON'T: Assume all SMB shares use plain text auth

Windows and Ubuntu SMB shares often use **NTLM authentication** which `mount_smbfs` doesn't support. If you get "Authentication error", it's likely NTLM-based and you need to switch to Finder approach.

---

## Verification Steps

After mounting, verify the share is accessible:

```bash
# Check if mounted
ls -la ~/SMB_Share              # Should see share contents

# Check mount status and filesystem type
df -h ~/SMB_Share                # Shows "smbfs" as filesystem type

# Check mounted volume info
mount | grep smb                 # Lists all SMB mounts

# Unmount when done (via terminal)
umount ~/SMB_Share              # Or eject from Finder
```

---

## Troubleshooting Flowchart

1. **Mount fails with "Authentication error"**
   - ✅ Use Finder Connect to Server (handles NTLM auth automatically)
   - ✅ Check server IP is reachable: `ping SERVER_IP`

2. **Permission denied errors on /Volumes/**
   - ✅ Create mount point in home directory instead (`~/MyShares/`)
   - ✅ Don't chmod/chown mounted volumes from macOS terminal

3. **Password with special characters (@, $, #)**
   - ✅ Use Finder's interactive prompt (more robust for complex passwords)
   - ✅ Or quote password properly: `//IP@User:` then enter in terminal

4. **"Read-only filesystem" errors**
   - This is normal for SMB shares mounted on `/Volumes`
   - ✅ Solution: Mount to home directory instead (`~/MyShares/`)

---

## Tool Comparison

| Tool | NTLM Auth | Plain Text | Home Dir Mount | Best For |
|------|-----------|------------|----------------|----------|
| `mount_smbfs` | ❌ No | ✅ Yes | ✅ Works | Linux/Samba, simple shares |
| Finder | ✅ Yes | ✅ Yes | ⚠️ /Volumes protected | Windows/Ubuntu, all auth types |
| CDF file + Finder | ✅ Yes | ✅ Yes | ✅ Anywhere | Frequent access to same share |

**Recommendation:** Use Finder's Connect to Server for any SMB share with NTLM authentication (most Windows/Ubuntu shares). Use terminal `mount_smbfs` only for Linux/Samba shares with plain text auth.

---

## Session-Specific Notes: 4TB SMB Share Setup

These settings are pre-configured for nguyenhat's specific 4TB SMB share:

- **Server:** `//100.69.50.64/My4TBShare`
- **Username:** `hatnguyen`
- **Password:** `NgocNhi@1811`
- **Auth type:** NTLM (requires Finder or CDF file workaround)
- **Recommended mount point:** `~/SMB_Share` (not `/Volumes/`)

**Quick connect command:**
```bash
open -a Finder
# Then press Cmd+K, paste: smb://100.69.50.64/My4TBShare
# Click Connect and enter credentials in the prompt
```

---

## References
- `man mount_smbfs` - SMB mount options on macOS
- Apple Volume Mounting documentation
- Microsoft SMB for Mac troubleshooting guide