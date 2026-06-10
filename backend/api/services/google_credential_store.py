from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from api.services.db import get_connection


ROOT_DIR = Path(__file__).resolve().parents[3]
BACKEND_ENV = ROOT_DIR / "backend" / ".env"
KEY_NAME = "HAGENT_CREDENTIAL_KEY"


def _read_env_value() -> str:
    value = os.getenv(KEY_NAME, "").strip()
    if value:
        return value
    for env_path in (ROOT_DIR / ".env", BACKEND_ENV):
        if not env_path.exists():
            continue
        for raw in env_path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if line.startswith(f"{KEY_NAME}="):
                value = line.split("=", 1)[1].strip().strip('"').strip("'")
                if value:
                    return value
    return ""


def _write_backend_env(value: str) -> None:
    BACKEND_ENV.parent.mkdir(parents=True, exist_ok=True)
    lines = BACKEND_ENV.read_text(encoding="utf-8").splitlines() if BACKEND_ENV.exists() else []
    output: list[str] = []
    replaced = False
    for line in lines:
        if line.strip().startswith(f"{KEY_NAME}="):
            output.append(f'{KEY_NAME}="{value}"')
            replaced = True
        else:
            output.append(line)
    if not replaced:
        output.append(f'{KEY_NAME}="{value}"')
    BACKEND_ENV.write_text("\n".join(output).rstrip() + "\n", encoding="utf-8")
    try:
        os.chmod(BACKEND_ENV, 0o600)
    except OSError:
        pass


def _fernet() -> Fernet:
    key = _read_env_value()
    if not key:
        key = Fernet.generate_key().decode("ascii")
        _write_backend_env(key)
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, TypeError) as exc:
        raise RuntimeError(f"{KEY_NAME} không hợp lệ") from exc


def encrypt_google_credential(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return _fernet().encrypt(raw).decode("ascii")


def decrypt_google_credential(value: str) -> dict[str, Any]:
    if not value:
        return {}
    try:
        payload = json.loads(_fernet().decrypt(value.encode("ascii")).decode("utf-8"))
    except (InvalidToken, ValueError, TypeError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def load_google_credential(token_path: str) -> dict[str, Any]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT credential_encrypted FROM google_accounts WHERE token_path = ? LIMIT 1",
            (token_path,),
        ).fetchone()
    if row:
        payload = decrypt_google_credential(row["credential_encrypted"] or "")
        if payload:
            return payload
    try:
        payload = json.loads(Path(token_path).read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}
