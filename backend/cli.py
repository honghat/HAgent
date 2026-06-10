"""Compatibility classic CLI entrypoint for ``hagent_cli.main``.

The Hermes-era command router imports ``cli.main`` for classic chat mode and
``cli.CLI_CONFIG`` for a few callbacks. HAgent keeps most command wiring in
``hagent_cli.main``, so this module provides the small compatibility surface
needed by the packaged ``hagent`` entrypoint.

TUI inspired by anomalyco/opencode -- centered home prompt, scrollable session
transcript, compact footer, reasoning tag stripping, and tool-aware streaming.
"""

from __future__ import annotations

import contextlib
import io
import os
import queue
import re
import shutil
import subprocess
import tempfile
import threading
import time
import unicodedata
from pathlib import Path
from typing import Any

from hagent_cli.config import load_config

try:
    from prompt_toolkit import print_formatted_text as _pt_print
    from prompt_toolkit.application import Application
    from prompt_toolkit.auto_suggest import AutoSuggestFromHistory
    from prompt_toolkit.filters import Condition
    from prompt_toolkit.formatted_text import ANSI as _PT_ANSI, HTML
    from prompt_toolkit.history import FileHistory
    from prompt_toolkit.key_binding import KeyBindings
    from prompt_toolkit.keys import Keys
    from prompt_toolkit.layout import (
        DynamicContainer,
        HSplit,
        Layout,
        VSplit,
        Window,
        WindowAlign,
    )
    from prompt_toolkit.layout.controls import FormattedTextControl
    from prompt_toolkit.layout.dimension import Dimension
    from prompt_toolkit.layout.menus import CompletionsMenu
    from prompt_toolkit.layout.processors import Processor, Transformation
    from prompt_toolkit.mouse_events import MouseEventType
    from prompt_toolkit.patch_stdout import patch_stdout
    from prompt_toolkit.shortcuts import PromptSession
    from prompt_toolkit.styles import Style
    from prompt_toolkit.widgets import TextArea

    from hagent_cli.commands import SlashCommandAutoSuggest, SlashCommandCompleter
    from hagent_cli.skin_engine import get_prompt_toolkit_style_overrides

    _HAS_TUI = True
except Exception:
    _HAS_TUI = False

try:
    CLI_CONFIG = load_config()
except Exception:
    CLI_CONFIG = {}


if _HAS_TUI:
    class _PlaceholderProcessor(Processor):
        """Show muted placeholder text while the prompt buffer is empty."""

        def __init__(self, placeholder: str) -> None:
            self.placeholder = placeholder

        def apply_transformation(self, transformation_input):
            if transformation_input.lineno == 0 and not transformation_input.document.text:
                fragments = list(transformation_input.fragments)
                fragments.append(("class:placeholder", self.placeholder))
                return Transformation(fragments)
            return Transformation(transformation_input.fragments)
else:
    _PlaceholderProcessor = None


_HAGENT_LOGO = (
    "██╗  ██╗ █████╗  ██████╗ ███████╗███╗   ██╗████████╗",
    "██║  ██║██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝",
    "███████║███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ",
    "██╔══██║██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ",
    "██║  ██║██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ",
    "╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   ",
)

# ── ANSI constants ──────────────────────────────────────────────────────────

_GOLD = "\033[1;38;2;255;215;0m"
_DIM = "\033[2m"
_RST = "\033[0m"

_ANSI_RE = re.compile(
    "\x1b\\[[0-9;<=>?]*[a-zA-Z]"          # CSI: \x1b[31m, \x1b[<35;30;23M
    "|\x1b\\][^\x1b]*(?:\x1b\\\\|$)"      # OSC: \x1b]0;title\x1b\
    "|\x1b\\\\"                           # ST (string terminator): \x1b\
)
_CLI_UNSAFE_GLYPHS_RE = re.compile(
    "["
    "\U0001F000-\U0001FAFF"  # emoji, flags, pictographs
    "\u2600-\u27BF"          # misc symbols commonly rendered emoji-wide
    "\uFE0E-\uFE0F"          # variation selectors
    "\u200D"                 # zero-width joiner
    "]"
)
_CLI_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _terminal_safe_text(text: str | None) -> str:
    """Return display-safe text for prompt_toolkit/xterm transcript rendering."""
    if not text:
        return ""
    cleaned = unicodedata.normalize("NFC", str(text))
    cleaned = _ANSI_RE.sub("", cleaned).replace("\r", "").replace("\t", "    ")
    cleaned = _CLI_UNSAFE_GLYPHS_RE.sub("", cleaned)
    cleaned = _CLI_CONTROL_RE.sub("", cleaned)
    return cleaned


def _vt100_mouse_scroll_direction(data: str | None) -> int | None:
    """Return -1 for wheel up and +1 for wheel down from a raw mouse packet."""
    if not data or len(data) < 3:
        return None
    try:
        if data[2] == "M":
            if len(data) < 4:
                return None
            code = ord(data[3])
        else:
            payload = data[2:]
            if payload.startswith("<"):
                payload = payload[1:]
            code = int(payload[:-1].split(";", 1)[0])
    except (IndexError, TypeError, ValueError):
        return None

    if code >= 64:
        wheel_button = code % 4
        if wheel_button == 0:
            return -1
        if wheel_button == 1:
            return 1
    return None

# ── Reasoning tag stripping (ported from hermes-agent) ──────────────────────

_REASONING_TAGS = (
    "REASONING_SCRATCHPAD",
    "think",
    "thinking",
    "reasoning",
    "thought",
)


def strip_reasoning_tags(text: str) -> str:
    cleaned = text
    for tag in _REASONING_TAGS:
        cleaned = re.sub(
            rf"<{tag}>.*?</{tag}>\s*", "", cleaned,
            flags=re.DOTALL | re.IGNORECASE,
        )
        cleaned = re.sub(
            rf"<{tag}>.*$", "", cleaned,
            flags=re.DOTALL | re.IGNORECASE,
        )
        cleaned = re.sub(
            rf"</{tag}>\s*", "", cleaned, flags=re.IGNORECASE,
        )
    for tc_tag in ("tool_call", "tool_calls", "tool_result",
                   "function_call", "function_calls"):
        cleaned = re.sub(
            rf"<{tc_tag}\b[^>]*>.*?</{tc_tag}>\s*", "", cleaned,
            flags=re.DOTALL | re.IGNORECASE,
        )
    cleaned = re.sub(
        r'(?:(?<=^)|(?<=[\n\r.!?:]))[ \t]*'
        r'<function\b[^>]*\bname\s*=[^>]*>'
        r'(?:(?:(?!</function>).)*)</function>\s*',
        '', cleaned, flags=re.DOTALL | re.IGNORECASE,
    )
    cleaned = re.sub(
        r'</(?:tool_call|tool_calls|tool_result|function_call|function_calls|function)>\s*',
        '', cleaned, flags=re.IGNORECASE,
    )
    return cleaned.strip()


