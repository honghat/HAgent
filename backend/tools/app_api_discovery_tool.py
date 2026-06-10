"""Read-only discovery of API endpoints embedded in installed macOS apps."""

from __future__ import annotations

import os
import plistlib
import re
import subprocess
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from tools.registry import registry, tool_error, tool_result


_APP_ROOTS = (Path("/Applications"), Path.home() / "Applications")
_TEXT_SUFFIXES = {
    ".conf",
    ".dart",
    ".html",
    ".js",
    ".json",
    ".plist",
    ".strings",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
}
_SKIP_PARTS = {"_CodeSignature", "SC_Info"}
_URL_RE = re.compile(r"https?://[^\s\"'<>\\]+", re.IGNORECASE)
_HOST_RE = re.compile(
    r"(?<![@\w-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+"
    r"(?:app|cloud|co|com|dev|io|me|net|org|vn)(?![\w-])",
    re.IGNORECASE,
)
_API_PATH_RE = re.compile(
    r"(?<![\w.-])/(?:api(?:/v?\d+)?|graphql|initmanga/v\d+|rest/v\d+|"
    r"v\d+|wp-json|wp/v\d+)(?:/[a-z0-9_.~!$&'()*+,;=:@%{}-]+)*/?",
    re.IGNORECASE,
)
_NOISY_HOSTS = {
    "api.flutter.dev",
    "developer.apple.com",
    "developer.mozilla.org",
    "docs.flutter.dev",
    "fonts.gstatic.com",
    "github.com",
    "pub.dev",
}


def _run(command: list[str], timeout: int = 20) -> subprocess.CompletedProcess:
    return subprocess.run(
        command,
        capture_output=True,
        text=True,
        errors="replace",
        timeout=timeout,
        check=False,
    )


def _resolve_app(app: str) -> Path | None:
    raw = (app or "").strip()
    if not raw:
        return None

    direct = Path(raw).expanduser()
    if direct.exists() and direct.is_dir():
        return direct.resolve()

    wanted = direct.name
    if not wanted.lower().endswith(".app"):
        wanted += ".app"
    for root in _APP_ROOTS:
        exact = root / wanted
        if exact.exists():
            return exact.resolve()
        if root.exists():
            for candidate in root.glob("*.app"):
                if candidate.name.casefold() == wanted.casefold():
                    return candidate.resolve()

    try:
        result = _run(
            [
                "mdfind",
                "kMDItemContentType == 'com.apple.application-bundle' && "
                f"kMDItemDisplayName == '{Path(wanted).stem}'cd",
            ],
            timeout=10,
        )
        for line in result.stdout.splitlines():
            candidate = Path(line.strip())
            if candidate.exists():
                return candidate.resolve()
    except (OSError, subprocess.TimeoutExpired):
        pass
    return None


def _file_priority(path: Path) -> tuple[int, int, str]:
    path_text = path.as_posix()
    name = path.name.casefold()
    if "/Frameworks/App.framework/App" in path_text or name in {"runner", "app"}:
        priority = 0
    elif path.suffix.casefold() in _TEXT_SUFFIXES:
        priority = 1
    elif not path.suffix or os.access(path, os.X_OK):
        priority = 2
    else:
        priority = 3
    try:
        size = path.stat().st_size
    except OSError:
        size = 0
    return priority, size, path_text


def _candidate_files(app_path: Path, max_files: int) -> list[Path]:
    candidates: list[Path] = []
    for path in app_path.rglob("*"):
        if not path.is_file() or any(part in _SKIP_PARTS for part in path.parts):
            continue
        try:
            size = path.stat().st_size
        except OSError:
            continue
        if size == 0 or size > 200 * 1024 * 1024:
            continue
        if (
            path.suffix.casefold() in _TEXT_SUFFIXES
            or not path.suffix
            or os.access(path, os.X_OK)
        ):
            candidates.append(path)
    return sorted(candidates, key=_file_priority)[:max_files]


def _strings_from_file(path: Path) -> str:
    try:
        result = _run(["strings", "-a", str(path)])
        return result.stdout
    except (OSError, subprocess.TimeoutExpired):
        return ""


def _clean_url(value: str) -> str | None:
    value = value.rstrip(".,;:!?)]}").strip()
    try:
        parsed = urlsplit(value)
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return None
    host = f"[{parsed.hostname}]" if ":" in parsed.hostname else parsed.hostname
    try:
        netloc = f"{host}:{parsed.port}" if parsed.port else host
    except ValueError:
        netloc = host
    path = parsed.path.rstrip("/") or ""
    return urlunsplit((parsed.scheme, netloc, path, "", ""))


def _extract_matches(text: str) -> tuple[set[str], set[str], set[str]]:
    urls = {_clean_url(match.group(0)) for match in _URL_RE.finditer(text)}
    urls.discard(None)
    paths = {match.group(0).rstrip("/") or "/" for match in _API_PATH_RE.finditer(text)}
    hosts = {match.group(0).casefold() for match in _HOST_RE.finditer(text)}
    hosts.update(urlsplit(url).hostname or "" for url in urls)
    hosts.discard("")
    return urls, paths, hosts


