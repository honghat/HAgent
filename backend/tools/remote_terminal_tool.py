"""Remote terminal tool: run arbitrary commands on a remote server via SSH."""

import asyncio
import json
import logging
import os
from typing import Dict, Any

from .registry import registry

logger = logging.getLogger(__name__)

SSH_HOST = os.environ.get("SSH_REMOTE_HOST", "")
SSH_USER = os.environ.get("SSH_REMOTE_USER", "")
SSH_PORT = os.environ.get("SSH_REMOTE_PORT", "22")


async def _ssh_exec(command: str, timeout: int = 60) -> dict:
    """Execute a command on the remote server via SSH and return result."""
    if not SSH_HOST or not SSH_USER:
        return {"output": "SSH_REMOTE_HOST and SSH_REMOTE_USER not configured in .env", "exit_code": 1}

    try:
        ssh_cmd = [
            "ssh", "-o", "StrictHostKeyChecking=accept-new",
            "-o", "ConnectTimeout=10",
            "-p", SSH_PORT,
            f"{SSH_USER}@{SSH_HOST}",
            command,
        ]

        proc = await asyncio.create_subprocess_exec(
            *ssh_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            return {"output": f"Command timed out after {timeout}s", "exit_code": 124}

        out = (stdout or b"").decode("utf-8", errors="replace").strip()
        err = (stderr or b"").decode("utf-8", errors="replace").strip()
        output = f"{out}\n{err}" if err else out

        return {"output": output.strip(), "exit_code": proc.returncode or 0}

    except Exception as e:
        logger.exception("SSH exec failed")
        return {"output": f"SSH error: {str(e)}", "exit_code": -1}


async def _handle_remote_terminal(args: Dict[str, Any], **kwargs) -> str:
    command = args.get("command", "")
    timeout = args.get("timeout", 60)

    if not command:
        return json.dumps({"output": "Please provide a command to run", "exit_code": 1}, ensure_ascii=False)

    result = await _ssh_exec(command, timeout=timeout)
    return json.dumps(result, ensure_ascii=False)


REMOTE_TERMINAL_SCHEMA = {
    "name": "remote_terminal",
    "description": "Run commands on a remote server via SSH. Use for server administration, status checks, deployment, etc.",
    "parameters": {
        "type": "object",
        "properties": {
            "command": {
                "type": "string",
                "description": "Command to run on the remote server (e.g. 'ls -la', 'systemctl status nginx', 'docker ps')",
            },
            "timeout": {
                "type": "integer",
                "description": "Max wait time in seconds, default 60",
                "default": 60,
            },
        },
        "required": ["command"],
    },
}


def _check_remote_terminal_requirements() -> bool:
    """Check if SSH config is available."""
    return bool(SSH_HOST and SSH_USER)


registry.register(
    name="remote_terminal",
    toolset="remote",
    schema=REMOTE_TERMINAL_SCHEMA,
    handler=_handle_remote_terminal,
    check_fn=_check_remote_terminal_requirements,
    is_async=True,
    emoji="🖥️",
    max_result_size_chars=100_000,
)