_BRAND_REPLACEMENTS = (
    (re.compile(r"\bNous\s*Research\b", re.IGNORECASE), "Hat Ng"),
    (re.compile(r"\bNorch\s*Research\b", re.IGNORECASE), "Hat Ng"),
    (re.compile(r"\bHagent\s*Agent\b"), "HAgent"),
)
_NEWS_INTENT_RE = re.compile(
    r"(^|\b)(tin\s*(tức|tuc|nóng|nong|mới|moi)|thời\s*sự|thoi\s*su|đọc\s*báo|doc\s*bao|news|current\s+news)(\b|$)",
    re.IGNORECASE,
)


def apply_brand_replacements(text: str) -> str:
    for pattern, replacement in _BRAND_REPLACEMENTS:
        text = pattern.sub(replacement, text)
    return text


def _is_news_intent(text: str) -> bool:
    return bool(_NEWS_INTENT_RE.search(text or ""))


def _prepare_cli_user_message(user_input: str) -> tuple[str, str | None]:
    """Make terse CLI intents explicit for local models.

    The display/history should keep exactly what the user typed, but the model
    needs a stronger instruction for short commands like "tin mới"; otherwise
    small local models often answer "đang cập nhật..." without calling tools.
    """
    if not _is_news_intent(user_input):
        return user_input, None
    return (
        "[CLI intent: tin tức mới]\n"
        f"Người dùng vừa hỏi: {user_input!r}\n\n"
        "Nhiệm vụ: lấy tin tức mới thật sự bằng tool trước khi trả lời. "
        "Bắt buộc gọi `get_vnexpress_news` và `get_dantri_news` nếu các tool này khả dụng; "
        "nếu tool lỗi thì nói rõ nguồn nào lỗi và dùng nguồn còn lại. "
        "Không được chỉ trả lời kiểu 'đang cập nhật' rồi dừng. "
        "Sau khi có kết quả tool, tổng hợp ngắn gọn 8-12 tin đáng chú ý bằng tiếng Việt, "
        "chia nhóm nếu hợp lý, kèm nguồn/link khi có.",
        user_input,
    )


def _max_overlap_suffix_prefix(current: str, incoming: str) -> int:
    """Return longest k where current[-k:] == incoming[:k]."""
    max_k = min(len(current), len(incoming))
    for k in range(max_k, 0, -1):
        if current[-k:] == incoming[:k]:
            return k
    return 0


def _merge_stream_chunk(current: str, incoming: str) -> tuple[str, str]:
    """Merge provider stream chunks and return (new_full_text, text_to_print).

    Providers differ: some send true deltas, some send cumulative snapshots,
    and some resend chunks. The terminal should only receive the new suffix.
    """
    if not current:
        return incoming, incoming
    if not incoming or incoming == current:
        return current, ""
    if incoming.startswith(current):
        return incoming, incoming[len(current):]
    if len(incoming) >= 32 and incoming in current:
        return current, ""
    pos = incoming.find(current)
    if pos >= 0:
        return incoming, incoming[pos + len(current):]
    overlap = _max_overlap_suffix_prefix(current, incoming)
    if overlap > 0:
        suffix = incoming[overlap:]
        return current + suffix, suffix
    return current + incoming, incoming


# ── Worktree helpers ───────────────────────────────────────────────────────

def _git_repo_root() -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            check=True, capture_output=True, text=True,
        )
        return result.stdout.strip() or None
    except Exception:
        return None


def _setup_worktree() -> dict[str, str] | None:
    repo = _git_repo_root()
    if not repo:
        return None
    parent = Path(tempfile.mkdtemp(prefix="hagent-worktree-"))
    path = parent / "repo"
    try:
        subprocess.run(
            ["git", "-C", repo, "worktree", "add", "--detach", str(path)],
            check=True,
        )
        return {"path": str(path), "parent": str(parent), "repo": repo}
    except Exception:
        shutil.rmtree(parent, ignore_errors=True)
        return None


def _cleanup_worktree(info: dict[str, str] | None) -> None:
    if not info:
        return
    path = info.get("path")
    repo = info.get("repo") or _git_repo_root()
    try:
        if path and repo:
            subprocess.run(
                ["git", "-C", repo, "worktree", "remove", "--force", path],
                check=False,
            )
    finally:
        parent = info.get("parent")
        if parent:
            shutil.rmtree(parent, ignore_errors=True)


# ── Agent helpers ──────────────────────────────────────────────────────────

def _as_toolset_list(value: Any) -> list[str] | None:
    if value in (None, "", []):
        return None
    if isinstance(value, str):
        items = value.split(",")
    else:
        items = list(value)
    cleaned = [str(item).strip() for item in items if str(item).strip()]
    return cleaned or None


def _resolve_cli_toolsets(explicit_toolsets: Any) -> list[str] | None:
    """Resolve toolsets for classic CLI.

    Priority:
    1) explicit --toolsets (if provided)
    2) platform toolsets configured for "cli" (same behavior as oneshot)
    3) None (registry default behavior)
    """
    explicit = _as_toolset_list(explicit_toolsets)
    if explicit is not None:
        return explicit
    try:
        from hagent_cli.tools_config import _get_platform_tools
        from toolsets import validate_toolset

        configured = sorted(_get_platform_tools(CLI_CONFIG, "cli"))
        valid = [name for name in configured if validate_toolset(name)]
        if valid:
            return valid
        # If config entries are stale/incompatible with this runtime, force
        # the composite platform toolset instead of passing an empty filter.
        if validate_toolset("hagent-cli"):
            return ["hagent-cli"]
        return None
    except Exception:
        return None


