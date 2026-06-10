"""Workspace file placement policy for agent-created files.

The policy is intentionally stricter for new files than for edits. Existing
files may already live where the project put them; new files must either match
an explicit placement type or land in a conventional project directory.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


WORKSPACE_ROOT = Path(
    os.environ.get("HAGENT_WORKSPACE_ROOT")
    or Path(__file__).resolve().parents[2]
).resolve()

POLICY_ENV = "HAGENT_FILE_PLACEMENT_POLICY"

PLACEMENT_RULES: dict[str, tuple[str, ...]] = {
    "backend_api": ("backend/api",),
    "backend_api_router": ("backend/api/routers",),
    "backend_api_service": ("backend/api/services",),
    "backend_agent": ("backend/agent",),
    "backend_tool": ("backend/tools",),
    "backend_plugin": ("backend/plugins",),
    "backend_cli": ("backend/hagent_cli",),
    "backend_service": ("backend/services",),
    "frontend_component": ("frontend/src/components",),
    "frontend_hook": ("frontend/src/hooks",),
    "frontend_lib": ("frontend/src/lib",),
    "frontend_api": ("frontend/src/api", "frontend/src/api.js"),
    "frontend_route": ("frontend/src/routes",),
    "learn_app": ("learn/src", "learn/public", "learn/prisma"),
    "script": ("scripts",),
    "docs": ("docs", "README.md", "CLAUDE.md", "AGENTS.md", "backend/SOUL.md"),
    "test": ("tests", "backend/tests", "frontend/src/__tests__", "learn/src/__tests__"),
    "config": (
        ".env.example",
        "frontend",
        "learn",
        "backend",
        "scripts",
        "pyproject.toml",
        "package.json",
    ),
}

KNOWN_PLACEMENT_TYPES = frozenset(PLACEMENT_RULES)

_CODE_EXTENSIONS = {
    ".py",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".css",
    ".scss",
    ".mjs",
    ".cjs",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
}

_SHELL_WRITE_RE = re.compile(
    r"(?:^|[;&|]\s*)(?:cat|tee|printf|echo)\b[\s\S]*(?:>|>>)\s*(?P<path>[^\s;&|]+)"
)


@dataclass(frozen=True)
class PlacementDecision:
    allowed: bool
    reason: str = ""
    placement_type: str = ""
    relative_path: str = ""


def is_policy_enabled() -> bool:
    raw = os.environ.get(POLICY_ENV, "1").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def workspace_root() -> Path:
    return WORKSPACE_ROOT


def relative_to_workspace(path: str | Path, cwd: str | None = None) -> str | None:
    candidate = Path(path).expanduser()
    if not candidate.is_absolute():
        base = Path(cwd).expanduser() if cwd else WORKSPACE_ROOT
        candidate = base / candidate
    try:
        resolved = candidate.resolve(strict=False)
        return resolved.relative_to(WORKSPACE_ROOT).as_posix()
    except (OSError, ValueError):
        return None


def _matches_any(rel_path: str, allowed: Iterable[str]) -> bool:
    normalized = rel_path.strip("/")
    for entry in allowed:
        rule = entry.strip("/")
        if not rule:
            continue
        if normalized == rule or normalized.startswith(rule + "/"):
            return True
    return False


def _looks_like_fastapi(content: str) -> bool:
    return any(token in content for token in ("FastAPI", "APIRouter", "@router."))


def _looks_like_react(content: str, suffix: str) -> bool:
    if suffix in {".jsx", ".tsx"}:
        return True
    return any(token in content for token in ("from 'react'", 'from "react"', "useState(", "jsx"))


def infer_placement_type(path: str | Path, content: str = "") -> str:
    p = Path(path)
    suffix = p.suffix.lower()
    name = p.name.lower()
    text = content or ""

    if name.startswith("test_") or name.endswith((".test.js", ".test.jsx", ".test.ts", ".test.tsx")):
        return "test"
    if suffix in {".md", ".mdx", ".rst"}:
        return "docs"
    if suffix in {".sh", ".bash"}:
        return "script"
    if _looks_like_react(text, suffix):
        return "frontend_component"
    if suffix == ".py" and _looks_like_fastapi(text):
        return "backend_api"
    if suffix == ".py" and ("registry.register" in text or "plan_safe" in text):
        return "backend_tool"
    if suffix == ".py" and ("Provider" in text or "plugin" in text.lower()):
        return "backend_plugin"
    if suffix in {".json", ".yaml", ".yml", ".toml"}:
        return "config"
    if suffix == ".py":
        return "backend_service"
    if suffix in {".js", ".ts", ".mjs", ".cjs"}:
        return "script"
    return ""


def validate_new_file_path(
    path: str | Path,
    *,
    content: str = "",
    cwd: str | None = None,
    placement_type: str | None = None,
) -> PlacementDecision:
    """Validate placement for a file that does not already exist."""
    if not is_policy_enabled():
        return PlacementDecision(True, reason="policy disabled")

    rel = relative_to_workspace(path, cwd=cwd)
    if rel is None:
        suffix = Path(path).suffix.lower()
        if suffix in _CODE_EXTENSIONS:
            return PlacementDecision(
                False,
                reason=(
                    f"New code/config files must be created inside workspace "
                    f"{WORKSPACE_ROOT}. Target was outside: {path}"
                ),
            )
        return PlacementDecision(True, reason="outside workspace non-code file")

    requested = (placement_type or "").strip()
    inferred = requested or infer_placement_type(path, content)
    if requested and requested not in KNOWN_PLACEMENT_TYPES:
        known = ", ".join(sorted(KNOWN_PLACEMENT_TYPES))
        return PlacementDecision(
            False,
            reason=f"Unknown placement_type '{requested}'. Use one of: {known}",
            relative_path=rel,
        )

    if not inferred:
        return PlacementDecision(True, reason="no strict placement inferred", relative_path=rel)

    allowed = PLACEMENT_RULES[inferred]
    if _matches_any(rel, allowed):
        return PlacementDecision(True, placement_type=inferred, relative_path=rel)

    return PlacementDecision(
        False,
        reason=(
            f"New file placement mismatch: '{rel}' was classified as "
            f"'{inferred}', so it must be under one of: {', '.join(allowed)}. "
            "Choose the correct project directory or pass the correct placement_type."
        ),
        placement_type=inferred,
        relative_path=rel,
    )


def extract_direct_shell_write_targets(command: str) -> list[str]:
    """Best-effort target extraction for simple shell file creation commands."""
    targets: list[str] = []
    for match in _SHELL_WRITE_RE.finditer(command or ""):
        target = match.group("path").strip().strip("'\"")
        if target:
            targets.append(target)
    return targets


def validate_shell_file_creation(command: str, *, cwd: str | None = None) -> PlacementDecision:
    """Guard simple terminal attempts to create files via redirection."""
    if not is_policy_enabled():
        return PlacementDecision(True, reason="policy disabled")

    for target in extract_direct_shell_write_targets(command):
        decision = validate_new_file_path(target, cwd=cwd)
        if not decision.allowed:
            return decision
    return PlacementDecision(True)
