from __future__ import annotations

import io
import json
import logging
import os
import queue
import re
import threading
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from urllib import error, request as urlrequest
from uuid import uuid4
from xml.etree import ElementTree

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from api.schemas import (
    AsyncMessageResponse,
    MessageRequest,
    MessageResponse,
    PasteRequest,
    RawMessageRequest,
    SessionMessageItem,
)
from api.services.run_control import finish_session, is_stop_requested, mark_running
from api.services.session_store import (
    add_journal,
    add_message,
    clear_journal,
    delete_message,
    get_session,
    list_journal,
    list_messages,
    update_session_title,
    update_message_content,
)
from api.services.source_core_agent import run_source_agent
from api.services.source_core_agent import analyze_with_js_heuristics
from api.services.self_evolution import reflect_interaction
from api.services.provider_config import get_provider_config
from api.services.workspace_state import get_workspace_state, record_tool, record_tool_result
from api.services.wiki_memory import extract_and_save_wiki, resolve_user_id


from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]  # e.g. .../HAgent/backend
UPLOAD_ROOT = BACKEND_ROOT / "data" / "uploads"

router = APIRouter(tags=["messages"])
logger = logging.getLogger(__name__)


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)) or default)
    except (TypeError, ValueError):
        return default


_POST_CHAT_WORKERS = max(1, _env_int("HAGENT_POST_CHAT_WORKERS", 1))
_POST_CHAT_EXECUTOR = ThreadPoolExecutor(max_workers=_POST_CHAT_WORKERS, thread_name_prefix="post-chat")


class ChatCompletionProxyRequest(BaseModel):
    provider: str | None = None
    model: str | None = None
    messages: list[dict] = Field(default_factory=list)
    temperature: float | None = 0.5


def _provider_name(provider: str | None) -> str | None:
    return provider or None


def _run_post_chat_task(fn, *args) -> None:
    """Queue low-priority enrichment without keeping the chat stream open."""
    future = _POST_CHAT_EXECUTOR.submit(fn, *args)

    def _log_failure(done_future) -> None:
        try:
            done_future.result()
        except Exception:  # noqa: BLE001
            logger.exception("Post-chat task failed: %s", getattr(fn, "__name__", fn))

    future.add_done_callback(_log_failure)


@router.post("/hagent-ai/chat/completions")
def chat_completion_proxy(payload: ChatCompletionProxyRequest) -> dict:
    """Small OpenAI-compatible proxy that follows HAgent's selected provider."""
    if not payload.messages:
        raise HTTPException(status_code=400, detail="Thiếu messages")

    try:
        cfg = get_provider_config(payload.provider, payload.model)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if cfg.type != "openai":
        raise HTTPException(status_code=400, detail=f"Provider {cfg.name} chưa hỗ trợ tạo bài trong Learn")
    if not cfg.base_url:
        raise HTTPException(status_code=400, detail=f"Provider {cfg.name} chưa có Base URL")
    if not cfg.api_key:
        raise HTTPException(status_code=400, detail=f"Provider {cfg.name} chưa có API key")

    body = {
        "model": cfg.model,
        "temperature": payload.temperature if payload.temperature is not None else 0.5,
        "messages": payload.messages,
    }
    req = urlrequest.Request(
        f"{cfg.base_url.rstrip('/')}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {cfg.api_key}",
        },
        method="POST",
    )
    try:
        with urlrequest.urlopen(req, timeout=180) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        text = exc.read().decode("utf-8", errors="ignore")
        raise HTTPException(status_code=502, detail=f"Lỗi provider {cfg.name}: HTTP {exc.code} - {text[:240]}") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Không gọi được provider {cfg.name}: {exc}") from exc