def _create_session_db_for_cli():
    """Best-effort SQLite session store for classic CLI chat."""
    try:
        from hagent_state import SessionDB

        return SessionDB()
    except Exception:
        return None


def _get_ai_agent_class():
    from run_agent import AIAgent as _AIAgent
    return _AIAgent


def _build_agent(**kwargs: Any) -> Any:
    runtime = _frontend_runtime_kwargs(
        provider=kwargs.get("provider"),
        model=kwargs.get("model"),
    )
    AIAgent = _get_ai_agent_class()
    verbose = bool(kwargs.get("verbose", False))
    quiet = bool(kwargs.get("quiet", False)) or not verbose
    session_db = _create_session_db_for_cli()
    return AIAgent(
        model=runtime.get("model") or kwargs.get("model") or "",
        provider=runtime.get("provider") or kwargs.get("provider") or "",
        base_url=runtime.get("base_url") or "",
        api_key=runtime.get("api_key") or None,
        enabled_toolsets=_resolve_cli_toolsets(kwargs.get("toolsets")),
        quiet_mode=quiet,
        verbose_logging=verbose,
        max_iterations=int(kwargs.get("max_turns") or 500),
        skip_context_files=bool(kwargs.get("ignore_rules", False)),
        skip_memory=bool(kwargs.get("ignore_rules", False)),
        platform="cli",
        session_db=session_db,
        pass_session_id=bool(kwargs.get("pass_session_id", False)),
    )


def _frontend_runtime_kwargs(provider: Any = None, model: Any = None) -> dict[str, str]:
    requested_provider = str(provider or "").strip()
    requested_model = str(model or "").strip()
    if not requested_provider:
        try:
            from api.services.user_store import DEFAULT_USERNAME, get_user_by_username

            user = get_user_by_username(DEFAULT_USERNAME)
            requested_provider = str((user or {}).get("default_provider") or "").strip()
        except Exception:
            requested_provider = ""
    if not requested_provider:
        return {}
    try:
        from api.services.provider_config import get_provider_config

        cfg = get_provider_config(requested_provider, requested_model or None)
    except Exception:
        return {}
    return {
        "provider": cfg.name or requested_provider,
        "model": cfg.model or requested_model,
        "base_url": cfg.base_url or "",
        "api_key": cfg.api_key or "",
    }


def _history_path() -> Path:
    try:
        from hagent_constants import get_hagent_home

        path = get_hagent_home() / "cache" / "cli_history"
    except Exception:
        path = Path(__file__).resolve().parent / "cache" / "cli_history"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


# ── Spinner frames (ported from hermes-agent) ──────────────────────────────

_SPINNER_FRAMES = ("\u280b", "\u2819", "\u2839", "\u2838", "\u283c", "\u2834", "\u2826", "\u2827", "\u280f", "\u280f")


def _spinner_frame() -> str:
    idx = int(time.monotonic() * 10) % len(_SPINNER_FRAMES)
    return _SPINNER_FRAMES[idx]


def _format_duration_compact(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.0f}s"
    minutes = seconds / 60
    if minutes < 60:
        return f"{minutes:.0f}m"
    hours = minutes / 60
    return f"{hours:.1f}h"


# ── TUI ────────────────────────────────────────────────────────────────────

