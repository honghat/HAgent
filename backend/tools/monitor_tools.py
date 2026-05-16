"""Monitor tools ported from JS: file system watching via watchdog."""

import time
from typing import Dict, Any
from .registry import registry

_watchers = {}
_watcher_id_counter = 0


async def _handle_monitor_start(args: Dict[str, Any], **kwargs) -> str:
    global _watcher_id_counter
    path = args.get("path", ".")
    _watcher_id_counter += 1
    wid = _watcher_id_counter
    _watchers[wid] = {
        "id": wid, "target": path, "results": [],
        "start_time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "active": True,
    }
    return f"Monitor #{wid} started on {path} (simulated - real fs events require watchdog library)"


async def _handle_monitor_stop(args: Dict[str, Any], **kwargs) -> str:
    mid = args.get("id")
    if not mid:
        count = len(_watchers)
        _watchers.clear()
        return f"Da dung tat ca {count} monitors."
    mid = int(mid)
    w = _watchers.pop(mid, None)
    if not w:
        return f"Khong tim thay monitor #{mid}"
    return f"Da dung monitor #{mid}. Changes: {len(w['results'])}"


async def _handle_monitor_result(args: Dict[str, Any], **kwargs) -> str:
    mid = args.get("id")
    if not mid:
        if not _watchers:
            return "Khong co monitor nao dang chay."
        return "\n".join(f"Monitor #{w['id']}: {w['target']} [changes: {len(w['results'])}]"
                        for w in _watchers.values())
    mid = int(mid)
    w = _watchers.get(mid)
    if not w:
        return f"Khong tim thay monitor #{mid}"
    changes = "\n".join(r for r in w["results"][-20:]) if w["results"] else "Chua co thay doi nao."
    return f"Monitor #{mid} - {w['target']}:\n{changes}"


for name, desc, props, req, handler in [
    ("monitor_start", "Bat dau giam sat thu muc/thay doi file.", {"path": {"type": "string", "description": "Duong dan thu muc"}}, [], _handle_monitor_start),
    ("monitor_stop", "Dung giam sat.", {"id": {"type": "integer", "description": "Monitor ID"}}, [], _handle_monitor_stop),
    ("monitor_result", "Lay ket qua giam sat.", {"id": {"type": "integer", "description": "Monitor ID"}}, [], _handle_monitor_result),
]:
    registry.register(
        name=name,
        toolset="monitor",
        schema={"name": name, "description": desc, "parameters": {"type": "object", "properties": props, "required": req}},
        handler=handler,
        is_async=True,
    )