def _run_and_store_reply(
    session_id: str,
    content: str,
    provider: str | None,
    model: str | None = None,
    context_length: int | None = None,
) -> MessageResponse:
    add_journal(
        session_id,
        "tool",
        event_name="hagent_agent",
        status="start",
        count=1,
    )
    try:
        reply, usage = run_source_agent(
            session_id=session_id,
            user_message=content,
            provider_name=provider,
            model_override=model,
            context_length_override=context_length,
        )
        message_id = add_message(
            session_id,
            "assistant",
            reply,
            provider=_provider_name(provider),
            usage=usage,
        )
        try:
            record = get_session(session_id)
            user_id = record.user_id if record else resolve_user_id(None)
            reflect_interaction(
                user_id=user_id,
                session_id=session_id,
                user_message_id=None,
                assistant_message_id=message_id,
                user_content=content,
                assistant_content=reply,
                provider=provider,
                model=model,
            )
        except Exception:
            pass
        add_journal(
            session_id,
            "tool",
            message_id=message_id,
            event_name="hagent_agent",
            status="done",
            count=1,
        )
        return MessageResponse(
            session_id=session_id,
            status="completed",
            reply=reply,
            messageId=message_id,
            usage=usage,
        )
    except Exception as exc:  # noqa: BLE001
        error_text = f"Agent nguồn chưa chạy được: {exc}"
        message_id = add_message(
            session_id,
            "assistant",
            error_text,
            provider=_provider_name(provider),
        )
        add_journal(
            session_id,
            "tool",
            message_id=message_id,
            event_name="hagent_agent",
            status="error",
            count=1,
        )
        return MessageResponse(
            session_id=session_id,
            status="error",
            reply=error_text,
            messageId=message_id,
        )


def _run_background_message(
    session_id: str,
    content: str,
    provider: str | None,
    model: str | None = None,
    context_length: int | None = None,
) -> None:
    try:
        _run_and_store_reply(session_id, content, provider, model, context_length)
    finally:
        finish_session(session_id)


def _decode_docx_file(data: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            xml = archive.read("word/document.xml")
    except Exception:
        return ""

    try:
        root = ElementTree.fromstring(xml)
    except ElementTree.ParseError:
        return ""

    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs: list[str] = []
    for paragraph in root.findall(".//w:p", ns):
        parts = [node.text or "" for node in paragraph.findall(".//w:t", ns)]
        text = "".join(parts).strip()
        if text:
            paragraphs.append(text)
    return "\n".join(paragraphs).strip()


def _decode_pdf_file(data: bytes) -> str:
    try:
        from io import BytesIO
        import pypdf
        reader = pypdf.PdfReader(BytesIO(data))
        pages = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages.append(text.strip())
        return "\n\n".join(pages).strip()
    except Exception:
        return ""


def _decode_text_file(filename: str, data: bytes) -> str:
    suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if suffix == "docx":
        return _decode_docx_file(data)
    if suffix == "pdf":
        return _decode_pdf_file(data)
    if suffix in {"png", "jpg", "jpeg", "gif", "webp", "mp4", "mov", "mp3", "wav", "zip", "doc", "xlsx", "pptx"}:
        return ""
    if data.startswith(b"PK\x03\x04"):
        return ""
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            text = data.decode(encoding)
            return text.replace("\x00", "").strip()
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="ignore").replace("\x00", "").strip()


def _parse_multipart(body: bytes, content_type: str) -> dict:
    match = re.search(r"boundary=(?P<boundary>[^;]+)", content_type)
    if not match:
        return {}
    boundary = match.group("boundary").strip().strip('"').encode()
    values: dict = {}
    for part in body.split(b"--" + boundary):
        part = part.strip()
        if not part or part == b"--" or b"\r\n\r\n" not in part:
            continue
        raw_headers, payload = part.split(b"\r\n\r\n", 1)
        payload = payload.rstrip(b"\r\n")
        if payload.endswith(b"--"):
            payload = payload[:-2].rstrip(b"\r\n")
        headers = raw_headers.decode("latin-1", errors="ignore")
        disposition = next(
            (line for line in headers.split("\r\n") if line.lower().startswith("content-disposition:")),
            "",
        )
        name_match = re.search(r'name="([^"]+)"', disposition)
        if not name_match:
            continue
        name = name_match.group(1)
        filename_match = re.search(r'filename="([^"]*)"', disposition)
        if filename_match:
            values[name] = {
                "filename": filename_match.group(1),
                "content": payload,
            }
        else:
            values[name] = payload.decode("utf-8", errors="ignore")
    return values


