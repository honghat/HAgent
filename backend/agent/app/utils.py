from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import yaml


def atomic_replace(src: str | os.PathLike, dst: str | os.PathLike) -> None:
    os.replace(src, dst)


def atomic_write_text(path: str | os.PathLike, text: str) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".tmp", dir=str(target.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        atomic_replace(tmp, target)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def atomic_json_write(path: str | os.PathLike, data, **kwargs) -> None:
    text = json.dumps(data, ensure_ascii=False, indent=2, **kwargs)
    atomic_write_text(path, text + "\n")


def atomic_yaml_write(path: str | os.PathLike, data, **kwargs) -> None:
    text = yaml.safe_dump(data, sort_keys=False, allow_unicode=True, **kwargs)
    atomic_write_text(path, text)


def is_truthy_value(value) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on", "enable", "enabled"}


def env_var_enabled(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    return default if value is None else is_truthy_value(value)


def base_url_hostname(base_url: str | None) -> str:
    if not base_url:
        return ""
    parsed = urlparse(base_url if "://" in base_url else f"http://{base_url}")
    return (parsed.hostname or "").lower()


def base_url_host_matches(base_url: str | None, *hosts: str) -> bool:
    hostname = base_url_hostname(base_url)
    normalized = {str(host).lower() for host in hosts if host}
    return hostname in normalized or any(hostname.endswith(f".{host}") for host in normalized)


def normalize_proxy_url(url: str | None) -> str:
    if not url:
        return ""
    parsed = urlparse(url)
    if not parsed.scheme:
        parsed = urlparse(f"http://{url}")
    return urlunparse(parsed._replace(path=parsed.path.rstrip("/")))


def normalize_proxy_env_vars() -> None:
    for name in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"):
        if os.getenv(name):
            os.environ[name] = normalize_proxy_url(os.environ[name])


def safe_json_loads(value, default=None):
    try:
        return json.loads(value)
    except Exception:
        return default
