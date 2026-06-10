"""Shared constants for Hagent Agent.

Import-safe module with no dependencies — can be imported from anywhere
without risk of circular imports.
"""

import os
from pathlib import Path
from typing import Optional, Union, Dict


_APP_ROOT = Path(__file__).resolve().parent
_AGENT_ROOT = _APP_ROOT.parent
# Fixed runtime data path for project deployment
_PROJECT_HAGENT_HOME = _APP_ROOT
_PROJECT_SKILLS_DIR = _APP_ROOT / "skills"


def get_project_home() -> Path:
    """Return the project-level HAGENT_HOME (i.e. the ``backend/`` directory).

    Unlike ``get_hagent_home()`` which is profile-scoped, this always returns
    the project root so callers can reference shared resources (config,
    memories, skills) that live at the project level rather than per-profile.
    """
    return _PROJECT_HAGENT_HOME


_profile_fallback_warned: bool = False

_DATA_DIR: Path = _APP_ROOT.parent / "data"
_LOGS_DIR: Path = _APP_ROOT.parent / "logs"


def get_data_home() -> Path:
    """Return the shared data directory (``data/`` at project root).

    All database files (``state.db``, ``kanban.db``, ``hagent.db``) and
    runtime data live here instead of ``backend/``.  Override via the
    ``HAGENT_DATA_DIR`` env var.
    """
    override = os.environ.get("HAGENT_DATA_DIR", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return _DATA_DIR.resolve()


def get_logs_home() -> Path:
    """Return the single project log directory (``logs/`` beside ``backend/``).

    Runtime logs are intentionally centralized at the repository root instead
    of profile/backend-local ``logs`` folders.
    """
    override = os.environ.get("HAGENT_LOG_DIR", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return _LOGS_DIR.resolve()


def get_tokens_home() -> Path:
    """Return the profile-scoped secret/token directory.

    Runtime credentials live under ``HAGENT_HOME/tokens/`` by default so token
    files do not spread across the profile root or plugin directories.  Custom
    deployments can override this with ``HAGENT_TOKENS_DIR``.
    """
    override = os.environ.get("HAGENT_TOKENS_DIR", "").strip()
    if override:
        return Path(override).expanduser()
    return get_hagent_home() / "tokens"


def get_token_file_path(filename: str, legacy_relative_path: Optional[str] = None) -> Path:
    """Return a token file path with read-compatible legacy fallback.

    New writes should use the returned ``tokens/<filename>`` path.  Existing
    installs that have not been migrated yet keep working because the legacy
    path is returned when it exists and the new file does not.
    """
    new_path = get_tokens_home() / filename
    legacy_path = get_hagent_home() / (legacy_relative_path or filename)
    if not new_path.exists() and legacy_path.exists():
        return legacy_path
    return new_path


def get_hagent_home() -> Path:
    """Return Hạt Nguyễn's home directory.

    Reads HAGENT_HOME when explicitly set, otherwise falls back to
    ``backend/agent`` for project-deployed state (config, sessions,
    logs, memories, etc.). Hạt Nguyễn does not use ``backend/`` as its
    default state directory.

    When ``HAGENT_HOME`` is unset but an ``active_profile`` file indicates
    a non-default profile is active, logs a loud one-shot warning to
    ``errors.log`` so cross-profile data corruption is diagnosable instead
    of silent.  Behavior is unchanged otherwise — we still return
    ``backend/`` — because raising here would brick 30+ module-level
    callers that import this at load time.  Subprocess spawners are
    expected to propagate ``HAGENT_HOME`` explicitly (see the systemd
    template in ``hagent_cli/gateway.py`` and the kanban dispatcher in
    ``hagent_cli/kanban_db.py``).  See https://github.com/HatNguyen/hagent-agent/issues/18594.
    """
    val = os.environ.get("HAGENT_HOME", "").strip()
    if val:
        return Path(val)
    return _PROJECT_HAGENT_HOME


def get_default_hagent_root() -> Path:
    """Return the root Hagent directory for profile-level operations.

    In standard deployments this is ``backend/``.

    In Docker or custom deployments where ``HAGENT_HOME`` points outside
    ``backend/`` (e.g. ``/opt/data``), returns ``HAGENT_HOME`` directly
    — that IS the root.

    In profile mode where ``HAGENT_HOME`` is ``<root>/profiles/<name>``,
    returns ``<root>`` so that ``profile list`` can see all profiles.
    Works both for standard (``backend/profiles/coder``) and Docker
    (``/opt/data/profiles/coder``) layouts.

    Import-safe — no dependencies beyond stdlib.
    """
    native_home = _PROJECT_HAGENT_HOME
    env_home = os.environ.get("HAGENT_HOME", "")
    if not env_home:
        return native_home
    env_path = Path(env_home)
    try:
        env_path.resolve().relative_to(native_home.resolve())
        # HAGENT_HOME is under backend/ (normal or profile mode)
        return native_home
    except ValueError:
        pass

    # Docker / custom deployment.
    # Check if this is a profile path: <root>/profiles/<name>
    # If the immediate parent dir is named "profiles", the root is
    # the grandparent — this covers Docker profiles correctly.
    if env_path.parent.name == "profiles":
        return env_path.parent.parent

    # Not a profile path — HAGENT_HOME itself is the root
    return env_path


def get_optional_skills_dir(default: Optional[Path] = None) -> Path:
    """Return the optional-skills directory, honoring package-manager wrappers.

    Packaged installs may ship ``optional-skills`` outside the Python package
    tree and expose it via ``HAGENT_OPTIONAL_SKILLS``.
    """
    override = os.getenv("HAGENT_OPTIONAL_SKILLS", "").strip()
    if override:
        return Path(override)
    if default is not None:
        return default
    return get_hagent_home() / "optional-skills"


def get_hagent_dir(new_subpath: str, old_name: str) -> Path:
    """Resolve a Hagent subdirectory with backward compatibility.

    New installs get the consolidated layout (e.g. ``cache/images``).
    Existing installs that already have the old path (e.g. ``image_cache``)
    keep using it — no migration required.

    Args:
        new_subpath: Preferred path relative to HAGENT_HOME (e.g. ``"cache/images"``).
        old_name: Legacy path relative to HAGENT_HOME (e.g. ``"image_cache"``).

    Returns:
        Absolute ``Path`` — old location if it exists on disk, otherwise the new one.
    """
    home = get_hagent_home()
    old_path = home / old_name
    if old_path.exists():
        return old_path
    return home / new_subpath


def display_hagent_home() -> str:
    """Return a user-friendly display string for the current HAGENT_HOME.

    Uses ``~/`` shorthand for readability::

        default:  ``backend/agent/data``
        profile:  ``backend/agent/data/profiles/coder``
        custom:   ``/opt/hagent-custom``

    Use this in **user-facing** print/log messages instead of hardcoding
    ``backend/``.  For code that needs a real ``Path``, use
    :func:`get_hagent_home` instead.
    """
    home = get_hagent_home()
    try:
        return "~/" + str(home.relative_to(Path.home()))
    except ValueError:
        return str(home)


def get_subprocess_home() -> Optional[str]:
    """Return a per-profile HOME directory for subprocesses, or None.

    When ``{HAGENT_HOME}/home/`` exists on disk, subprocesses should use it
    as ``HOME`` so system tools (git, ssh, gh, npm …) write their configs
    inside the Hagent data directory instead of the OS-level ``/root`` or
    ``~/``.  This provides:

    * **Docker persistence** — tool configs land inside the persistent volume.
    * **Profile isolation** — each profile gets its own git identity, SSH
      keys, gh tokens, etc.

    The Python process's own ``os.environ["HOME"]`` and ``Path.home()`` are
    **never** modified — only subprocess environments should inject this value.
    Activation is directory-based: if the ``home/`` subdirectory doesn't
    exist, returns ``None`` and behavior is unchanged.
    """
    hagent_home = os.getenv("HAGENT_HOME")
    if not hagent_home:
        return None
    profile_home = os.path.join(hagent_home, "home")
    if os.path.isdir(profile_home):
        return profile_home
    return None


VALID_REASONING_EFFORTS = ("minimal", "low", "medium", "high", "xhigh")


def parse_reasoning_effort(effort: str) -> Optional[dict]:
    """Parse a reasoning effort level into a config dict.

    Valid levels: "none", "minimal", "low", "medium", "high", "xhigh".
    Returns None when the input is empty or unrecognized (caller uses default).
    Returns {"enabled": False} for "none".
    Returns {"enabled": True, "effort": <level>} for valid effort levels.
    """
    if not effort or not effort.strip():
        return None
    effort = effort.strip().lower()
    if effort == "none":
        return {"enabled": False}
    if effort in VALID_REASONING_EFFORTS:
        return {"enabled": True, "effort": effort}
    return None


def is_termux() -> bool:
    """Return True when running inside a Termux (Android) environment.

    Checks ``TERMUX_VERSION`` (set by Termux) or the Termux-specific
    ``PREFIX`` path.  Import-safe — no heavy deps.
    """
    prefix = os.getenv("PREFIX", "")
    return bool(os.getenv("TERMUX_VERSION") or "com.termux/files/usr" in prefix)


_wsl_detected: Optional[bool] = None


def is_wsl() -> bool:
    """Return True when running inside WSL (Windows Subsystem for Linux).

    Checks ``/proc/version`` for the ``microsoft`` marker that both WSL1
    and WSL2 inject.  Result is cached for the process lifetime.
    Import-safe — no heavy deps.
    """
    global _wsl_detected
    if _wsl_detected is not None:
        return _wsl_detected
    try:
        with open("/proc/version", "r", encoding="utf-8") as f:
            _wsl_detected = "microsoft" in f.read().lower()
    except Exception:
        _wsl_detected = False
    return _wsl_detected


_container_detected: Optional[bool] = None


def is_container() -> bool:
    """Return True when running inside a Docker/Podman container.

    Checks ``/.dockerenv`` (Docker), ``/run/.containerenv`` (Podman),
    and ``/proc/1/cgroup`` for container runtime markers.  Result is
    cached for the process lifetime.  Import-safe — no heavy deps.
    """
    global _container_detected
    if _container_detected is not None:
        return _container_detected
    if os.path.exists("/.dockerenv"):
        _container_detected = True
        return True
    if os.path.exists("/run/.containerenv"):
        _container_detected = True
        return True
    try:
        with open("/proc/1/cgroup", "r", encoding="utf-8") as f:
            cgroup = f.read()
            if "docker" in cgroup or "podman" in cgroup or "/lxc/" in cgroup:
                _container_detected = True
                return True
    except OSError:
        pass
    _container_detected = False
    return False


# ─── Well-Known Paths ─────────────────────────────────────────────────────────


def get_config_path() -> Path:
    """Return the path to ``config.yaml`` under HAGENT_HOME.

    Falls back to the project-level config when the current profile
    does not have its own, enabling shared config across profiles.
    """
    profile_path = get_hagent_home() / "config.yaml"
    if not profile_path.exists():
        shared_path = get_project_home() / "config.yaml"
        if shared_path.exists():
            return shared_path
    return profile_path


def get_skills_dir() -> Path:
    """Return Hạt Nguyễn's in-project skills directory."""
    return _PROJECT_SKILLS_DIR



def get_env_path() -> Path:
    """Return the path to the ``.env`` file under HAGENT_HOME.

    Falls back to the project-level ``.env`` when the current profile
    does not have its own.
    """
    profile_path = get_hagent_home() / ".env"
    if not profile_path.exists():
        shared_path = get_project_home() / ".env"
        if shared_path.exists():
            return shared_path
    return profile_path


def get_session_env(key: str, default: str = "") -> str:
    """Read a session-scoped environment variable."""
    return os.environ.get(key, default)


# ─── Network Preferences ─────────────────────────────────────────────────────


def apply_ipv4_preference(force: bool = False) -> None:
    """Monkey-patch ``socket.getaddrinfo`` to prefer IPv4 connections.

    On servers with broken or unreachable IPv6, Python tries AAAA records
    first and hangs for the full TCP timeout before falling back to IPv4.
    This affects httpx, requests, urllib, the OpenAI SDK — everything that
    uses ``socket.getaddrinfo``.

    When *force* is True, patches ``getaddrinfo`` so that calls with
    ``family=AF_UNSPEC`` (the default) resolve as ``AF_INET`` instead,
    skipping IPv6 entirely.  If no A record exists, falls back to the
    original unfiltered resolution so pure-IPv6 hosts still work.

    Safe to call multiple times — only patches once.
    Set ``network.force_ipv4: true`` in ``config.yaml`` to enable.
    """
    if not force:
        return

    import socket

    # Guard against double-patching
    if getattr(socket.getaddrinfo, "_hagent_ipv4_patched", False):
        return

    _original_getaddrinfo = socket.getaddrinfo

    def _ipv4_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
        if family == 0:  # AF_UNSPEC — caller didn't request a specific family
            try:
                return _original_getaddrinfo(
                    host, port, socket.AF_INET, type, proto, flags
                )
            except socket.gaierror:
                # No A record — fall back to full resolution (pure-IPv6 hosts)
                return _original_getaddrinfo(host, port, family, type, proto, flags)
        return _original_getaddrinfo(host, port, family, type, proto, flags)

    _ipv4_getaddrinfo._hagent_ipv4_patched = True  # type: ignore[attr-defined]
    socket.getaddrinfo = _ipv4_getaddrinfo  # type: ignore[assignment]


OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_MODELS_URL = f"{OPENROUTER_BASE_URL}/models"

AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1"


# ─── .hagent directory creation guard ────────────────────────────────────────

_BANNED_PATHS = (
    Path.home() / ".hermes",
    Path.home() / (".ha" + "gent"),
)


def _guard_banned_runtime_path(path: Union[str, Path]) -> None:
    """Raise if *path* targets a banned directory or contains a ``.hagent``
    path component.

    The ``.hagent`` check is case-sensitive and applies to all path
    components (directories, not files), catching both ``~/.hagent/...``
    and ``./.hagent/...`` attempts.
    """
    try:
        candidate = Path(path).expanduser()
        if not candidate.is_absolute():
            candidate = Path.cwd() / candidate
        candidate = Path(os.path.normpath(str(candidate)))
    except Exception:
        return

    for banned in _BANNED_PATHS:
        try:
            candidate.relative_to(Path(os.path.normpath(str(banned.expanduser()))))
            raise RuntimeError(
                f"BANNED: attempted to create '{path}' inside {banned}. "
                "Hạt Nguyễn uses the in-project runtime. "
                "Update the caller to use get_hagent_home()."
            )
        except ValueError:
            pass

    # Ban .hagent as a directory component anywhere in the path
    if ".hagent" in candidate.parts:
        raise RuntimeError(
            f"BANNED: attempted to create '{path}' containing a .hagent directory. "
            "Hạt Nguyễn uses backend/ as its runtime root. "
            "Change the path to use backend/ instead of .hagent."
        )


def _patched_makedirs(name, mode=0o777, exist_ok=False):
    _guard_banned_runtime_path(name)
    return _original_makedirs(name, mode=mode, exist_ok=exist_ok)


import builtins as _builtins

_original_makedirs = os.makedirs
os.makedirs = _patched_makedirs  # type: ignore[assignment]

_original_path_mkdir = Path.mkdir


def _patched_path_mkdir(self, mode=0o777, parents=False, exist_ok=False):
    _guard_banned_runtime_path(self)
    return _original_path_mkdir(self, mode=mode, parents=parents, exist_ok=exist_ok)


Path.mkdir = _patched_path_mkdir  # type: ignore[assignment]
