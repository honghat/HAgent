"""Policy checks for HAgent Wiki memory."""

from __future__ import annotations

import re


_GIT_PATTERNS = [
    re.compile(r"\b(?:git|git-[a-z0-9_-]+)\b", re.IGNORECASE),
    re.compile(r"(?:^|[\\/])\.git(?:[\\/]|$)", re.IGNORECASE),
    re.compile(r"^diff --git\s+", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^index [0-9a-f]{7,40}\.\.[0-9a-f]{7,40}", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^(?:---|\+\+\+) [ab]/", re.MULTILINE),
    re.compile(r"^commit [0-9a-f]{7,40}$", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^(?:On branch|Changes not staged|Untracked files):", re.IGNORECASE | re.MULTILINE),
]

GIT_WIKI_BLOCK_REASON = "Wiki entries must not contain git repository data or git-related notes."


def contains_git_material(*values: object) -> bool:
    """Return True when a wiki payload appears to contain git-related material.

    The user's preference is strict: git operational data should stay out of
    the private Wiki.  This catches exact ``git`` mentions, .git paths, diffs,
    commit output, and common ``git status`` snippets while leaving unrelated
    words such as ``digital`` or ``GitHub`` alone.
    """

    text = "\n".join(_flatten(values))
    return any(pattern.search(text) for pattern in _GIT_PATTERNS)


def _flatten(values: tuple[object, ...]) -> list[str]:
    flattened: list[str] = []
    for value in values:
        if value is None:
            continue
        if isinstance(value, dict):
            flattened.extend(_flatten(tuple(value.values())))
        elif isinstance(value, (list, tuple, set)):
            flattened.extend(_flatten(tuple(value)))
        else:
            flattened.append(str(value))
    return flattened