class HAgentTUI:
    """TUI for HAgent chat, inspired by anomalyco/opencode.

    Dual-thread architecture:
    - Main thread: prompt_toolkit Application event loop
    - Background thread: process_loop that runs agent turns
    - queue.Queue bridges user input from main thread to bg thread
    """

    def __init__(self, agent: AIAgent) -> None:
        self.agent = agent
        self.agent.quiet_mode = True
        self._should_exit = False
        self._agent_running = False
        self._pending_input: queue.Queue[str | None] = queue.Queue()
        self._tool_start_time: float | None = None
        self._spinner_text = ""
        self._spinner_display = ""
        self._stream_buf: list[str] = []
        self._stream_text = ""
        self._last_stream_render_len = 0
        self._stream_had_output = False
        self._active_tools: dict[str, float] = {}
        self._output_text = ""
        self._output_follow = True
        self._has_chat = False
        self._cwd_label = self._make_cwd_label()
        self._version_label = self._make_version_label()
        self._assistant_panel_open = False
        self._assistant_at_line_start = False
        self._assistant_indicator_range: tuple[int, int] | None = None
        self._conversation_history: list[dict[str, Any]] = []

        # Wire tool/status callbacks so TUI receives tool events.  Without
        # this the agent runs tools silently and the user thinks nothing
        # is happening (mirrors Chat.jsx's `tool_progress` + `tool` SSE).
        self.agent.tool_progress_callback = self._on_tool_progress
        self.agent.tool_complete_callback = self._on_tool_complete
        self.agent.status_callback = self._on_status
        self.agent.thinking_callback = self._on_thinking

        self._build_ui()

    # ── Style ──────────────────────────────────────────────────────────

    def _build_style(self) -> Style:
        base = {
            "output-area": "#d7d7d7",
            "prompt-box": "bg:#1f1f1f #d7d7d7",
            "prompt-border": "bg:#050505 #4ea1ff",
            "prompt-input": "bg:#1f1f1f #d7d7d7",
            "prompt-mode": "bg:#1f1f1f #4ea1ff bold",
            "prompt-model": "bg:#1f1f1f #d7d7d7",
            "prompt-muted": "bg:#1f1f1f #777777",
            "placeholder": "bg:#1f1f1f #8a8a8a",
            "logo": "#f2f2f2 bold",
            "logo.dim": "#7c7c7c bold",
            "home-link": "#4ea1ff bold",
            "home-muted": "#8a8a8a",
            "tip": "#f5a623 bold",
            "footer": "#8a8a8a",
            "footer.strong": "#d7d7d7",
            "footer.work": "#f5a623",
            "tool": "#8a8a8a",
            "tool.name": "#d7d7d7",
            "error": "#ff5f5f bold",
            "spinner": "#f5a623 bold",
            "completion-menu": "bg:#151515 #d7d7d7",
            "completion-menu.completion.current": "bg:#005f87 #ffffff bold",
            "completion-menu.meta.completion": "bg:#151515 #8a8a8a",
            "completion-menu.meta.completion.current": "bg:#005f87 #d7d7d7",
        }
        try:
            if get_prompt_toolkit_style_overrides:
                base.update(get_prompt_toolkit_style_overrides())
        except Exception:
            pass
        return Style.from_dict(base)

    # ── UI ─────────────────────────────────────────────────────────────

    def _build_ui(self) -> None:
        self._style = self._build_style()

        completer = SlashCommandCompleter() if SlashCommandCompleter else None
        history_suggest = AutoSuggestFromHistory() if AutoSuggestFromHistory else None
        auto_suggest = (
            SlashCommandAutoSuggest(
                history_suggest=history_suggest, completer=completer,
            )
            if SlashCommandAutoSuggest
            else history_suggest
        )

        self._input = TextArea(
            height=Dimension(min=3, max=6, preferred=3),
            prompt="",
            style="class:prompt-input",
            multiline=True,
            wrap_lines=True,
            history=FileHistory(str(_history_path())) if FileHistory else None,
            completer=completer,
            complete_while_typing=True,
            auto_suggest=auto_suggest,
        )

        self._output = TextArea(
            text="",
            read_only=True,
            focusable=True,
            wrap_lines=True,
            scrollbar=True,
            height=Dimension(min=3, weight=1),
            style="class:output-area",
        )
        self._install_output_mouse_scroll()

        prompt_meta = Window(
            content=FormattedTextControl(self._get_prompt_meta),
            height=1,
            style="class:prompt-box",
        )

        prompt_panel = VSplit(
            [
                Window(char="│", width=1, style="class:prompt-border"),
                HSplit(
                    [
                        self._input,
                        Window(height=1, style="class:prompt-box"),
                        prompt_meta,
                    ],
                    style="class:prompt-box",
                ),
            ],
            height=5,
            width=Dimension(min=46, max=86, preferred=72),
        )

        centered_prompt = VSplit(
            [
                Window(),
                prompt_panel,
                Window(),
            ],
            height=5,
        )

        logo_lines = [
            Window(
                content=FormattedTextControl(
                    lambda line=line: self._logo_fragments(line)
                ),
                height=1,
                align=WindowAlign.CENTER,
            )
            for line in _HAGENT_LOGO
        ]
        home_before_prompt = HSplit(
            [
                Window(height=Dimension(weight=1)),
                *logo_lines,
                Window(height=2),
            ],
            height=Dimension(weight=1),
        )
        home_after_prompt = HSplit(
            [
                Window(
                    content=FormattedTextControl(self._get_home_shortcuts),
                    height=1,
                    align=WindowAlign.CENTER,
                ),
                Window(height=3),
                Window(
                    content=FormattedTextControl(self._get_home_tip),
                    height=1,
                    align=WindowAlign.CENTER,
                ),
                Window(height=Dimension(weight=1)),
                Window(
                    content=FormattedTextControl(self._get_footer),
                    height=1,
                    style="class:footer",
                ),
            ],
            height=Dimension(weight=1),
        )
        footer = Window(
            content=FormattedTextControl(self._get_footer),
            height=1,
            style="class:footer",
        )

        self._layout = Layout(
            HSplit([
                DynamicContainer(
                    lambda: self._output if self._has_chat else home_before_prompt
                ),
                centered_prompt,
                CompletionsMenu(),
                DynamicContainer(
                    lambda: footer if self._has_chat else home_after_prompt
                ),
            ]),
            focused_element=self._input,
        )

        kb = KeyBindings()
        scroll_when_input_idle = Condition(
            lambda: bool(self._has_chat) and not self._input.buffer.text
        )

        @kb.add("enter", eager=True)
        def _on_enter(event) -> None:
            text = self._input.buffer.text
            if self._agent_running:
                stripped = text.strip()
                if self._is_stop_command(stripped):
                    self._stop_agent_turn()
                elif stripped:
                    self._steer_agent_turn(stripped)
                self._input.buffer.reset()
            else:
                stripped = text.strip()
                if self._is_quit_command(stripped):
                    self._should_exit = True
                    self._pending_input.put_nowait(None)
                    event.app.exit()
                elif stripped:
                    self._pending_input.put_nowait(stripped)
                    self._input.buffer.reset()

        @kb.add("escape", "enter")
        def _on_alt_enter(event) -> None:
            self._input.buffer.insert_text("\n")

        @kb.add("c-c", eager=True)
        def _on_ctrl_c(event) -> None:
            if self._agent_running:
                self._stop_agent_turn()
            else:
                buf = self._input.buffer
                if buf.text.strip():
                    buf.reset()
                else:
                    self._should_exit = True
                    self._pending_input.put_nowait(None)
                    event.app.exit()

        @kb.add("c-d", eager=True)
        def _on_ctrl_d(event) -> None:
            buf = self._input.buffer
            if buf.text:
                buf.delete_before_cursor(1)
            else:
                self._should_exit = True
                self._pending_input.put_nowait(None)
                event.app.exit()

        @kb.add("c-l", eager=True)
        def _on_ctrl_l(event) -> None:
            event.app.renderer.clear()

        @kb.add("tab", eager=True)
        def _on_tab(event) -> None:
            self._input.buffer.complete_next()

        @kb.add("pageup", eager=True)
        def _on_page_up(event) -> None:
            self._scroll_output(-self._output_page_lines())

        @kb.add("escape", "k", eager=True)
        def _on_alt_k(event) -> None:
            self._scroll_output(-5)

        @kb.add("escape", "u", eager=True)
        def _on_alt_u(event) -> None:
            self._scroll_output(-self._output_page_lines())

        @kb.add("pagedown", eager=True)
        def _on_page_down(event) -> None:
            self._scroll_output(self._output_page_lines())

        @kb.add("escape", "j", eager=True)
        def _on_alt_j(event) -> None:
            self._scroll_output(5)

        @kb.add("escape", "d", eager=True)
        def _on_alt_d(event) -> None:
            self._scroll_output(self._output_page_lines())

        @kb.add("up", eager=True, filter=scroll_when_input_idle)
        def _on_arrow_up(event) -> None:
            self._scroll_output(-self._output_wheel_lines())

        @kb.add("down", eager=True, filter=scroll_when_input_idle)
        def _on_arrow_down(event) -> None:
            self._scroll_output(self._output_wheel_lines())

        @kb.add(Keys.ScrollUp, eager=True)
        def _on_terminal_scroll_up(event) -> None:
            self._scroll_output(-self._output_wheel_lines())

        @kb.add(Keys.ScrollDown, eager=True)
        def _on_terminal_scroll_down(event) -> None:
            self._scroll_output(self._output_wheel_lines())

        @kb.add(Keys.Vt100MouseEvent, eager=True)
        def _on_raw_mouse_event(event):
            direction = _vt100_mouse_scroll_direction(getattr(event, "data", None))
            if direction is None:
                return NotImplemented
            self._scroll_output(direction * self._output_wheel_lines())
            return None

        @kb.add("home", eager=True)
        def _on_home(event) -> None:
            self._output_follow = False
            self._output.buffer.cursor_position = 0
            event.app.invalidate()

        @kb.add("escape", "g", eager=True)
        def _on_alt_g(event) -> None:
            self._output_follow = False
            self._output.buffer.cursor_position = 0
            event.app.invalidate()

        @kb.add("end", eager=True)
        def _on_end(event) -> None:
            self._scroll_output_to_end()

        @kb.add("escape", "G", eager=True)
        def _on_alt_shift_g(event) -> None:
            self._scroll_output_to_end()

        self._app = Application(
            layout=self._layout,
            key_bindings=kb,
            style=self._style,
            full_screen=True,
            mouse_support=True,
        )

    def _logo_fragments(self, line: str) -> list[tuple[str, str]]:
        split = max(1, len(line) // 2)
        return [
            ("class:logo.dim", line[:split]),
            ("class:logo", line[split:]),
        ]

    def _get_prompt_meta(self) -> list[tuple[str, str]]:
        model = self._ellipsize(str(self.agent.model or "model"), 34)
        provider = self._ellipsize(str(self.agent.provider or "provider"), 18)
        mode = "Steer" if self._agent_running else "Build"
        return [
            ("class:prompt-mode", f"  {mode}"),
            ("class:prompt-muted", " · "),
            ("class:prompt-model", model),
            ("class:prompt-muted", f" {provider}"),
        ]

    def _get_home_shortcuts(self) -> list[tuple[str, str]]:
        return [
            ("class:home-link", "HAgent"),
            ("class:home-muted", "   tab tools   wheel/PgUp/PgDn scroll   Home/End jump"),
        ]

    def _get_home_tip(self) -> list[tuple[str, str]]:
        return [
            ("class:tip", "● Tip"),
            ("class:home-muted", " Type Vietnamese normally. Use /quit to exit."),
        ]

    def _get_footer(self) -> list[tuple[str, str]]:
        columns = shutil.get_terminal_size((100, 24)).columns
        left = f" {self._ellipsize(self._cwd_label, max(16, columns // 2))}"
        right_raw = self._spinner_display if self._spinner_display else self._version_label
        right = f" {self._ellipsize(right_raw, max(12, columns // 3))} "
        space = max(1, columns - len(left) - len(right))
        right_style = "class:footer.work" if self._spinner_display else "class:footer"
        return [
            ("class:footer", left),
            ("class:footer", " " * space),
            (right_style, right),
        ]

    def _make_cwd_label(self) -> str:
        cwd = Path(os.getcwd()).resolve()
        try:
            rel = "~/" + str(cwd.relative_to(Path.home().resolve()))
        except ValueError:
            rel = str(cwd)

        branch = ""
        try:
            proc = subprocess.run(
                ["git", "branch", "--show-current"],
                cwd=str(cwd),
                capture_output=True,
                text=True,
                timeout=1,
            )
            branch = proc.stdout.strip()
        except Exception:
            branch = ""
        return f"{rel}:{branch}" if branch else rel

    def _make_version_label(self) -> str:
        try:
            from hagent_cli import __version__

            return str(__version__)
        except Exception:
            return "HAgent"

    @staticmethod
    def _ellipsize(text: str, limit: int) -> str:
        if limit <= 1 or len(text) <= limit:
            return text
        if limit <= 4:
            return text[:limit]
        head = max(1, (limit - 1) // 2)
        tail = max(1, limit - head - 1)
        return f"{text[:head]}…{text[-tail:]}"

    # ── Streaming ──────────────────────────────────────────────────────

    def _on_stream_delta(self, delta: str | None) -> None:
        if not delta:
            return
        # IMPORTANT: do NOT call strip_reasoning_tags() here — its trailing
        # .strip() eats whitespace at delta boundaries and glues words
        # together ("đãhoànthành").  The agent already scrubs <think>
        # statefully (run_agent.py:_stream_think_scrubber) before this
        # callback fires, so we only need to drop ANSI and rebrand.
        cleaned = _terminal_safe_text(delta)
        cleaned = apply_brand_replacements(cleaned)
        if not cleaned:
            return
        self._stream_text, to_print = _merge_stream_chunk(self._stream_text, cleaned)
        if not to_print:
            return
        self._stream_had_output = True
        self._append_assistant_content(to_print)

    def _on_tool_progress(self, event_name: str, tool_name: str, preview=None, args=None, **_kw) -> None:
        name = tool_name or event_name or "tool"
        label = _terminal_safe_text(str(preview or name))
        if event_name == "tool.started":
            self._active_tools[name] = time.monotonic()
            self._spinner_text = f"{name} · {label[:60]}"
        elif event_name == "tool.completed":
            started = self._active_tools.pop(name, None)
            dur = _format_duration_compact(time.monotonic() - started) if started else ""
            suffix = f" · {dur}" if dur else ""
            self._append_panel_line(f"⏺ {name}{suffix}")
            self._spinner_text = "" if not self._active_tools else next(iter(self._active_tools))

    def _on_tool_complete(self, tool_call_id: str, name: str, args: dict, result) -> None:
        # Drop noise — tool_progress already shows the line.  Keep hook
        # in case of future per-result UI.
        return

    def _on_status(self, kind: str, message: str) -> None:
        if not message:
            return
        if self._agent_running:
            self._spinner_text = _terminal_safe_text(str(message))[:70]

    def _on_thinking(self, content: str | None) -> None:
        # Keep reasoning hidden in the opencode-style transcript.
        return

    def _steer_agent_turn(self, text: str) -> None:
        try:
            if hasattr(self.agent, "steer") and self.agent.steer(text):
                self._spinner_text = f"steer · {_terminal_safe_text(text)[:58]}"
                self._app.invalidate()
                return
            if hasattr(self.agent, "interrupt"):
                self.agent.interrupt(text)
        except Exception:
            pass

    def _stop_agent_turn(self) -> None:
        try:
            if hasattr(self.agent, "interrupt"):
                self.agent.interrupt(None)
            self._spinner_text = "stopping…"
            self._app.invalidate()
        except Exception:
            pass

    # ── Process loop (background thread) ───────────────────────────────

    def _process_loop(self) -> None:
        while not self._should_exit:
            try:
                user_input = self._pending_input.get(timeout=0.2)
            except queue.Empty:
                continue

            if user_input is None:
                break
            if self._is_quit_command(user_input):
                break
            if not user_input.strip():
                continue

            self._agent_running = True
            self._stream_buf.clear()
            self._stream_text = ""
            self._last_stream_render_len = 0
            self._stream_had_output = False
            self._active_tools.clear()
            self._has_chat = True
            turn_started = time.monotonic()
            self._append_user_message(user_input)
            self._open_assistant_message()
            conversation_history = list(self._conversation_history)
            effective_input, persist_input = _prepare_cli_user_message(user_input)
            try:
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                    result = self.agent.run_conversation(
                        effective_input,
                        conversation_history=conversation_history,
                        stream_callback=self._on_stream_delta,
                        persist_user_message=persist_input,
                    )
            except Exception as exc:
                self._clear_assistant_indicator()
                self._append_output_line(f"Error: {exc}")
                result = {}
            result_messages = (result or {}).get("messages")
            if isinstance(result_messages, list):
                self._conversation_history = result_messages
            pending_steer = _terminal_safe_text(
                str((result or {}).get("pending_steer") or "")
            ).strip()
            # Flush remaining buffered tail (no trailing space/newline yet)
            tail = "".join(self._stream_buf)
            self._stream_buf.clear()
            if tail:
                self._stream_had_output = True
                self._append_assistant_content(tail)
            if not self._stream_had_output:
                final = strip_reasoning_tags(str((result or {}).get("final_response") or ""))
                if final:
                    self._stream_had_output = True
                    self._append_assistant_content(final)
            self._close_assistant_message(time.monotonic() - turn_started)
            self._append_output("\n")
            self._stream_text = ""
            self._last_stream_render_len = 0
            self._spinner_text = ""
            self._spinner_display = ""
            self._agent_running = False
            if pending_steer:
                self._pending_input.put_nowait(pending_steer)

    def _append_user_message(self, text: str) -> None:
        safe = _terminal_safe_text(text)
        lines = safe.splitlines() or [safe]
        prefix = "" if not self._output_text else "\n"
        block = [prefix, "│\n"]
        block.extend(f"│  {line}\n" for line in lines)
        block.append("│\n\n")
        self._append_output("".join(block))

    def _open_assistant_message(self) -> None:
        self._assistant_panel_open = True
        self._assistant_at_line_start = False
        self._refresh_assistant_indicator()

    def _append_assistant_content(self, text: str) -> None:
        if not text:
            return
        if not self._assistant_panel_open:
            self._open_assistant_message()
        self._clear_assistant_indicator()
        self._append_output(_terminal_safe_text(text))
        self._assistant_at_line_start = text.endswith("\n")

    def _append_panel_line(self, text: str) -> None:
        text = _terminal_safe_text(text)
        self._clear_assistant_indicator()
        if self._assistant_panel_open:
            if not self._output_text.endswith("\n"):
                self._append_output("\n")
            self._append_output(f"  {text.rstrip()}\n")
            self._assistant_at_line_start = True
        else:
            self._append_output_line(f"  {text}")

    def _close_assistant_message(self, seconds: float) -> None:
        self._clear_assistant_indicator()
        model = self._ellipsize(str(self.agent.model or "model"), 34)
        duration = _format_duration_compact(seconds)
        if self._assistant_panel_open:
            if not self._output_text.endswith("\n"):
                self._append_output("\n")
            self._append_output(f"   ▣ Build · {model} · {duration}\n")
        else:
            prefix = "" if self._output_text.endswith("\n") else "\n"
            self._append_output(f"{prefix}   ▣ Build · {model} · {duration}\n")
        self._assistant_panel_open = False
        self._assistant_at_line_start = False

    def _assistant_indicator_text(self, frame: str | None = None) -> str:
        frame = frame or _spinner_frame()
        label = (self._spinner_text or "HAgent đang trả lời…").strip()
        if label == "working…":
            label = "HAgent đang trả lời…"
        return f"{frame} {self._ellipsize(label, 76)}\n"

    def _refresh_assistant_indicator(self, frame: str | None = None) -> None:
        if not self._assistant_panel_open or self._stream_had_output:
            return
        text = self._assistant_indicator_text(frame)
        span = self._assistant_indicator_range
        if span is None:
            start = len(self._output_text)
            self._assistant_indicator_range = (start, start + len(text))
            self._append_output(text)
            return
        start, end = span
        if start < 0 or end < start or end > len(self._output_text):
            self._assistant_indicator_range = None
            return
        self._replace_output_range(start, end, text)
        self._assistant_indicator_range = (start, start + len(text))

    def _clear_assistant_indicator(self) -> None:
        span = self._assistant_indicator_range
        if span is None:
            return
        start, end = span
        self._assistant_indicator_range = None
        if 0 <= start <= end <= len(self._output_text):
            self._replace_output_range(start, end, "")

    def _append_output(self, text: str) -> None:
        if not text:
            return
        follow = self._output_follow or self._output.buffer.cursor_position >= max(0, len(self._output_text) - 1)
        self._output_text += text
        if len(self._output_text) > 24000:
            removed = len(self._output_text) - 24000
            self._output_text = self._output_text[removed:]
            if self._assistant_indicator_range is not None:
                start, end = self._assistant_indicator_range
                if end <= removed:
                    self._assistant_indicator_range = None
                else:
                    self._assistant_indicator_range = (
                        max(0, start - removed),
                        max(0, end - removed),
                    )
        try:
            self._output.text = self._output_text
            if follow:
                self._scroll_output_to_end(invalidate=False)
            self._app.invalidate()
        except Exception:
            print(text, end="", flush=True)

    def _replace_output_range(self, start: int, end: int, text: str) -> None:
        follow = self._output_follow or self._output.buffer.cursor_position >= max(0, len(self._output_text) - 1)
        self._output_text = self._output_text[:start] + text + self._output_text[end:]
        try:
            self._output.text = self._output_text
            if follow:
                self._scroll_output_to_end(invalidate=False)
            self._app.invalidate()
        except Exception:
            pass

    def _append_output_line(self, text: str) -> None:
        if not text:
            return
        prefix = "" if not self._output_text or self._output_text.endswith("\n") else "\n"
        self._append_output(f"{prefix}{text.rstrip()}\n")

    def _install_output_mouse_scroll(self) -> None:
        try:
            window = self._output.window
            default_mouse_handler = window._mouse_handler
        except Exception:
            return

        def _mouse_handler(mouse_event):
            try:
                if mouse_event.event_type == MouseEventType.SCROLL_UP:
                    self._scroll_output(-self._output_wheel_lines())
                    return None
                if mouse_event.event_type == MouseEventType.SCROLL_DOWN:
                    self._scroll_output(self._output_wheel_lines())
                    return None
            except Exception:
                return None
            return default_mouse_handler(mouse_event)

        window._mouse_handler = _mouse_handler

    def _output_view_height(self) -> int:
        try:
            info = self._output.window.render_info
            height = getattr(info, "window_height", 0) if info else 0
            if height:
                return max(1, int(height))
        except Exception:
            pass
        return max(8, shutil.get_terminal_size((100, 24)).lines - 8)

    def _output_page_lines(self) -> int:
        return max(6, int(self._output_view_height() * 0.8))

    def _output_wheel_lines(self) -> int:
        return max(3, min(6, self._output_page_lines() // 4))

    def _scroll_output(self, line_delta: int) -> None:
        try:
            if line_delta < 0:
                self._output.buffer.cursor_up(count=abs(line_delta))
                self._output_follow = False
            elif line_delta > 0:
                self._output.buffer.cursor_down(count=line_delta)
                self._output_follow = self._output.buffer.cursor_position >= max(0, len(self._output_text) - 1)
            self._app.invalidate()
        except Exception:
            pass

    def _scroll_output_to_end(self, invalidate: bool = True) -> None:
        self._output_follow = True
        self._output.buffer.cursor_position = len(self._output_text)
        if invalidate:
            self._app.invalidate()

    def _safe_output(self, text: str) -> None:
        if not text:
            return
        try:
            from prompt_toolkit.patch_stdout import patch_stdout
            with patch_stdout():
                print(text)
        except Exception:
            print(text)

    def _safe_output_inline(self, text: str, replace_line: bool = False) -> None:
        """Write streamed text without forcing a newline, so words flow
        together as the model emits them (mirrors Chat.jsx token UX)."""
        if not text:
            return
        if replace_line:
            pad = max(0, self._last_stream_render_len - len(text))
            payload = f"\r{text}{' ' * pad}"
            self._last_stream_render_len = len(text)
        else:
            payload = text
        try:
            from prompt_toolkit.patch_stdout import patch_stdout
            with patch_stdout():
                print(payload, end="", flush=True)
        except Exception:
            print(payload, end="", flush=True)

    # ── Spinner loop (background thread) ───────────────────────────────

    def _spinner_loop(self) -> None:
        while not self._should_exit:
            if self._agent_running:
                frame = _spinner_frame()
                txt = self._spinner_text or "working\u2026"
                self._spinner_display = f"{frame} {txt}"
                self._refresh_assistant_indicator(frame)
                self._app.invalidate()
                time.sleep(0.1)
            else:
                if self._spinner_display:
                    self._spinner_display = ""
                time.sleep(0.2)

    # ── Run ────────────────────────────────────────────────────────────

    def run(self) -> None:
        self._print_banner()

        bg = threading.Thread(target=self._process_loop, daemon=True)
        bg.start()

        spinner = threading.Thread(target=self._spinner_loop, daemon=True)
        spinner.start()

        with patch_stdout():
            try:
                self._app.run()
            except (EOFError, KeyboardInterrupt):
                pass
            finally:
                self._should_exit = True

    # ── Banner ─────────────────────────────────────────────────────────

    def _print_banner(self) -> None:
        # The opencode-style home screen is rendered by the layout itself.
        self._output_text = ""

    def _print_simple_banner(self) -> None:
        a = self.agent
        print(f"{_GOLD}HAgent{_RST}")
        print(f"Build · {a.model or 'model'} {a.provider or 'provider'}")

    @staticmethod
    def _is_quit_command(text: str) -> bool:
        return text.strip().lower() in {"/exit", "/quit", "exit", "quit", ":q"}

    @staticmethod
    def _is_stop_command(text: str) -> bool:
        return text.strip().lower() in {"/stop", "/cancel", "/interrupt", "stop"}


# ── Module-level helpers (compatibility) ────────────────────────────────────

_utf8_buf_global = ""
_stream_text_global = ""


def _stream(delta: str | None) -> None:
    global _utf8_buf_global, _stream_text_global
    if not delta:
        return
    # Keep whitespace intact — strip_reasoning_tags() ends with .strip()
    # which devours boundary spaces and causes "dính chữ".  The agent
    # already strips think/reasoning statefully before this callback.
    cleaned = _terminal_safe_text(delta)
    cleaned = apply_brand_replacements(cleaned)
    if not cleaned:
        return
    _utf8_buf_global += cleaned
    try:
        printable = _utf8_buf_global.encode("utf-8").decode("utf-8")
        _utf8_buf_global = ""
    except (UnicodeDecodeError, UnicodeEncodeError):
        if len(_utf8_buf_global) > 8:
            printable = _utf8_buf_global[:-4]
            _utf8_buf_global = _utf8_buf_global[-4:]
        else:
            return
    if printable:
        _stream_text_global, to_print = _merge_stream_chunk(_stream_text_global, printable)
        if to_print:
            print(to_print, end="", flush=True)


def _response_was_streamed(agent, result: dict[str, Any]) -> bool:
    if getattr(agent, "_response_was_previewed", False):
        return True
    final = str((result or {}).get("final_response") or "")
    return bool(final) and getattr(agent, "_last_stream_delta_at", 0) is not None


# ── Fallback interactive loop (PromptSession) ──────────────────────────────

def _make_session():
    if not _HAS_TUI:
        return None
    if not os.isatty(0) and not os.environ.get("FORCE_TUI", ""):
        return None
    from prompt_toolkit.shortcuts import PromptSession as _PS
    completer = SlashCommandCompleter() if SlashCommandCompleter else None
    history_suggest = AutoSuggestFromHistory() if AutoSuggestFromHistory else None
    auto_suggest = (
        SlashCommandAutoSuggest(
            history_suggest=history_suggest, completer=completer,
        )
        if SlashCommandAutoSuggest
        else history_suggest
    )
    base_style = {
        "prompt": "#00d7ff bold",
        "prompt.arrow": "#ff5f00 bold",
        "prompt.dim": "#8a8a8a",
        "banner": "#00d7ff bold",
        "banner.accent": "#ff5f00 bold",
        "hint": "#8a8a8a italic",
        "completion-menu": "bg:#151515 #d7d7d7",
        "completion-menu.completion.current": "bg:#005f87 #ffffff bold",
        "completion-menu.meta.completion": "bg:#151515 #8a8a8a",
        "completion-menu.meta.completion.current": "bg:#005f87 #d7d7d7",
    }
    try:
        if get_prompt_toolkit_style_overrides:
            base_style.update(get_prompt_toolkit_style_overrides())
    except Exception:
        pass

    return _PS(
        history=FileHistory(str(_history_path())) if FileHistory else None,
        completer=completer,
        auto_suggest=auto_suggest,
        complete_while_typing=True,
        enable_history_search=True,
        style=Style.from_dict(base_style) if Style else None,
    )


def _prompt_html():
    if HTML is None:
        return "HAgent > "
    return HTML(
        '<prompt>HAgent</prompt> <prompt.dim>\u2571</prompt.dim> '
        '<prompt.arrow>\u279c</prompt.arrow> '
    )


def _interactive_loop(agent: AIAgent) -> None:
    """Fallback interactive loop when prompt_toolkit TUI is unavailable."""
    global _utf8_buf_global, _stream_text_global
    agent.quiet_mode = True

    # Wire tool callbacks so the fallback loop also reports tool activity
    # (otherwise tools run invisibly — the "không sử dụng được tool" bug).
    def _tool_progress(event_name: str, tool_name: str, preview=None, args=None, **_kw) -> None:
        name = tool_name or event_name or "tool"
        if event_name == "tool.started":
            print(f"\n▸ {name} · {str(preview or '')[:80]}", flush=True)
        elif event_name == "tool.completed":
            print(f"⤷ {name} done", flush=True)

    def _status(_kind: str, message: str) -> None:
        if message:
            print(f"· {message}", flush=True)

    agent.tool_progress_callback = _tool_progress
    agent.status_callback = _status

    print(f"{_GOLD}HAgent{_RST}")
    print(f"Build · {agent.model or 'model'} {agent.provider or 'provider'}")

    session = _make_session()
    conversation_history: list[dict[str, Any]] = []
    while True:
        try:
            ctx = patch_stdout() if _HAS_TUI else None
            if ctx:
                with ctx:
                    user = _read_input(session)
            else:
                user = _read_input(session)
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if _is_quit_command(user):
            break
        if _is_help_command(user):
            print("L\u1ec7nh nhanh: /help, /quit, /exit. G\u00f5 / \u0111\u1ec3 "
                  "autocomplete slash commands.")
            continue
        if not user:
            continue
        _utf8_buf_global = ""
        _stream_text_global = ""
        effective_user, persist_user = _prepare_cli_user_message(user)
        result = agent.run_conversation(
            effective_user,
            conversation_history=list(conversation_history),
            stream_callback=_stream,
            persist_user_message=persist_user,
        )
        result_messages = (result or {}).get("messages")
        if isinstance(result_messages, list):
            conversation_history = result_messages
        final = str(result.get("final_response") or "")
        if final and not _response_was_streamed(agent, result):
            print()
            print(_terminal_safe_text(strip_reasoning_tags(final)))
        print()


def _read_input(session) -> str:
    if session is None:
        return input("\u2571\u279c ").strip()
    return session.prompt(_prompt_html()).strip()


def _is_quit_command(text: str) -> bool:
    return text.strip().lower() in {"/exit", "/quit", "exit", "quit", ":q"}


def _is_help_command(text: str) -> bool:
    return text.strip().lower() in {"/help", "help", "?"}


# ── Main entry point ────────────────────────────────────────────────────────

def main(**kwargs: Any) -> None:
    """Run classic HAgent chat mode.

    Supports single-query mode via ``query=...`` and an interactive loop
    with TUI (inspired by anomalyco/opencode) when no query is supplied.
    """
    worktree = None
    old_cwd = None
    if kwargs.get("worktree"):
        worktree = _setup_worktree()
        if not worktree:
            raise SystemExit("Could not create git worktree")
        old_cwd = os.getcwd()
        os.chdir(worktree["path"])

    try:
        try:
            agent = _build_agent(**kwargs)
        except RuntimeError as exc:
            print(f"Could not start HAgent chat: {exc}")
            return

        query = kwargs.get("query")
        if query:
            agent.quiet_mode = True
            global _utf8_buf_global, _stream_text_global
            _utf8_buf_global = ""
            _stream_text_global = ""
            effective_query, persist_query = _prepare_cli_user_message(str(query))
            result = agent.run_conversation(
                effective_query,
                stream_callback=_stream,
                persist_user_message=persist_query,
            )
            final = str(result.get("final_response") or "")
            if final and not _response_was_streamed(agent, result):
                print()
                print(_terminal_safe_text(strip_reasoning_tags(final)))
            return

        if _HAS_TUI and os.isatty(0):
            tui = HAgentTUI(agent)
            tui.run()
        else:
            _interactive_loop(agent)

    finally:
        if old_cwd:
            os.chdir(old_cwd)
        _cleanup_worktree(worktree)
