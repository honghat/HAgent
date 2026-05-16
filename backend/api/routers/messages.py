from __future__ import annotations

import json
import queue
import re
import threading
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import StreamingResponse

from api.schemas import (
    AsyncMessageResponse,
    MessageRequest,
    MessageResponse,
    PasteRequest,
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
)
from api.services.source_core_agent import run_source_agent
from api.services.source_core_agent import analyze_with_js_heuristics
from api.services.workspace_state import record_tool, record_tool_result
from api.services.wiki_memory import extract_and_save_wiki, resolve_user_id


router = APIRouter(tags=["messages"])


def _provider_name(provider: str | None) -> str | None:
    return provider or None


def _run_and_store_reply(
    session_id: str,
    content: str,
    provider: str | None,
    model: str | None = None,
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
        )
        message_id = add_message(
            session_id,
            "assistant",
            reply,
            provider=_provider_name(provider),
            usage=usage,
        )
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


def _run_background_message(session_id: str, content: str, provider: str | None, model: str | None = None) -> None:
    try:
        _run_and_store_reply(session_id, content, provider, model)
    finally:
        finish_session(session_id)


def _decode_text_file(filename: str, data: bytes) -> str:
    suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if suffix in {"png", "jpg", "jpeg", "gif", "webp", "mp4", "mov", "mp3", "wav", "zip"}:
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


@router.post("/sessions/{session_id}/messages")
def create_message(session_id: str, payload: MessageRequest, request: Request) -> StreamingResponse:
    record = get_session(session_id)
    if not record:
        raise HTTPException(status_code=404, detail="Không tìm thấy session")

    user_id = resolve_user_id(request.headers.get("authorization"))
    events: queue.Queue[dict | None] = queue.Queue()
    final_usage: dict = {}
    streamed_parts: list[str] = []

    def emit(type_: str, data: dict | None = None) -> None:
        event = {"type": type_, **(data or {})}
        try:
            # Only save non-appended thoughts or tools to the database journal
            if not event.get("append"):
                if type_ == "think" and event.get("content"):
                    add_journal(session_id, "think", content=str(event.get("content")))
                elif type_ == "tool":
                    add_journal(
                        session_id,
                        "tool",
                        event_name=str(event.get("name") or ""),
                        status=str(event.get("status") or ""),
                        count=int(event.get("count") or 0),
                    )
        except Exception:
            pass
        events.put(event)

    def tool_progress(event_name: str, tool_name: str, preview=None, args=None, **kwargs) -> None:
        status = "start" if event_name == "tool.started" else "done" if event_name == "tool.completed" else "info"
        label = preview or tool_name
        record_tool(session_id, tool_name or event_name, str(label), status)
        emit("tool", {
            "name": tool_name or event_name,
            "label": str(label),
            "status": status,
            "count": 1,
            "error": bool(kwargs.get("is_error")),
        })

    def stream_content(delta: str | None) -> None:
        if delta:
            streamed_parts.append(delta)
            emit("content", {"content": delta})

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

    def worker() -> None:
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
        emit("think", {"content": "HAgent nhận tin nhắn và chuẩn bị ngữ cảnh.", "detail": False})
        for label in analyze_with_js_heuristics(payload.content):
            emit("think", {"content": label, "detail": False})

        try:
            if is_stop_requested(session_id):
                reply = "Đã dừng xử lý theo yêu cầu."
                message_id = add_message(session_id, "assistant", reply, provider=_provider_name(payload.provider))
                emit("content", {"content": reply})
                emit("done", {"messageId": message_id, "usage": {}})
                return

            reply, usage = run_source_agent(
                session_id=session_id,
                user_message=payload.content,
                provider_name=payload.provider,
                model_override=payload.model,
                stream_callback=stream_content,
                tool_progress_callback=tool_progress,
                thinking_callback=thinking,
                reasoning_callback=reasoning,
                status_callback=status,
                step_callback=step,
                tool_complete_callback=tool_complete,
            )
            final_usage.update(usage or {})
            if reply and not "".join(streamed_parts).strip():
                emit("content", {"content": reply})
            message_id = add_message(
                session_id,
                "assistant",
                reply,
                provider=_provider_name(payload.provider),
                usage=usage,
            )
            emit("done", {"messageId": message_id, "usage": usage or {}})
            threading.Thread(
                target=_save_wiki_background,
                args=(user_id, payload.content, reply, payload.provider, payload.model, session_id),
                daemon=True,
            ).start()

        except Exception as exc:  # noqa: BLE001
            error_text = f"Agent nguồn chưa chạy được: {exc}"
            message_id = add_message(session_id, "assistant", error_text, provider=_provider_name(payload.provider))
            emit("error", {"error": error_text, "messageId": message_id})
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
    background_tasks.add_task(_run_background_message, session_id, payload.content, payload.provider, payload.model)
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
    import_message = f"Đã nhập file {filename}. Nội dung:\n\n{clipped}"
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
    return {
        "name": file_part.get("filename") or "upload",
        "path": "",
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
