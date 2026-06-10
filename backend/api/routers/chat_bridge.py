"""ReAct wrapper cho proxy không hỗ trợ tool calling (chatgpt2api).

OpenAI agent của HAgent gửi `tools=[...]` vào /v1/chat/completions, nhưng proxy
chatgpt2api chỉ trả text. Wrapper này:
  - Inject mô tả tools vào system prompt theo format JSON-line.
  - Forward tới upstream proxy, lấy text về.
  - Parse tool-call ra khỏi text → trả về OpenAI tool_calls envelope.
  - Nếu không có tool-call, trả thẳng text.

Endpoint: POST /api/chat-bridge/v1/chat/completions  (mirror OpenAI shape).
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
import uuid
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat-bridge/v1", tags=["chat-bridge"])

UPSTREAM_BASE = (os.environ.get("CHATGPT2API_BASE_URL") or "http://127.0.0.1:3011").rstrip("/")
UPSTREAM_KEY = os.environ.get("CHATGPT2API_AUTH_KEY") or "chatgpt2api"

REACT_INSTRUCTION = """\
Bạn là HAgent — coding agent local trên macOS của user. Repo chính: \
`/Users/nguyenhat/HAgent`. User đã cấp quyền sandbox cho mọi tool.

🚨 LUẬT CỨNG:
- KHÔNG bịa file/folder/process/git/web/system. Cần biết → GỌI TOOL.
- KHÔNG nói "tôi không thể truy cập", "tool không khả dụng" — sai 100%.
- KHÔNG hỏi user xác nhận khi yêu cầu đã rõ. Cứ làm tới cùng.
- Mỗi lượt CHỈ in 1 khối <tool_call>. KHÔNG bọc code fence.

🎓 QUY TRÌNH 4 BƯỚC CHO TASK CODE/SỬA/REFACTOR/DEBUG:

**Bước 1 — Thu thập ngữ cảnh** (1-3 lượt tool):
   Trước khi hỏi giáo sư, agent PHẢI tự thu thập đủ thông tin:
   - <tool_call>search_files</tool_call> định vị file liên quan
   - <tool_call>read_file</tool_call> đọc nội dung file (toàn bộ hoặc đoạn)
   - <tool_call>bash</tool_call> chạy lệnh hiểu state (git status, ls, grep)
   Mục tiêu: có đủ code/error/context để giáo sư đề xuất chính xác.

**Bước 2 — Gửi giáo sư xin kế hoạch**:
   <tool_call>{"name":"ask_chatgpt2api","arguments":{
     "question":"<task user yêu cầu> + <kết quả mong muốn>. Đề xuất KẾ HOẠCH CHI TIẾT từng bước (file nào, dòng nào, thay đổi gì).",
     "context":"<dán code/error/git status/structure đã thu thập ở Bước 1>"
   }}</tool_call>

**Bước 3 — Đọc kế hoạch giáo sư**:
   Giáo sư trả về <tool_result name="ask_chatgpt2api"> chứa kế hoạch chi tiết \
N bước. Đọc kỹ. KHÔNG paste lại text này cho user.

**Bước 4 — Thực thi từng bước**:
   Lặp lại với mỗi bước trong kế hoạch:
   - <tool_call>read_file</tool_call> nếu cần re-confirm trước khi sửa
   - <tool_call>patch hoặc write_file</tool_call> apply thay đổi THẬT
   - <tool_call>bash</tool_call> verify (lint/test/build)
   Sau khi xong tất cả bước, trả text NGẮN tóm tắt: file nào sửa, verify pass.

Ngoại lệ — task tra cứu nhanh (ls, pwd, git status, đếm file, đọc 1 file để \
show cho user) → làm thẳng Bước 1 + trả kết quả, KHÔNG cần qua Bước 2-4.

⚠️ CẤM:
- Hỏi giáo sư mà chưa thu thập context → giáo sư đề xuất sai vì thiếu info.
- Sau khi giáo sư trả kế hoạch → paste cho user mà không thi hành.
- "Bạn có muốn tôi sửa không?" → SAI. Đã có kế hoạch → cứ sửa.
- Trả text kết thúc khi mới làm xong 1/N bước trong kế hoạch.