def _plist_executables(app_path: Path) -> set[str]:
    names: set[str] = {app_path.stem}
    for plist_path in app_path.rglob("Info.plist"):
        if plist_path.parent.suffix.casefold() != ".app":
            continue
        try:
            with plist_path.open("rb") as handle:
                data = plistlib.load(handle)
        except (OSError, plistlib.InvalidFileException):
            continue
        for key in ("CFBundleExecutable", "CFBundleDisplayName", "CFBundleName"):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                names.add(value.strip())
    return names


def _live_connections(app_path: Path) -> tuple[list[dict], list[str]]:
    process_names = _plist_executables(app_path)
    folded_names = {name.casefold() for name in process_names}
    try:
        ps_result = _run(["ps", "-axo", "pid=,comm="], timeout=10)
    except (OSError, subprocess.TimeoutExpired):
        return [], []

    processes: list[dict] = []
    for line in ps_result.stdout.splitlines():
        stripped = line.strip()
        pid_text, _, command = stripped.partition(" ")
        if not pid_text.isdigit():
            continue
        executable = Path(command.strip()).name
        if executable.casefold() not in folded_names:
            continue
        processes.append({"pid": int(pid_text), "executable": executable, "command": command.strip()})

    connections: set[str] = set()
    for process in processes[:10]:
        try:
            result = _run(
                [
                    "lsof",
                    "-nP",
                    "-a",
                    "-p",
                    str(process["pid"]),
                    "-iTCP",
                    "-sTCP:ESTABLISHED",
                ],
                timeout=10,
            )
        except (OSError, subprocess.TimeoutExpired):
            continue
        for line in result.stdout.splitlines()[1:]:
            match = re.search(r"TCP\s+(.+?)\s+\(ESTABLISHED\)", line)
            if match:
                connections.add(match.group(1))
    return processes, sorted(connections)


def discover_app_apis(app: str, include_live_connections: bool = True, limit: int = 100):
    """Find URL bases, API paths, hosts, and live TCP connections for a macOS app."""
    app_path = _resolve_app(app)
    if app_path is None:
        return tool_error(f"Không tìm thấy app: {app}")

    safe_limit = min(max(int(limit or 100), 10), 300)
    evidence: dict[str, set[str]] = defaultdict(set)
    urls: set[str] = set()
    paths: set[str] = set()
    hosts: set[str] = set()
    candidates = _candidate_files(app_path, max_files=max(safe_limit * 2, 120))

    for path in candidates:
        file_urls, file_paths, file_hosts = _extract_matches(_strings_from_file(path))
        if not file_urls and not file_paths and not file_hosts:
            continue
        relative = path.relative_to(app_path).as_posix()
        matches = sorted(file_urls | file_paths)
        evidence[relative].update(matches[:20])
        urls.update(file_urls)
        paths.update(file_paths)
        hosts.update(file_hosts)

    processes: list[dict] = []
    connections: list[str] = []
    if include_live_connections:
        processes, connections = _live_connections(app_path)

    likely_hosts = sorted(host for host in hosts if host not in _NOISY_HOSTS)
    api_base_urls = sorted(
        url
        for url in urls
        if (urlsplit(url).hostname or "") not in _NOISY_HOSTS
        if re.search(r"(?:^|[./-])(api|graphql|rest|wp-json)(?:[./-]|$)", url, re.IGNORECASE)
    )
    return tool_result(
        {
            "app_path": str(app_path),
            "scanned_files": len(candidates),
            "api_base_urls": api_base_urls[:safe_limit],
            "base_urls": sorted(urls)[:safe_limit],
            "api_paths": sorted(paths)[:safe_limit],
            "likely_hosts": likely_hosts[:safe_limit],
            "running_processes": processes[:20],
            "live_connections": connections[:safe_limit],
            "evidence": [
                {"file": source, "matches": sorted(matches)}
                for source, matches in sorted(evidence.items())
            ][:30],
            "note": "Static scan strips query strings/fragments and does not extract credentials.",
        }
    )


registry.register(
    name="discover_app_apis",
    toolset="terminal",
    schema={
        "name": "discover_app_apis",
        "description": (
            "Phân tích read-only một ứng dụng macOS để tìm base URL, API path, "
            "domain nhúng trong bundle và kết nối TCP đang mở."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "app": {
                    "type": "string",
                    "description": "Tên app hoặc đường dẫn .app, ví dụ TruyenCV.",
                },
                "include_live_connections": {
                    "type": "boolean",
                    "default": True,
                    "description": "Có đọc tiến trình và kết nối TCP đang mở hay không.",
                },
                "limit": {
                    "type": "integer",
                    "default": 100,
                    "minimum": 10,
                    "maximum": 300,
                },
            },
            "required": ["app"],
        },
    },
    handler=lambda args, **_: discover_app_apis(
        app=args.get("app", ""),
        include_live_connections=bool(args.get("include_live_connections", True)),
        limit=args.get("limit", 100),
    ),
    emoji="🔎",
    max_result_size_chars=50_000,
    plan_safe=True,
)
