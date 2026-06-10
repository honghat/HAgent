from __future__ import annotations

from typing import Any

import yaml

from hagent_constants import get_config_path
from utils import atomic_write_text


DEFAULT_COMPRESSION = {
    "enabled": True,
    "threshold": 0.50,
    "target_ratio": 0.20,
    "protect_last_n": 20,
    "hygiene_hard_message_limit": 400,
}


def _read_config() -> dict[str, Any]:
    path = get_config_path()
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        atomic_write_text(path, "{}\n")
    parsed = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return parsed if isinstance(parsed, dict) else {}


def _write_config(config: dict[str, Any]) -> None:
    text = yaml.safe_dump(
        config,
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
    )
    path = get_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_text(path, text)


def _as_bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return default


def _as_float(value: Any, default: float, *, lower: float, upper: float) -> float:
    try:
        number = float(value)
    except Exception:
        number = default
    return max(lower, min(number, upper))


def _as_int(value: Any, default: int, *, lower: int, upper: int) -> int:
    try:
        number = int(value)
    except Exception:
        number = default
    return max(lower, min(number, upper))


def _normalise_compression(raw: dict[str, Any] | None) -> dict[str, Any]:
    source = raw if isinstance(raw, dict) else {}
    return {
        "enabled": _as_bool(source.get("enabled"), DEFAULT_COMPRESSION["enabled"]),
        "threshold": _as_float(
            source.get("threshold"),
            DEFAULT_COMPRESSION["threshold"],
            lower=0.50,
            upper=0.95,
        ),
        "target_ratio": _as_float(
            source.get("target_ratio"),
            DEFAULT_COMPRESSION["target_ratio"],
            lower=0.10,
            upper=0.80,
        ),
        "protect_last_n": _as_int(
            source.get("protect_last_n"),
            DEFAULT_COMPRESSION["protect_last_n"],
            lower=4,
            upper=80,
        ),
        "hygiene_hard_message_limit": _as_int(
            source.get("hygiene_hard_message_limit"),
            DEFAULT_COMPRESSION["hygiene_hard_message_limit"],
            lower=80,
            upper=2000,
        ),
    }


def get_compaction_status() -> dict[str, Any]:
    config = _read_config()
    compression = _normalise_compression(config.get("compression"))
    context_cfg = config.get("context") if isinstance(config.get("context"), dict) else {}
    model_cfg = config.get("model") if isinstance(config.get("model"), dict) else {}
    engine = str(context_cfg.get("engine") or "compressor")
    return {
        "auto_compacting": bool(compression["enabled"]),
        "engine": engine,
        "compression": compression,
        "model_context_length": model_cfg.get("context_length"),
        "config_path": str(get_config_path()),
        "notes": [
            "Agent tự compact khi prompt token vượt ngưỡng cấu hình.",
            "Context cũ được tóm tắt, tail gần nhất vẫn được giữ lại để tiếp tục công việc.",
            "Khi session bị compact, goal đang chạy được chuyển sang session mới.",
        ],
    }


def update_compaction_config(updates: dict[str, Any]) -> dict[str, Any]:
    config = _read_config()
    compression = _normalise_compression(config.get("compression"))

    for key in DEFAULT_COMPRESSION:
        if key in updates:
            compression[key] = updates[key]
    compression = _normalise_compression(compression)

    config["compression"] = {
        **(config.get("compression") if isinstance(config.get("compression"), dict) else {}),
        **compression,
    }
    context_cfg = config.get("context") if isinstance(config.get("context"), dict) else {}
    context_cfg.setdefault("engine", "compressor")
    config["context"] = context_cfg

    _write_config(config)
    return get_compaction_status()
