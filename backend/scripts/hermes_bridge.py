#!/usr/bin/env python3
import argparse
import contextlib
import io
import json
import os
import platform
import socket
import sys
import traceback
import uuid
from pathlib import Path


HERMES_ROOT = Path(os.environ.get("HERMES_AGENT_ROOT", "/Users/nguyenhat/hermes-agent")).resolve()


def emit(payload, code=0):
    print(json.dumps(payload, ensure_ascii=False))
    raise SystemExit(code)


def import_model_tools():
    if not HERMES_ROOT.exists():
        emit({"ok": False, "error": f"Hermes root not found: {HERMES_ROOT}"}, 2)
    sys.path.insert(0, str(HERMES_ROOT))
    try:
        with contextlib.redirect_stdout(sys.stderr):
            import model_tools  # noqa: import-not-at-top
        return model_tools
    except Exception as exc:
        emit({
            "ok": False,
            "error": f"Failed to import Hermes model_tools: {exc}",
            "traceback": traceback.format_exc(),
        }, 2)


def parse_json_arg(raw, default):
    if not raw:
        return default
    try:
        return json.loads(raw)
    except Exception as exc:
        emit({"ok": False, "error": f"Invalid JSON: {exc}"}, 2)


def unix_socket_bind_available():
    if platform.system() == "Windows":
        return False
    sock = None
    path = Path(os.environ.get("TMPDIR") or "/tmp") / f"hagent_hermes_rpc_probe_{uuid.uuid4().hex}.sock"
    try:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.bind(str(path))
        return True
    except PermissionError:
        return False
    except OSError:
        return False
    finally:
        try:
            if sock:
                sock.close()
        finally:
            try:
                path.unlink()
            except OSError:
                pass


def prepare_tool_runtime(tool_name):
    if tool_name != "execute_code":
        return
    if unix_socket_bind_available():
        return
    try:
        with contextlib.redirect_stdout(sys.stderr):
            from tools import code_execution_tool
        # Hermes already has a TCP RPC path behind its Windows fallback. In the
        # Codex desktop sandbox on macOS, AF_UNIX bind is denied, so reuse that
        # transport without modifying the Hermes source tree.
        code_execution_tool._IS_WINDOWS = True
    except Exception as exc:
        print(f"[hagent-hermes-bridge] could not force TCP RPC for execute_code: {exc}", file=sys.stderr)


def cmd_status(_args):
    model_tools = import_model_tools()
    names = model_tools.get_all_tool_names()
    emit({
        "ok": True,
        "hermesRoot": str(HERMES_ROOT),
        "toolCount": len(names),
        "tools": names,
    })


def cmd_list(args):
    model_tools = import_model_tools()
    enabled = parse_json_arg(args.enabled_toolsets, None)
    disabled = parse_json_arg(args.disabled_toolsets, None)
    with contextlib.redirect_stdout(sys.stderr):
        defs = model_tools.get_tool_definitions(
            enabled_toolsets=enabled,
            disabled_toolsets=disabled,
            quiet_mode=True,
        )
    emit({
        "ok": True,
        "hermesRoot": str(HERMES_ROOT),
        "count": len(defs),
        "tools": defs,
    })


def cmd_call(args):
    model_tools = import_model_tools()
    tool_args = parse_json_arg(args.args, {})
    enabled_tools = parse_json_arg(args.enabled_tools, None)
    stdout = io.StringIO()
    try:
        prepare_tool_runtime(args.tool)
        with contextlib.redirect_stdout(stdout):
            result = model_tools.handle_function_call(
                args.tool,
                tool_args,
                task_id=args.task_id,
                tool_call_id=args.tool_call_id,
                session_id=args.session_id,
                user_task=args.user_task,
                enabled_tools=enabled_tools,
            )
        emit({
            "ok": True,
            "tool": args.tool,
            "result": result,
            "stdout": stdout.getvalue(),
        })
    except Exception as exc:
        emit({
            "ok": False,
            "tool": args.tool,
            "error": str(exc),
            "stdout": stdout.getvalue(),
            "traceback": traceback.format_exc(),
        }, 1)


def main():
    parser = argparse.ArgumentParser(description="HAgent bridge to Hermes Python runtime")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("status")

    list_parser = sub.add_parser("list")
    list_parser.add_argument("--enabled-toolsets", default="")
    list_parser.add_argument("--disabled-toolsets", default="")

    call_parser = sub.add_parser("call")
    call_parser.add_argument("--tool", required=True)
    call_parser.add_argument("--args", default="{}")
    call_parser.add_argument("--task-id", default="hagent")
    call_parser.add_argument("--tool-call-id", default="")
    call_parser.add_argument("--session-id", default="")
    call_parser.add_argument("--user-task", default="")
    call_parser.add_argument("--enabled-tools", default="")

    args = parser.parse_args()
    if args.cmd == "status":
        cmd_status(args)
    if args.cmd == "list":
        cmd_list(args)
    if args.cmd == "call":
        cmd_call(args)
    emit({"ok": False, "error": f"Unknown command: {args.cmd}"}, 2)


if __name__ == "__main__":
    main()