🔁 KHI GẶP KHÓ KHĂN — HỎI GIÁO SƯ NHIỀU LẦN:
Giáo sư có thể được gọi LẶP LẠI trong cùng task khi gặp tình huống mới:
- Lệnh patch/bash thất bại → gọi giáo sư với error trace + bối cảnh hiện tại.
- Đọc file ra phát hiện code phức tạp hơn dự đoán → xin kế hoạch cập nhật.
- Có > 2 cách làm khả dĩ, không chắc chọn cách nào → hỏi giáo sư đánh giá.
- Hết 80% kế hoạch ban đầu mà chưa pass test → hỏi lại.
KHÔNG ngại tốn token: thà hỏi 3 lần làm đúng còn hơn làm 1 lần sai phải undo.

CÚ PHÁP TOOL CALL:

<tool_call>
{"name": "tên-tool", "arguments": {<JSON args>}}
</tool_call>

VÍ DỤ ĐẦY ĐỦ — user: "sửa lỗi format Chat.jsx":

Lượt 1 (thu thập): <tool_call>{"name":"read_file","arguments":{"path":"/Users/nguyenhat/HAgent/frontend/src/components/Chat.jsx"}}</tool_call>
Lượt 2 (hỏi giáo sư): <tool_call>{"name":"ask_chatgpt2api","arguments":{"question":"Sửa lỗi format Chat.jsx. Đề xuất kế hoạch chi tiết từng chỗ cần đổi.","context":"<paste 200 dòng đầu file vừa đọc>"}}</tool_call>
Lượt 3 (apply bước 1): <tool_call>{"name":"patch","arguments":{...}}</tool_call>
Lượt 4 (apply bước 2): <tool_call>{"name":"patch","arguments":{...}}</tool_call>
Lượt 5 (verify): <tool_call>{"name":"bash","arguments":{"command":"cd /Users/nguyenhat/HAgent/frontend && npx eslint src/components/Chat.jsx"}}</tool_call>
Lượt 6 (báo kết quả): "Đã sửa Chat.jsx theo kế hoạch giáo sư (3 chỗ format), eslint pass."

