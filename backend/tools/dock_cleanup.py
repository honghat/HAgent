from __future__ import annotations

import logging
import os
import plistlib
import subprocess
import sys
import time
from pathlib import Path

logger = logging.getLogger(__name__)

_last_browser_dock_cleanup_at = 0.0


def remove_browser_apps_from_dock() -> None:
    """Best-effort macOS Dock cleanup for local browser automation."""
    global _last_browser_dock_cleanup_at
    if sys.platform != "darwin":
        return

    # Restarting Dock is visually noisy on macOS. Keep this cleanup opt-in so
    # browser sessions do not make the user's Dock flash during normal agent use.
    if os.environ.get("HAGENT_BROWSER_DOCK_CLEANUP", "0").strip().lower() not in {
        "1",
        "true",
        "yes",
        "on",
    }:
        return

    now = time.time()
    if now - _last_browser_dock_cleanup_at < 2:
        return
    _last_browser_dock_cleanup_at = now

    try:
        import pwd

        target_uid = int(os.environ.get("SUDO_UID", os.environ.get("PKEXEC_UID", "0")))
        if target_uid <= 0:
            try:
                target_uid = os.stat("/dev/console").st_uid
            except (OSError, AttributeError):
                target_uid = os.getuid()
        try:
            user_home = Path(pwd.getpwuid(target_uid).pw_dir)
        except (KeyError, AttributeError):
            user_home = Path.home()

        dock_plist = user_home / "Library" / "Preferences" / "com.apple.dock.plist"
        if not dock_plist.exists():
            return

        with dock_plist.open("rb") as fh:
            plist = plistlib.load(fh)

        changed = False
        pinned_needles = (
            "agent-browser",
            "chromium",
            "chrome for testing",
            "playwright",
            "camofox",
            "camoufox",
        )
        recent_needles = pinned_needles + (
            "chrome",
            "google chrome",
            "headless chrome",
            "firefox",
        )
        for key in ("persistent-apps", "persistent-others", "recent-apps"):
            items = plist.get(key, [])
            if not isinstance(items, list):
                continue
            needles = recent_needles if key == "recent-apps" else pinned_needles
            filtered = []
            for item in items:
                tile = item.get("tile-data", {}) if isinstance(item, dict) else {}
                haystack = " ".join(
                    str(tile.get(field, ""))
                    for field in ("file-label", "_CFURLString", "bundle-identifier")
                ).lower()
                if any(needle in haystack for needle in needles):
                    changed = True
                    continue
                filtered.append(item)
            plist[key] = filtered

        if changed:
            with dock_plist.open("wb") as fh:
                plistlib.dump(plist, fh)
            _restart_dock(target_uid)
    except Exception as exc:
        logger.debug("Browser Dock cleanup failed: %s", exc)


def _restart_dock(target_uid: int) -> None:
    dock_cmd = ["killall", "Dock"]
    if target_uid != os.getuid():
        dock_cmd = ["launchctl", "asuser", str(target_uid)] + dock_cmd
    subprocess.run(
        dock_cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
