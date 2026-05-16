"""Resolve HAGENT_HOME for standalone skill scripts.

Skill scripts may run outside the Hagent process (e.g. system Python,
nix env, CI) where ``hagent_constants`` is not importable.  This module
provides the same ``get_hagent_home()`` and ``display_hagent_home()``
contracts as ``hagent_constants`` without requiring it on ``sys.path``.

When ``hagent_constants`` IS available it is used directly so that any
future enhancements (profile resolution, Docker detection, etc.) are
picked up automatically.  The fallback path replicates the core logic
from ``hagent_constants.py`` using only the stdlib.

All scripts under ``google-workspace/scripts/`` should import from here
instead of duplicating the ``HAGENT_HOME = Path(os.getenv(...))`` pattern.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from hagent_constants import display_hagent_home as display_hagent_home
    from hagent_constants import get_hagent_home as get_hagent_home
except (ModuleNotFoundError, ImportError):

    def get_hagent_home() -> Path:
        """Return the HAgent runtime directory.

        Mirrors ``hagent_constants.get_hagent_home()``."""
        val = os.environ.get("HAGENT_HOME", "").strip()
        return Path(val) if val else Path(__file__).resolve().parents[4]

    def display_hagent_home() -> str:
        """Return a user-friendly ``~/``-shortened display string.

        Mirrors ``hagent_constants.display_hagent_home()``."""
        home = get_hagent_home()
        try:
            return "~/" + str(home.relative_to(Path.home()))
        except ValueError:
            return str(home)