@router.get("/sessions/{session_id}/messages", response_model=list[SessionMessageItem])
def list_session_messages(session_id: str) -> list[SessionMessageItem]:
    record = get_session(session_id)
    if not record:
        raise HTTPException(status_code=404, detail="Không tìm thấy session")
    return [SessionMessageItem(**item) for item in list_messages(session_id)]


def _sse(event: dict) -> bytes:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n".encode("utf-8")


def _build_agent_message(content: str, images: list[str] | None):
    valid_images = [
        image
        for image in (images or [])
        if isinstance(image, str) and image.startswith("data:image/") and "," in image
    ]
    if not valid_images:
        return content

    text = re.sub(r"!\[[^\]]*\]\(data:image/[^)\s]+\)", "", content or "").strip()
    text = text or "Hãy đọc và phân tích ảnh màn hình này."
    parts = [{"type": "text", "text": text}]
    parts.extend({"type": "image_url", "image_url": {"url": image}} for image in valid_images)
    return parts


@router.post("/sessions/{session_id}/messages")
def create_message(session_id: str, payload: MessageRequest, request: Request) -> StreamingResponse:
    record = get_session(session_id)
    if not record:
        raise HTTPException(status_code=404, detail="Không tìm thấy session")

    user_id = resolve_user_id(request.headers.get("authorization"))

    # Telegram/cron không truyền provider → dùng đúng provider/model chat đang chọn.
    if not payload.provider and user_id:
        from api.services.user_store import get_user_by_id, get_connection
        user = get_user_by_id(user_id)
        if user and user.get("default_provider"):
            payload.provider = user["default_provider"]
            if not payload.model:
                try:
                    with get_connection() as conn:
                        row = conn.execute(
                            "SELECT model, context_length FROM custom_providers WHERE user_id = ? AND name = ?",
                            (user_id, payload.provider),
                        ).fetchone()
                    if row:
                        if row["model"] and not payload.model:
                            payload.model = row["model"]
                        if row["context_length"] and not payload.contextLength:
                            payload.contextLength = row["context_length"]
                except Exception:
                    pass

    events: queue.Queue[dict | None] = queue.Queue()
    final_usage: dict = {}
    streamed_parts: list[str] = []
    assistant_message_id: str | None = None
    last_db_update = [0.0]
    tool_previews: dict[str, str] = {}

    def emit(type_: str, data: dict | None = None) -> None:
        event = {"type": type_, **(data or {})}
        try:
            # Only save non-appended thoughts or tools to the database journal
            if not event.get("append"):
                if type_ == "think" and event.get("content"):
                    add_journal(session_id, "think", message_id=assistant_message_id, content=str(event.get("content")))
                elif type_ == "tool":
                    add_journal(
                        session_id,
                        "tool",
                        message_id=assistant_message_id,
                        event_name=str(event.get("name") or ""),
                        status=str(event.get("status") or ""),
                        content=str(event.get("label") or ""),
                        count=int(event.get("count") or 0),
                        input=event.get("input"),
                        output=event.get("output"),
                    )
        except Exception:
            pass
        events.put(event)

    def tool_progress(event_name: str, tool_name: str, preview=None, args=None, **kwargs) -> None:
        status = "start" if event_name == "tool.started" else "done" if event_name == "tool.completed" else "info"
        if status == "done":
            # Will be emitted via tool_complete so we have the result
            return
        label = preview or tool_name
        record_tool(session_id, tool_name or event_name, str(label), status)
        
        args_str = json.dumps(args, ensure_ascii=False) if args else ""
        if status == "start" and args:
            tool_previews[args_str] = str(label)

        emit("tool", {
            "name": tool_name or event_name,
            "label": str(label),
            "status": status,
            "count": 1,
            "error": bool(kwargs.get("is_error")),
            "input": args_str if args else None,
        })

    stream_buffer = [""]

    def stream_content(delta: str | None) -> None:
        if delta:
            streamed_parts.append(delta)
            stream_buffer[0] += delta
            
            # Emit completed words
            buffer_content = stream_buffer[0]
            last_space_idx = max(buffer_content.rfind(" "), buffer_content.rfind("\n"))
            if last_space_idx != -1:
                to_emit = buffer_content[:last_space_idx + 1]
                stream_buffer[0] = buffer_content[last_space_idx + 1:]
                emit("content", {"content": to_emit})
            elif len(buffer_content) > 50:
                emit("content", {"content": buffer_content})
                stream_buffer[0] = ""

            if assistant_message_id:
                current_time = time.time()
                if current_time - last_db_update[0] >= 1.0:
                    current_reply = "".join(streamed_parts)
                    update_message_content(assistant_message_id, current_reply)
                    last_db_update[0] = current_time

    def thinking(content: str | None) -> None:
        if content:
            emit("think", {"content": content, "detail": False})

    def reasoning(content: str | None) -> None:
        if content:
            emit("think", {"content": content, "append": True})

    def status(kind: str, message: str) -> None:
        if message:
            emit("think", {"content": message, "detail": False, "kind": kind})

    def step(iteration: int, prev_tools: list) -> None:
        emit("think", {"content": f"Đang thực thi vòng {iteration}", "detail": True})

    def tool_complete(tool_call_id: str, name: str, args: dict, result) -> None:
        record_tool_result(session_id, name, args, result)
        
        args_str = json.dumps(args, ensure_ascii=False) if args else ""
        label = tool_previews.get(args_str) or name
        
        output_str = ""
        is_error = False
        if isinstance(result, (dict, list)):
            output_str = json.dumps(result, ensure_ascii=False)
        else:
            output_str = str(result)
            
        if isinstance(result, str) and ("Error executing tool" in result or "error" in result.lower()[:20]):
            is_error = True
        elif isinstance(result, dict) and "error" in result:
            is_error = True
            
        emit("tool", {
            "name": name,
            "label": label,
            "status": "done",
            "count": 1,
            "error": is_error,
            "input": args_str if args else None,
            "output": output_str,
        })
        
        if name == "todo":
            emit("workspace", get_workspace_state(session_id))
        if name in ("write_file", "patch") and isinstance(result, str):
            _emit_file_change(name, args, result)

    def _emit_file_change(name: str, args: dict, result: str) -> None:
        try:
            data = json.loads(result.strip())
            if not isinstance(data, dict) or data.get("error"):
                return
        except Exception:
            return

        filepath = str((args or {}).get("path", ""))
        added = 0
        removed = 0

        if name == "write_file":
            content = str((args or {}).get("content", ""))
            added = content.count("\n")
            if content and not content.endswith("\n"):
                added += 1
            if data.get("bytes_written", 0) > 0 and added == 0 and content.strip():
                added = 1
        elif name == "patch":
            diff = data.get("diff", "")
            patches = data.get("patches", [])
            for line in diff.split("\n"):
                if line.startswith("+"):
                    added += 1
                elif line.startswith("-"):
                    removed += 1

        if filepath or added or removed:
            emit("file_change", {
                "path": filepath,
                "added": added,
                "removed": removed,
                "tool": name,
                "patches": patches if name == "patch" else [],
            })
            try:
                add_journal(
                    session_id,
                    "file_change",
                    message_id=assistant_message_id,
                    event_name=filepath,
                    content=json.dumps({"added": added, "removed": removed, "tool": name, "patches": patches if name == "patch" else []}),
                )
            except Exception:
                pass

    def worker() -> None:
        nonlocal assistant_message_id
        mark_running(session_id)
        if not record.messages:
            # Giữ nguyên title [Te]... nếu session từ Telegram
            from api.services.session_store import get_session
            current = get_session(session_id)
            if not current or not (current.title or "").startswith("[Te]"):
                update_session_title(session_id, payload.content)
        user_message_id = add_message(
            session_id,
            "user",
            payload.content,
            provider=_provider_name(payload.provider),
        )
        assistant_message_id = add_message(
            session_id,
            "assistant",
            "",
            provider=_provider_name(payload.provider),
        )
        for label in analyze_with_js_heuristics(payload.content):
            emit("think", {"content": label, "detail": False})

        try:
            if is_stop_requested(session_id):
                reply = "Đã dừng xử lý theo yêu cầu."
                update_message_content(assistant_message_id, reply)
                emit("content", {"content": reply})
                emit("done", {"messageId": assistant_message_id, "usage": {}})
                return

            agent_message = _build_agent_message(payload.content, payload.images)
            if getattr(payload, "force_professor", False):
                # Ép cứng quy trình: agent thu thập context → hỏi giáo sư →
                # thực thi. Nếu agent định trả thẳng text, prefix sẽ buộc
                # nó dừng và đi qua ask_chatgpt2api trước.
                if isinstance(agent_message, str):
                    agent_message = (
                        "[CHẾ ĐỘ HỎI GIÁO SƯ — bật cứng]\n"
                        "Tuân thủ NGHIÊM quy trình 4 bước:\n"
                        "1. Thu thập context (read_file/search_files/bash) — 1-3 lượt.\n"
                        "2. Gọi ask_chatgpt2api với context vừa thu thập + câu hỏi user.\n"
                        "3. Đọc kế hoạch giáo sư trả về.\n"
                        "4. Thực thi từng bước bằng patch/write_file/bash.\n"
                        "Cấm trả text khi chưa qua đủ 4 bước.\n\n"
                        f"Yêu cầu của user:\n{agent_message}"
                    )
            reply, usage = run_source_agent(
                session_id=session_id,
                user_message=agent_message,
                provider_name=payload.provider,
                model_override=payload.model,
                context_length_override=payload.contextLength,
                stream_callback=stream_content,
                tool_progress_callback=tool_progress,
                thinking_callback=thinking,
                reasoning_callback=reasoning,
                status_callback=status,
                step_callback=step,
                tool_complete_callback=tool_complete,
                agent_mode=payload.agent_mode,
            )
            final_usage.update(usage or {})
            if stream_buffer[0]:
                emit("content", {"content": stream_buffer[0]})
                stream_buffer[0] = ""

            if reply and not "".join(streamed_parts).strip():
                emit("content", {"content": reply})

            update_message_content(
                assistant_message_id,
                reply,
                usage=usage,
            )
            emit("done", {"messageId": assistant_message_id, "usage": usage or {}})
            _run_post_chat_task(
                _save_wiki_background,
                user_id,
                payload.content,
                reply,
                payload.provider,
                payload.model,
                session_id,
            )
            _run_post_chat_task(
                _reflect_background,
                user_id,
                session_id,
                user_message_id,
                assistant_message_id,
                payload.content,
                reply,
                payload.provider,
                payload.model,
            )

        except Exception as exc:  # noqa: BLE001
            error_text = f"Agent nguồn chưa chạy được: {exc}"
            partial = "".join(streamed_parts).strip()
            # Flush remaining stream buffer so no partial word is lost
            if stream_buffer[0]:
                emit("content", {"content": stream_buffer[0]})
                stream_buffer[0] = ""
            if partial:
                update_message_content(assistant_message_id, partial + "\n\n" + error_text)
            else:
                update_message_content(assistant_message_id, error_text)
            emit("error", {"error": error_text, "messageId": assistant_message_id})
        finally:
            finish_session(session_id)
            events.put(None)

    def event_stream():
        thread = threading.Thread(target=worker, daemon=True)
        thread.start()
        while True:
            event = events.get()
            if event is None:
                break
            yield _sse(event)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _save_wiki_background(
    user_id: str,
    user_content: str,
    assistant_content: str,
    provider: str | None,
    model: str | None,
    session_id: str,
) -> None:
    try:
        result = extract_and_save_wiki(user_id, user_content, assistant_content, provider, model)
        if result:
            add_journal(
                session_id,
                "tool",
                event_name="wiki_memory",
                status="done",
                count=1,
            )
    except Exception:
        pass


