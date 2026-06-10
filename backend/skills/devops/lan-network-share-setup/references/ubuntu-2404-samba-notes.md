# Ubuntu 24.04+ Samba Known Issues & Workarounds

This document captures known issues and workarounds for Samba on Ubuntu 24.04+ when used with macOS clients, discovered during practical SMB share setup sessions.

---

## Issue 1: `smbtree` Segfault on Ubuntu 24.04+

### Symptom
```
INTERNAL ERROR: Signal 11: Segmentation fault in smbtree () () pid ...
PANIC (pid ...): Signal 11: Segmentation fault in 4.19.5-Ubuntu
```

### Root Cause
Samba 4.19.5+ on Ubuntu 24.04 has a memory bug triggered by `smbtree`. The SMB daemon itself (`smbd`) works fine — only the diagnostic tool crashes.

### Workaround
**Skip `smbtree` entirely** and verify shares via:
- ✅ Actual client connection (Finder, terminal, Windows Explorer)
- ✅ `testparm /etc/samba/smb.conf` (shows parsed config)
- ✅ `systemctl status smbd` (service is running)

### Command Template
```bash
# DON'T use this (will segfault):
ssh user@ip 'smbtree'

# DO use this instead:
ssh user@ip 'sudo systemctl status smbd' && \
ssh user@ip 'testparm /etc/samba/smb.conf | grep -E "OK|errors"'
```

---

## Issue 2: Apple Parameters Ignored on Samba 4.19+

### Symptom
```bash
testparm /etc/samba/smb.conf
# Output:
Unknown parameter encountered: "apple_publish_remote_path"
Ignoring unknown parameter "apple_publish_remote_path"
WARNING: some services use vfs_fruit, others don't. Mounting them in conjunction on OS X clients results in undefined behaviour.
```

### Root Cause
Samba 4.19+ changed how Apple SMB extensions are handled. The `apple_publish_remote_path` parameter is deprecated/ignored but still processed by `vfs_fruit`.

### Workaround
Keep `vfs fruit` parameters for macOS compatibility (Time Machine, macOS attributes), but:
- ✅ Keep: `vfs objects = fruit,xattrvfs,streams_xattr`
- ✅ Keep: `store dos attributes = yes`
- ❌ Remove: `apple_publish_remote_path` (will be ignored anyway)

### Config Template
```ini
[ShareName]
   path = /mnt/share
   browseable = yes
   read only = no
   writable = yes
   guest ok = no
   security = user
   valid users = username
   create mask = 0755
   directory mask = 0755
   vfs objects = fruit,xattrvfs,streams_xattr
   store dos attributes = yes
   max connections = 200
```

macOS clients work fine without `apple_publish_remote_path` — Time Machine backs up successfully either way.

---

## Issue 3: Password Prompt in `smbpasswd` Fails on SSH

### Symptom
```bash
echo "password" | sudo smbpasswd -a user
# Output:
New SMB password:
Retype new SMB password:Unable to get new password.
```

### Root Cause
`smbpasswd` expects interactive input validation. Piping a single line fails because it doesn't handle the "retype" prompt properly.

### Workaround
**Send both password and retype simultaneously via `printf`:**

```bash
# Correct way:
printf "password\npassword\n" | sudo smbpasswd -a user
# Output: Added user user.
```

---

## Issue 4: Testparm Warnings About Mixed Services Using vfs_fruit

### Symptom
```bash
testparm /etc/samba/smb.conf
# Output:
WARNING: some services use vfs_fruit, others don't. Mounting them in conjunction on OS X clients results in undefined behaviour.
```

### Root Cause
Default Samba config includes a `[printers]` section without `vfs_fruit`, while your custom shares use it for macOS compatibility. This warning appears but doesn't affect functionality.

### Workaround
**Safe to ignore.** The warning is informational only. macOS clients can still mount and backup successfully. For maximum cleanliness, you could remove or comment out `[printers]` section, but this isn't necessary for typical use cases.

---

## Issue 5: `apple_publish_remote_path` Parameter Deprecated

### Symptom
```bash
# This parameter is ignored:
echo "   apple_publish_remote_path = /mnt/share" | sudo tee -a /etc/samba/smb.conf
testparm /etc/samba/smb.conf
# Output: Unknown parameter encountered: "apple_publish_remote_path"
```

### Root Cause
Samba 4.19+ deprecated this parameter in favor of the actual `path` setting. The value is ignored but accepted (with warnings).

### Workaround
**Simply remove the line.** macOS clients mount using the share's internal `path` field automatically — no need to advertise a remote path separately.

---

## Summary: Best Practice for Ubuntu 24.04+ Samba + macOS

| Parameter | Status on Samba 4.19+ | Action |
|-----------|----------------------|--------|
| `vfs objects = fruit,xattrvfs,streams_xattr` | ✅ Works | Keep |
| `store dos attributes = yes` | ✅ Works | Keep |
| `apple_publish_remote_path` | ❌ Ignored with warning | Remove |
| `apple_unix extensions` | ⚠️ Optional | Can remove to reduce warnings |
| Core share parameters (`path`, `browseable`, etc.) | ✅ Essential | Always keep |

---

## Testing Checklist

Before declaring a setup complete:

- [ ] `systemctl status smbd` → Active (running)
- [ ] `testparm /etc/samba/smb.conf` → "Loaded services file OK" (warnings are OK)
- [ ] Connect via Finder: `Cmd+K` → `smb://<IP>/ShareName` → Login works
- [ ] Write a test file from macOS client → Appears on server at `/mnt/share/`
- [ ] Time Machine backup works (if using for that purpose)

**If `smbtree` segfaults, skip it.** It's not needed for verification.

---

## References

- Samba 4.19+ release notes: https://wiki.samba.org/index.php/Samba_4.19
- vfs_fruit module docs: https://www.samba.org/samba/docs/current/man-html/smb.conf.5.html
- macOS SMB mount behavior: Apple Technical Note TN2187
