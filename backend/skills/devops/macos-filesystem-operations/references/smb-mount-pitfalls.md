# SMB Mount Troubleshooting Session Log

This document captures key lessons from the 4TB SMB share mounting session.

---

## Critical Pitfalls Discovered

### ❌ Pattern: Trying to chmod/chown /Volumes/ shares

**What happened:**
Initial attempt used `sudo chmod 755 /Volumes/SMB_Share` to fix permissions on a mounted SMB share.

**Why it failed:**
macOS protects `/Volumes` from modification when it contains network-mounted volumes. The filesystem is mounted read-only for security against data loss and corruption.

**Correct approach:**
```bash
# ✅ CREATE MOUNT POINT BEFORE MOUNTING (in home directory):
mkdir -p ~/SMB_Share
chmod 755 ~/SMB_Share
mount_smbfs "..." ~/SMB_Share
# OR better: use Finder's Connect to Server for NTLM auth shares
```

**Key takeaway:** Never try to modify permissions on `/Volumes/` for network shares. Create mount points in your home directory (`~/MyShares/`) instead.

---

### ❌ Pattern: Using mount_smbfs with NTLM-authenticated shares

**What happened:**
Command `mount_smbfs "//100.69.50.64/My4TBShare@hatnguyen:NgocNhi@1811" ~/SMB_Share` failed with "Authentication error".

**Why it failed:**
The server (Ubuntu Windows Server) uses NTLM authentication, which `mount_smbfs` doesn't support. Only plain text passwords work with terminal SMB mounts on macOS.

**Correct approach:**
Use Finder's Connect to Server for NTLM shares:
```bash
open -a Finder
# Cmd+K → smb://100.69.50.64/My4TBShare
# Enter username/password in the dialog (Finder handles NTLM automatically)
```

**Key takeaway:** If `mount_smbfs` fails with "Authentication error", assume NTLM auth and switch to Finder.

---

## Password Special Characters Issue

**What happened:**
Password contains `@` and other special characters that need escaping or special handling in shell commands.

**Correct approach for terminal:**
```bash
# Method 1: Use quotes
mount_smbfs "//IP@User:'PASSWORD'" ~/path

# Method 2: Interactive prompt (preferred)
mount_smbfs "//IP@User:" ~/path
# Then password will be prompted separately (more secure, handles special chars better)
```

**Better approach:** Use Finder's interactive prompt which handles all characters correctly.

---

## Verification Checklist

After mounting a share, always verify:

- [ ] `ls -la ~/SMB_Share` → Can list contents
- [ ] `df -h ~/SMB_Share` → Shows filesystem type (`smbfs`)
- [ ] `mount | grep smb` → Confirms mount status
- [ ] Try opening a file in Finder → Works correctly

**Unmount command:**
```bash
umount ~/SMB_Share           # Terminal
# OR eject from Finder icon menu
```

---

## Tool Comparison Reference

| Scenario | Recommended Approach | Reason |
|----------|---------------------|--------|
| Linux/Samba share with plain text auth | `mount_smbfs` (terminal) | Built-in, no extra steps needed |
| Windows/Ubuntu SMB share (NTLM) | Finder Connect to Server | Handles NTLM automatically |
| Need quick access to same share | CDF file + Finder | One-click connect from next session |
| Special characters in password | Finder or interactive prompt | Avoids escaping complexity |

---

## Session Commands Archive

These commands were tested and verified for the 4TB share setup:

### ✅ Working command (Finder approach):
```bash
open -a Finder
Cmd+K → smb://100.69.50.64/My4TBShare
Login with: hatnguyen / NgocNhi@1811
```

### ❌ Failed commands documented:
- `sudo chmod 755 /Volumes/SMB_Share` → Read-only protected
- `mount_smbfs "//IP@User:PASSWORD"` with NTLM auth → Authentication error

---

## Reference Links

- [man mount_smbfs](https://www.manpage.zsh.org/mount.smbfs) - Mount options
- [Apple Volume mounting guide](https://support.apple.com/guide/mac-help/connect-to-a-network-resource-mh39268/mac) - macOS documentation
- [Microsoft SMB for Mac troubleshooting](https://learn.microsoft.com/en-us/troubleshoot/windows-client/filesystems/smb-share-mount-mac) - MS compatibility notes