def _reflect_background(
    user_id: str,
    session_id: str,
    user_message_id: str | None,
    assistant_message_id: str | None,
    user_content: str,
    assistant_content: str,
    provider: str | None,
    model: str | None,
) -> None:
    try:
        events = reflect_interaction(
            user_id=user_id,
            session_id=session_id,
            user_message_id=user_message_id,
            assistant_message_id=assistant_message_id,
            user_content=user_content,
            assistant_content=assistant_content,
            provider=provider,
            model=model,
        )
        if events:
            add_journal(
                session_id,
                "tool",
                message_id=assistant_message_id,
                event_name="self_evolution",
                status="done",
                count=len(events),
            )
    except Exception:
        pass


@router.post("/sessions/{session_id}/messages/raw")
def add_raw_messages(session_id: str, payload: RawMessageRequest) -> dict:
    """Chèn message user + assistant vào session (không streaming, không trigger agent)."""
    record = get_session(session_id)
    if not record:
        raise HTTPException(status_code=404, detail="Không tìm thấy session")
    add_message(session_id, "user", payload.content, provider=_provider_name(payload.provider))
    if payload.assistant:
        assistant_id = add_message(session_id, "assistant", payload.assistant, provider=_provider_name(payload.provider))
        add_journal(session_id, "tool", message_id=assistant_id, event_name="upload_file", status="done", count=1)
    return {"status": "ok"}