DANH SÁCH TOOL:
"""

TOOL_CALL_RE = re.compile(r"<tool_call>\s*(\{.*?\})\s*</tool_call>", re.DOTALL)
# Fallback: model in raw `{"name":"x","arguments":...}` không trong tag (ChatGPT
# đôi khi quên tag). Chỉ áp dụng khi response KHÔNG có <tool_call> nào.
RAW_CALL_RE = re.compile(
    r'\{\s*"name"\s*:\s*"([a-zA-Z_][\w-]{0,80})"\s*,\s*"arguments"\s*:\s*(\{.*?\})\s*\}',
    re.DOTALL,
)


def _format_tools(tools: list[dict]) -> str:
    """Render tool catalog gọn: 1 dòng / tool. Tránh dump JSON schema → 413."""
    out: list[str] = []
    for t in tools or []:
        fn = t.get("function") if isinstance(t, dict) else None
        if not isinstance(fn, dict):
            continue
        name = fn.get("name") or ""
        if not name:
            continue
        desc = (fn.get("description") or "").strip().replace("\n", " ")
        if len(desc) > 140:
            desc = desc[:137] + "..."
        params = fn.get("parameters") or {}
        props = params.get("properties") if isinstance(params, dict) else None
        required = params.get("required") if isinstance(params, dict) else None
        param_keys: list[str] = []
        if isinstance(props, dict):
            for key, spec in props.items():
                tag = key
                if isinstance(spec, dict):
                    typ = spec.get("type") or ""
                    if typ:
                        tag = f"{key}:{typ}"
                if isinstance(required, list) and key not in required:
                    tag = f"{tag}?"
                param_keys.append(tag)
        sig = ", ".join(param_keys)
        out.append(f"- {name}({sig}): {desc}" if desc else f"- {name}({sig})")
    return "\n".join(out)


def _inject_tools_prompt(messages: list[dict], tools: list[dict]) -> list[dict]:
    """Đẩy ReAct instruction vào CUỐI message list (system role) để model thấy
    rõ rules tool ngay sát ngữ cảnh, không bị system prompt dài chôn vùi."""
    if not tools:
        return messages
    instruction = REACT_INSTRUCTION + _format_tools(tools)
    react_msg = {"role": "system", "content": instruction}
    # Chèn TRƯỚC user/assistant cuối cùng để model thấy ngay sau system gốc
    out: list[dict] = list(messages)
    # Tìm vị trí trước message non-system cuối cùng
    insert_at = len(out)
    for i in range(len(out) - 1, -1, -1):
        if out[i].get("role") != "system":
            insert_at = i
            break
    out.insert(insert_at, react_msg)
    return out


def _msg_size(m: dict) -> int:
    try:
        return len(json.dumps(m, ensure_ascii=False).encode())
    except Exception:
        return len(str(m).encode())


def _cap_messages(messages: list[dict], *, max_bytes: int = 80_000) -> list[dict]:
    """Giữ TẤT CẢ system + tail messages gần nhất sao cho tổng <= max_bytes.

    ChatGPT proxy có giới hạn body (~100KB) → 413. Nếu vượt, drop từ đầu
    history (sau system prompts) cho đến khi vừa.
    """
    if not messages:
        return messages

    # Tách system (giữ nguyên thứ tự) + non-system (drop từ đầu nếu cần)
    system_msgs: list[dict] = []
    other_msgs: list[dict] = []
    for m in messages:
        if m.get("role") == "system":
            system_msgs.append(m)
        else:
            other_msgs.append(m)

    # Truncate content non-system quá dài (>30KB) — thường là tool_result
    other_capped: list[dict] = []
    for m in other_msgs:
        c = m.get("content")
        if isinstance(c, str) and len(c.encode()) > 30_000:
            cut = c.encode()[:30_000].decode(errors="ignore")
            m = {**m, "content": cut + "\n...[đã rút gọn]"}
        other_capped.append(m)

    sys_size = sum(_msg_size(m) for m in system_msgs)
    if sys_size + sum(_msg_size(m) for m in other_capped) <= max_bytes:
        return system_msgs + other_capped

    # Giữ tail, drop dần từ đầu non-system
    budget = max(0, max_bytes - sys_size)
    keep_size = 0
    kept_tail: list[dict] = []
    for m in reversed(other_capped):
        sz = _msg_size(m)
        if keep_size + sz > budget and kept_tail:
            break
        kept_tail.append(m)
        keep_size += sz
    kept_tail.reverse()

    dropped = len(other_capped) - len(kept_tail)
    if dropped > 0:
        notice = {
            "role": "system",
            "content": f"[Hệ thống đã rút gọn {dropped} tin nhắn cũ để vừa ngữ cảnh.]",
        }
        return system_msgs + [notice] + kept_tail
    return system_msgs + kept_tail


def _flatten_tool_messages(messages: list[dict]) -> list[dict]:
    """Convert role=tool / assistant.tool_calls → plain text cho upstream."""
    out: list[dict] = []
    for m in messages:
        role = m.get("role")
        if role == "tool":
            content = m.get("content") or ""
            name = m.get("name") or m.get("tool_call_id") or "tool"
            out.append({
                "role": "user",
                "content": f"<tool_result name=\"{name}\">\n{content}\n</tool_result>",
            })
            continue
        if role == "assistant" and isinstance(m.get("tool_calls"), list) and m["tool_calls"]:
            calls_text = []
            for tc in m["tool_calls"]:
                fn = (tc or {}).get("function") or {}
                args = fn.get("arguments")
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except Exception:
                        args = {"_raw": args}
                calls_text.append(json.dumps({"name": fn.get("name") or "", "arguments": args or {}}, ensure_ascii=False))
            text = (m.get("content") or "").strip()
            for c in calls_text:
                text = (text + f"\n<tool_call>\n{c}\n</tool_call>").strip()
            out.append({"role": "assistant", "content": text})
            continue
        out.append({k: v for k, v in m.items() if k in ("role", "content")})
    return out


def _parse_tool_calls(text: str, tool_names: set[str] | None = None) -> tuple[str, list[dict]]:
    """Tìm các <tool_call>{...}</tool_call> trong text. Trả (text_còn_lại, tool_calls)."""
    calls: list[dict] = []
    for match in TOOL_CALL_RE.finditer(text or ""):
        raw = match.group(1).strip()
        try:
            obj = json.loads(raw)
        except Exception:
            continue
        name = obj.get("name") or ""
        if not name:
            continue
        args = obj.get("arguments") or {}
        if not isinstance(args, str):
            args = json.dumps(args, ensure_ascii=False)
        calls.append({
            "id": f"call_{uuid.uuid4().hex[:16]}",
            "type": "function",
            "function": {"name": name, "arguments": args},
        })
    cleaned = TOOL_CALL_RE.sub("", text or "").strip()

    # Fallback: nếu chưa bắt được call nào nhưng text chứa JSON dạng
    # {"name":"<known>","arguments":{...}} thì treat as tool_call.
    if not calls and tool_names:
        for match in RAW_CALL_RE.finditer(cleaned):
            name = match.group(1)
            if name not in tool_names:
                continue
            try:
                args_obj = json.loads(match.group(2))
            except Exception:
                continue
            calls.append({
                "id": f"call_{uuid.uuid4().hex[:16]}",
                "type": "function",
                "function": {
                    "name": name,
                    "arguments": json.dumps(args_obj, ensure_ascii=False),
                },
            })
        if calls:
            cleaned = RAW_CALL_RE.sub("", cleaned).strip()

    return cleaned, calls


@router.get("/models")
async def list_models(request: Request):
    auth = request.headers.get("authorization") or f"Bearer {UPSTREAM_KEY}"
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(f"{UPSTREAM_BASE}/v1/models", headers={"Authorization": auth})
        return r.json() if r.is_success else {"object": "list", "data": []}
    except Exception:
        return {"object": "list", "data": []}


def _responses_to_chat_messages(body: dict) -> list[dict]:
    """Convert OpenAI Responses API input to chat/completions messages."""
    instructions = body.get("instructions") or ""
    messages: list[dict] = []
    if instructions:
        messages.append({"role": "system", "content": instructions})

    inp = body.get("input")
    if isinstance(inp, str):
        messages.append({"role": "user", "content": inp})
    elif isinstance(inp, list):
        for item in inp:
            if not isinstance(item, dict):
                continue
            item_type = item.get("type")

            # Responses API tool exchange: function_call + function_call_output
            if item_type == "function_call":
                name = item.get("name") or ""
                args = item.get("arguments")
                if not isinstance(args, str):
                    args = json.dumps(args or {}, ensure_ascii=False)
                messages.append({
                    "role": "assistant",
                    "content": f"<tool_call>\n{json.dumps({'name': name, 'arguments': args}, ensure_ascii=False)}\n</tool_call>",
                })
                continue
            if item_type == "function_call_output":
                output = item.get("output")
                if isinstance(output, list):
                    output = "\n".join(
                        c.get("text", "") if isinstance(c, dict) else str(c)
                        for c in output
                    )
                elif not isinstance(output, str):
                    output = json.dumps(output, ensure_ascii=False)
                call_id = item.get("call_id") or item.get("id") or "tool"
                messages.append({
                    "role": "user",
                    "content": f"<tool_result name=\"{call_id}\">\n{output}\n</tool_result>",
                })
                continue

            role = item.get("role") or "user"
            content = item.get("content")
            if isinstance(content, list):
                parts = []
                for c in content:
                    if isinstance(c, dict):
                        text = c.get("text") or c.get("input_text") or c.get("output_text") or ""
                        if text:
                            parts.append(text)
                content = "\n".join(parts)
            messages.append({"role": role, "content": content or ""})
    return messages


def _chat_to_responses_envelope(chat_data: dict, request_id: str) -> dict:
    """Wrap chat/completions response in Responses API shape."""
    choice = (chat_data.get("choices") or [{}])[0]
    msg = choice.get("message") or {}
    content_text = msg.get("content") or ""
    output: list[dict] = []

    if msg.get("tool_calls"):
        for tc in msg["tool_calls"]:
            fn = (tc or {}).get("function") or {}
            args = fn.get("arguments") or "{}"
            if isinstance(args, str):
                try:
                    args_obj = json.loads(args)
                except Exception:
                    args_obj = {}
            else:
                args_obj = args
            output.append({
                "type": "function_call",
                "id": tc.get("id") or f"fc_{uuid.uuid4().hex[:16]}",
                "call_id": tc.get("id") or f"call_{uuid.uuid4().hex[:16]}",
                "name": fn.get("name") or "",
                "arguments": json.dumps(args_obj, ensure_ascii=False),
                "status": "completed",
            })

    if content_text:
        output.append({
            "type": "message",
            "id": f"msg_{uuid.uuid4().hex[:16]}",
            "role": "assistant",
            "status": "completed",
            "content": [{"type": "output_text", "text": content_text, "annotations": []}],
        })

    # Đảm bảo output không bao giờ rỗng — agent SDK báo "response.output is empty"
    if not output:
        finish = choice.get("finish_reason") or "unknown"
        print(
            f"[chat-bridge] ⚠️ empty output! finish_reason={finish} "
            f"raw_msg={json.dumps(msg, ensure_ascii=False)[:300]}",
            flush=True,
        )
        output.append({
            "type": "message",
            "id": f"msg_{uuid.uuid4().hex[:16]}",
            "role": "assistant",
            "status": "completed",
            "content": [{
                "type": "output_text",
                "text": f"[Bridge: model trả lại nội dung rỗng (finish={finish}). Hãy thử lại.]",
                "annotations": [],
            }],
        })

    return {
        "id": request_id,
        "object": "response",
        "created_at": chat_data.get("created") or int(time.time()),
        "model": chat_data.get("model") or "",
        "status": "completed",
        "output": output,
        "output_text": content_text,
        "usage": chat_data.get("usage") or {},
    }


@router.post("/responses")
async def responses_api(request: Request):
    """Compat shim cho OpenAI Responses API → ánh xạ sang chat/completions."""
    body = await request.json()
    if not isinstance(body, dict):
        raise HTTPException(400, "body must be object")

    request_id = f"resp_{uuid.uuid4().hex[:16]}"
    stream = bool(body.get("stream"))

    chat_body = {
        "model": body.get("model") or "gpt-5-mini",
        "messages": _responses_to_chat_messages(body),
        "stream": False,  # luôn gọi upstream không stream, ta tự emit SSE nếu cần
    }
    for k in ("temperature", "top_p", "max_output_tokens"):
        if k in body and body[k] is not None:
            chat_body["max_tokens" if k == "max_output_tokens" else k] = body[k]

    in_tools = body.get("tools") or []
    chat_tools: list[dict] = []
    for t in in_tools:
        if not isinstance(t, dict):
            continue
        if t.get("type") == "function":
            # Responses API: {type:"function", name, description, parameters}
            # → chat/completions: {type:"function", function:{name, description, parameters}}
            fn_keys = {"name", "description", "parameters", "strict"}
            fn = {k: v for k, v in t.items() if k in fn_keys}
            if not fn.get("name"):
                # Có thể đã wrap sẵn
                inner = t.get("function")
                if isinstance(inner, dict) and inner.get("name"):
                    fn = inner
            if fn.get("name"):
                chat_tools.append({"type": "function", "function": fn})
    if chat_tools:
        chat_body["tools"] = chat_tools

    fake_request = request

    async def _new_json():
        return chat_body

    fake_request.json = _new_json  # type: ignore[assignment]
    chat_resp = await chat_completions(fake_request)
    if not isinstance(chat_resp, dict):
        return chat_resp

    envelope = _chat_to_responses_envelope(chat_resp, request_id)

    if not stream:
        return envelope

    # ── Stream Responses API (SSE) ─────────────────────────────
    from fastapi.responses import StreamingResponse

    def _sse(event: str, data: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

    def gen():
        try:
            from api.services.agent_events import broadcast_agent_event
            broadcast_agent_event("agent.status", {"status": "thinking"})
        except Exception:
            pass
        # 1. response.created
        created_payload = {**envelope, "status": "in_progress", "output": [], "output_text": ""}
        yield _sse("response.created", {"type": "response.created", "response": created_payload})
        yield _sse("response.in_progress", {"type": "response.in_progress", "response": created_payload})

        # 2. emit each output item
        for idx, item in enumerate(envelope.get("output") or []):
            yield _sse("response.output_item.added", {
                "type": "response.output_item.added",
                "output_index": idx,
                "item": item,
            })
            if item.get("type") == "message":
                # Stream text content
                for c_idx, content in enumerate(item.get("content") or []):
                    text = content.get("text") or ""
                    yield _sse("response.content_part.added", {
                        "type": "response.content_part.added",
                        "item_id": item.get("id"),
                        "output_index": idx,
                        "content_index": c_idx,
                        "part": {"type": "output_text", "text": "", "annotations": []},
                    })
                    if text:
                        yield _sse("response.output_text.delta", {
                            "type": "response.output_text.delta",
                            "item_id": item.get("id"),
                            "output_index": idx,
                            "content_index": c_idx,
                            "delta": text,
                        })
                        yield _sse("response.output_text.done", {
                            "type": "response.output_text.done",
                            "item_id": item.get("id"),
                            "output_index": idx,
                            "content_index": c_idx,
                            "text": text,
                        })
                    yield _sse("response.content_part.done", {
                        "type": "response.content_part.done",
                        "item_id": item.get("id"),
                        "output_index": idx,
                        "content_index": c_idx,
                        "part": {"type": "output_text", "text": text, "annotations": []},
                    })
            elif item.get("type") == "function_call":
                yield _sse("response.function_call_arguments.delta", {
                    "type": "response.function_call_arguments.delta",
                    "item_id": item.get("id"),
                    "output_index": idx,
                    "delta": item.get("arguments", ""),
                })
                yield _sse("response.function_call_arguments.done", {
                    "type": "response.function_call_arguments.done",
                    "item_id": item.get("id"),
                    "output_index": idx,
                    "arguments": item.get("arguments", ""),
                })
            yield _sse("response.output_item.done", {
                "type": "response.output_item.done",
                "output_index": idx,
                "item": item,
            })

        # 3. response.completed
        try:
            from api.services.agent_events import broadcast_agent_event
            broadcast_agent_event("agent.status", {"status": "idle"})
        except Exception:
            pass
        yield _sse("response.completed", {"type": "response.completed", "response": envelope})

    return StreamingResponse(gen(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Professor mode — bypass agent loop, gọi thẳng ChatGPT để xin tư vấn
# ---------------------------------------------------------------------------

PROFESSOR_SYSTEM = (
    "Bạn là 'giáo sư' — chuyên gia code/system review. Trả lời tiếng Việt, "
    "ngắn gọn, có cấu trúc, thực dụng. Khi user paste code/error, đưa: "
    "1) chẩn đoán nguyên nhân, 2) hướng sửa cụ thể (kèm code khi cần), "
    "3) lưu ý phụ. KHÔNG hỏi lại, KHÔNG kèm khối <tool_call>, KHÔNG vòng vo."
)

# Fallback chain: thử model mạnh trước, rớt xuống mini nếu trả rỗng.
PROFESSOR_MODEL_CHAIN = ["gpt-5-5", "gpt-5-3", "gpt-5", "gpt-5-mini", "auto"]


async def _professor_call_once(model: str, messages: list[dict]) -> tuple[str | None, dict]:
    try:
        async with httpx.AsyncClient(timeout=180) as c:
            r = await c.post(
                f"{UPSTREAM_BASE}/v1/chat/completions",
                json={"model": model, "messages": messages, "stream": False},
                headers={
                    "Authorization": f"Bearer {UPSTREAM_KEY}",
                    "Content-Type": "application/json",
                },
            )
    except Exception as exc:
        return None, {"error": str(exc)}

    if not r.is_success:
        return None, {"error": f"HTTP {r.status_code}: {r.text[:200]}"}

    data = r.json()
    choices = data.get("choices") or []
    if not choices:
        return None, {"error": "no choices"}
    content = (choices[0].get("message") or {}).get("content") or ""
    if not content.strip():
        return None, {"error": "empty content", "model": model}
    return content.strip(), data.get("usage") or {}


@router.post("/professor")
async def professor_ask(request: Request):
    """Hỏi 'giáo sư' (ChatGPT qua proxy) cho 1 câu. Không tool, không loop.

    Mặc định ưu tiên gpt-5-5 (model full mạnh nhất). Tự fallback xuống
    gpt-5-3 → gpt-5 → gpt-5-mini → auto nếu model trên trả rỗng.
    """
    body = await request.json()
    if not isinstance(body, dict):
        raise HTTPException(400, "body must be object")

    question = (body.get("question") or body.get("input") or "").strip()
    if not question:
        raise HTTPException(400, "missing question")

    context = (body.get("context") or "").strip()
    history = body.get("history") or []
    user_pref_model = (body.get("model") or "").strip()

    messages = [{"role": "system", "content": PROFESSOR_SYSTEM}]
    if isinstance(history, list):
        for m in history[-10:]:
            if isinstance(m, dict) and m.get("role") in ("user", "assistant"):
                messages.append({
                    "role": m["role"],
                    "content": str(m.get("content") or "")[:4000],
                })

    user_text = question if not context else f"{question}\n\n--- CONTEXT ---\n{context}"
    messages.append({"role": "user", "content": user_text})

    # Build chain: nếu user chỉ định model thì thử nó trước
    chain = list(PROFESSOR_MODEL_CHAIN)
    if user_pref_model and user_pref_model in chain:
        chain.remove(user_pref_model)
    if user_pref_model:
        chain.insert(0, user_pref_model)

    tried: list[str] = []
    for m in chain:
        tried.append(m)
        content, info = await _professor_call_once(m, messages)
        if content:
            return {
                "answer": content,
                "model": m,
                "tried": tried,
                "usage": {
                    "tokens_in": info.get("prompt_tokens"),
                    "tokens_out": info.get("completion_tokens"),
                },
            }

    raise HTTPException(
        502,
        f"Tất cả model trong chain đều trả rỗng/lỗi. Đã thử: {tried}",
    )
async def chat_completions(request: Request):
    body = await request.json()
    if not isinstance(body, dict):
        raise HTTPException(400, "body must be object")

    auth = request.headers.get("authorization") or f"Bearer {UPSTREAM_KEY}"
    tools = body.get("tools") or []
    messages = body.get("messages") or []
    model = body.get("model") or "gpt-5-mini"
    stream = bool(body.get("stream"))

    flat = _flatten_tool_messages(messages)
    if tools:
        flat = _inject_tools_prompt(flat, tools)
    flat = _cap_messages(flat, max_bytes=80_000)

    # DEBUG: log nếu có tool_result trong messages (lượt 2+)
    has_tool_result = any(
        "<tool_result" in (m.get("content") or "")
        for m in flat
        if m.get("role") in ("user", "system")
    )
    if has_tool_result:
        last_user = next((m for m in reversed(flat) if m.get("role") == "user"), None)
        if last_user:
            preview = (last_user.get("content") or "")[-500:]
            print(f"[chat-bridge] 2nd-round msg tail: {preview!r}", flush=True)

    payload = {"model": model, "messages": flat, "stream": False}
    for k in ("temperature", "top_p", "max_tokens", "presence_penalty", "frequency_penalty"):
        if k in body and body[k] is not None:
            payload[k] = body[k]

    try:
        async with httpx.AsyncClient(timeout=300) as c:
            r = await c.post(
                f"{UPSTREAM_BASE}/v1/chat/completions",
                json=payload,
                headers={"Authorization": auth, "Content-Type": "application/json"},
            )
    except Exception as exc:
        raise HTTPException(502, f"upstream error: {exc}")

    if r.status_code >= 400:
        raise HTTPException(r.status_code, r.text[:500])

    data = r.json()
    choices = data.get("choices") or []
    if not choices:
        return data

    msg = choices[0].get("message") or {}
    text = msg.get("content") or ""
    tool_names = {
        (t.get("function") or {}).get("name", "")
        for t in (tools or [])
        if isinstance(t, dict)
    } - {""}
    cleaned, tool_calls = _parse_tool_calls(text, tool_names)

    if tool_calls:
        choices[0]["message"] = {
            "role": "assistant",
            "content": cleaned or None,
            "tool_calls": tool_calls,
        }
        choices[0]["finish_reason"] = "tool_calls"

    if stream:
        # Trả single-shot SSE để giữ tương thích — agent của HAgent đọc được cả 2.
        from fastapi.responses import StreamingResponse

        def gen():
            chunk = {
                "id": data.get("id") or f"chatcmpl-{uuid.uuid4().hex[:16]}",
                "object": "chat.completion.chunk",
                "created": data.get("created") or int(time.time()),
                "model": model,
                "choices": [{
                    "index": 0,
                    "delta": choices[0]["message"],
                    "finish_reason": choices[0].get("finish_reason") or "stop",
                }],
            }
            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(gen(), media_type="text/event-stream")

    data["choices"] = choices
    return data
