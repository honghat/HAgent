"""Task tools ported from JS: background task management via subprocess."""

import asyncio
import time
from typing import Dict, Any
from .registry import registry

_tasks = {}
_task_id_counter = 0


async def _handle_task_start(args: Dict[str, Any], **kwargs) -> str:
    global _task_id_counter
    command = args.get("command", "")
    cmd_args = args.get("args", "")
    timeout = int(args.get("timeout", 30000))
    if not command:
        return "Thieu lenh."
    _task_id_counter += 1
    tid = _task_id_counter
    import shlex
    if isinstance(cmd_args, str) and cmd_args.strip():
        cmd_list = [command] + shlex.split(cmd_args)
    elif isinstance(cmd_args, list):
        cmd_list = [command] + cmd_args
    else:
        cmd_list = [command]

    async def _run():
        proc = await asyncio.create_subprocess_exec(
            *cmd_list,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout/1000)
        except asyncio.TimeoutError:
            proc.kill()
            stdout, stderr = await proc.communicate()
            _tasks[tid]["done"] = True
            _tasks[tid]["exit_code"] = -1
            _tasks[tid]["stdout"] = (stdout or b"").decode("utf-8", errors="replace") + "\n[TIMEOUT]"
            _tasks[tid]["stderr"] = (stderr or b"").decode("utf-8", errors="replace")
            return
        _tasks[tid]["done"] = True
        _tasks[tid]["exit_code"] = proc.returncode
        _tasks[tid]["stdout"] = (stdout or b"").decode("utf-8", errors="replace")
        _tasks[tid]["stderr"] = (stderr or b"").decode("utf-8", errors="replace")

    _tasks[tid] = {
        "id": tid, "command": command, "args": cmd_args,
        "stdout": "", "stderr": "", "done": False, "exit_code": None,
        "start_time": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    asyncio.create_task(_run())
    return f"Task #{tid} started: {command} {' '.join(cmd_list[1:])}"


async def _handle_task_output(args: Dict[str, Any], **kwargs) -> str:
    tid = int(args.get("id", 0))
    task = _tasks.get(tid)
    if not task:
        active = ", ".join(str(k) for k in _tasks) or "khong co"
        return f"Khong tim thay task #{tid}. Tasks: {active}"
    status = f"done (exit: {task['exit_code']})" if task["done"] else "running"
    parts = [f"Task #{task['id']}: {task['command']} {task.get('args') or ''}",
             f"Status: {status}"]
    if task["stdout"]:
        parts.append(f"STDOUT:\n{task['stdout'][:2000]}")
    if task["stderr"]:
        parts.append(f"STDERR:\n{task['stderr'][:1000]}")
    return "\n".join(parts)


async def _handle_task_stop(args: Dict[str, Any], **kwargs) -> str:
    tid = args.get("id")
    if not tid:
        count = 0
        for t in _tasks.values():
            if not t["done"]:
                count += 1
        _tasks.clear()
        return f"Da dung tat ca {count} tasks."
    tid = int(tid)
    task = _tasks.get(tid)
    if not task:
        return f"Khong tim thay task #{tid}"
    if task["done"]:
        return f"Task #{tid} da ket thuc."
    task["done"] = True
    return f"Da dung task #{tid}"


async def _handle_task_list(args: Dict[str, Any], **kwargs) -> str:
    if not _tasks:
        return "Chua co task nao."
    lines = []
    for t in _tasks.values():
        status = "done" if t["done"] else "running"
        lines.append(f"#{t['id']}: {t['command']} [{status}] {t['start_time']}")
    return "\n".join(lines)


for name, desc, props, req, handler_fn in [
    ("task_start", "Chay task nen (long-running). Thuc hien lenh he thong trong nen.", {"command": {"type": "string"}, "args": {"type": "string"}, "timeout": {"type": "integer"}}, ["command"], _handle_task_start),
    ("task_output", "Lay output cua task dang chay.", {"id": {"type": "integer"}}, ["id"], _handle_task_output),
    ("task_stop", "Dung task dang chay.", {"id": {"type": "integer"}}, [], _handle_task_stop),
    ("task_list", "Liet ke tat ca tasks dang chay.", {}, [], _handle_task_list),
]:
    registry.register(
        name=name,
        toolset="tasks",
        schema={"name": name, "description": desc, "parameters": {"type": "object", "properties": props, "required": req}},
        handler=handler_fn,
        is_async=True,
    )