@router.delete("/sessions/{session_id}/messages/{message_id}")
def delete_session_message(session_id: str, message_id: str) -> dict:
    if not get_session(session_id):
        raise HTTPException(status_code=404, detail="Không tìm thấy session")
    return {"deleted": delete_message(session_id, message_id)}


@router.get("/sessions/{session_id}/journal")
def get_session_journal(session_id: str, messageId: str | None = None) -> list[dict]:
    if not get_session(session_id):
        raise HTTPException(status_code=404, detail="Không tìm thấy session")
    return list_journal(session_id, messageId)


@router.delete("/sessions/{session_id}/journal")
def delete_session_journal(session_id: str) -> dict:
    if not get_session(session_id):
        raise HTTPException(status_code=404, detail="Không tìm thấy session")
    return {"deleted": clear_journal(session_id)}


@router.post("/sessions/{session_id}/async", response_model=AsyncMessageResponse)
def create_message_async(
    session_id: str,
    payload: MessageRequest,
    background_tasks: BackgroundTasks,
) -> AsyncMessageResponse:
    record = get_session(session_id)
    if not record:
        raise HTTPException(status_code=404, detail="Không tìm thấy session")
    if not record.messages:
        update_session_title(session_id, payload.content)
    mark_running(session_id)
    message_id = add_message(
        session_id,
        "user",
        payload.content,
        provider=_provider_name(payload.provider),
    )
    add_journal(
        session_id,
        "think",
        message_id=message_id,
        content="HAgent nhận tin nhắn ở chế độ nền.",
    )
    background_tasks.add_task(
        _run_background_message,
        session_id,
        payload.content,
        payload.provider,
        payload.model,
        payload.contextLength,
    )
    return AsyncMessageResponse(taskId=str(uuid4()), messageId=message_id, status="processing")


@router.post("/sessions/{session_id}/process-file")
async def process_session_file(session_id: str, request: Request) -> dict:
    record = get_session(session_id)
    if not record:
        raise HTTPException(status_code=404, detail="Không tìm thấy session")

    body = await request.body()
    parts = _parse_multipart(body, request.headers.get("content-type", ""))
    file_part = parts.get("file")
    provider = parts.get("provider") if isinstance(parts.get("provider"), str) else None
    if not isinstance(file_part, dict):
        raise HTTPException(status_code=400, detail="No file uploaded")

    filename = file_part.get("filename") or "upload.txt"
    content = _decode_text_file(filename, file_part.get("content") or b"")
    if not content:
        return {
            "entries": [],
            "skipped": True,
            "fileName": filename,
            "error": "File rỗng hoặc định dạng này chưa đọc trực tiếp được trong HAgent.",
        }

    clipped = content[:45000]
    if len(content) > len(clipped):
        clipped += "\n\n[Đã cắt bớt vì file quá dài]"
    preview = clipped[:5000]
    if len(clipped) > len(preview):
        preview += "\n\n[Đã ẩn bớt nội dung file trong giao diện]"
    import_message = f"Đã nhập file {filename}. Nội dung đã trích xuất:\n\n{preview}"
    add_message(session_id, "user", import_message, provider=_provider_name(provider))
    assistant_text = (
        f"Đã nạp file {filename} vào phiên chat. "
        "Bạn có thể yêu cầu HAgent tóm tắt, phân tích, hoặc trích xuất việc cần làm từ nội dung này."
    )
    assistant_id = add_message(session_id, "assistant", assistant_text, provider=_provider_name(provider))
    add_journal(
        session_id,
        "tool",
        message_id=assistant_id,
        event_name="process_file",
        status="done",
        count=1,
    )
    return {
        "entries": [{
            "entry": {
                "title": filename,
                "summary": clipped[:300],
                "content": clipped,
                "source": "upload",
            },
            "existing": False,
            "skipped": False,
            "merged": False,
            "chunkIndex": 0,
        }],
        "fileName": filename,
        "totalEntries": 1,
    }


@router.post("/sessions/{session_id}/messages/raw")
def add_raw_messages(session_id: str, payload: RawMessageRequest) -> dict:
    """Chèn message user + assistant vào session (không streaming, không trigger agent)."""
    record = get_session(session_id)
    if not record:
        raise HTTPException(status_code=404, detail="Không tìm thấy session")
    add_message(session_id, "user", payload.content, provider=_provider_name(payload.provider))
    if payload.assistant:
        assistant_id = add_message(session_id, "assistant", payload.assistant, provider=_provider_name(payload.provider))
        add_journal(session_id, "tool", message_id=assistant_id, event_name="upload_file", status="done", count=1)
    return {"status": "ok"}


@router.post("/sessions/{session_id}/upload")
async def upload_session_file(session_id: str, request: Request) -> dict:
    if not get_session(session_id):
        raise HTTPException(status_code=404, detail="Không tìm thấy session")
    body = await request.body()
    parts = _parse_multipart(body, request.headers.get("content-type", ""))
    file_part = parts.get("file")
    if not isinstance(file_part, dict):
        raise HTTPException(status_code=400, detail="No file uploaded")
    data = file_part.get("content") or b""
    filename = file_part.get("filename") or "upload"
    # Lưu file vào disk
    upload_dir = UPLOAD_ROOT / session_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    safe_name = filename.replace("\\", "_").replace("/", "_")
    dest = upload_dir / safe_name
    dest.write_bytes(data)
    return {
        "name": filename,
        "path": str(dest.relative_to(BACKEND_ROOT.parent)),
        "size": len(data),
        "type": request.headers.get("content-type", ""),
    }


@router.post("/paste")
def paste_content(payload: PasteRequest) -> dict:
    return {
        "type": "hagent_context",
        "response": "Nội dung đã sẵn sàng để đưa vào chat HAgent.",
        "entry": {
            "title": payload.content.splitlines()[0][:80] if payload.content.splitlines() else "Paste",
            "content": payload.content,
            "source": "paste",
        },
        "wikiUpdate": None,
    }
