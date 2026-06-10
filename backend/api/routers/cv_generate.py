"""AI-rewrite the user's CV into a fresh DOCX tailored to a target.

Two modes:
 - ``mode="jd"`` — rewrite tailored to a specific JD (uses job url/title/desc).
 - ``mode="role"`` — rewrite tailored to a general target role.

Strategy: read the user's original DOCX paragraphs (each ``w:p`` node), send them
to the LLM as ``{idx, text}``, get back ``[{idx, new_text}]`` for paragraphs to
rewrite, then re-zip the DOCX with substituted ``w:t`` text. Paragraph-level
formatting (heading, bullet, font, color) is preserved; inline runs within a
rewritten paragraph collapse into a single run.
"""
from __future__ import annotations

import json
import re
import shutil
import zipfile
from datetime import datetime
from pathlib import Path
from urllib import error, request as urlrequest
from uuid import uuid4
from xml.etree import ElementTree as ET

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from api.services.db import DATA_DIR, get_connection
from api.routers.cv import _get_user_id


router = APIRouter(prefix="/api/cv", tags=["CV"])

GENERATED_DIR = DATA_DIR / "uploads" / "cv-generated"
GENERATED_DIR.mkdir(parents=True, exist_ok=True)

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
ET.register_namespace("w", W_NS)
NS = {"w": W_NS}


class GenerateBody(BaseModel):
    mode: str = "role"  # "jd" | "role"
    target_role: str = ""
    job_url: str = ""
    job_title: str = ""
    job_company: str = ""
    job_description: str = ""
    provider: str | None = None
    model: str | None = None


def _latest_cv(uid: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT id, filename, file_path, content_type, extracted_text
            FROM cv_documents
            WHERE user_id = ?
            ORDER BY created_at DESC LIMIT 1
            """,
            (uid,),
        ).fetchone()
    return dict(row) if row else None


def _read_docx_paragraphs(docx_path: Path) -> tuple[ET.Element, list[tuple[int, ET.Element, str]]]:
    """Return (root, [(idx, paragraph_element, joined_text)])."""
    try:
        with zipfile.ZipFile(docx_path) as archive:
            xml_bytes = archive.read("word/document.xml")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Không đọc được DOCX: {exc}") from exc

    root = ET.fromstring(xml_bytes)
    paragraphs: list[tuple[int, ET.Element, str]] = []
    for idx, p in enumerate(root.findall(".//w:p", NS)):
        runs = p.findall(".//w:t", NS)
        text = "".join((t.text or "") for t in runs).strip()
        if text:
            paragraphs.append((idx, p, text))
    return root, paragraphs


def _replace_paragraph_text(p: ET.Element, new_text: str) -> None:
    """Replace all w:t text in paragraph with new_text, collapsing to one run."""
    runs_t = p.findall(".//w:t", NS)
    if not runs_t:
        return
    runs_t[0].text = new_text
    # preserve whitespace if leading/trailing space present
    if new_text != new_text.strip():
        runs_t[0].set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    for extra in runs_t[1:]:
        extra.text = ""


def _build_prompt(mode: str, body: GenerateBody, paragraphs: list[tuple[int, ET.Element, str]]) -> dict:
    items = [{"idx": idx, "text": text} for idx, _, text in paragraphs]
    if mode == "jd":
        target = {
            "kind": "job",
            "title": body.job_title,
            "company": body.job_company,
            "url": body.job_url,
            "description": (body.job_description or "")[:4000],
        }
        instruction = (
            "Người dùng đang muốn ứng tuyển vào JD này. Hãy viết lại các đoạn "
            "Summary/Objective + Skills + 1-2 dòng đầu mỗi Experience để khớp JD: "
            "đưa keyword JD vào tự nhiên, nêu kết quả định lượng. Giữ nguyên các "
            "đoạn header, dates, education, contact."
        )
    else:
        target = {"kind": "role", "target_role": body.target_role or "Data Analyst"}
        instruction = (
            "Hãy viết lại Summary + Skills + bullet points trong Experience để "
            "tăng độ phù hợp với target_role. Giữ nguyên các đoạn header, dates, "
            "education, contact info."
        )
    return {
        "instruction": instruction,
        "target": target,
        "paragraphs": items,
        "schema": {
            "rewrites": [
                {"idx": 0, "new_text": "Summary paragraph rewritten..."},
                {"idx": 3, "new_text": "First bullet of experience rewritten..."},
            ]
        },
        "rules": [
            "Trả về JSON object với key 'rewrites', không markdown, không giải thích.",
            "Chỉ rewrite các đoạn cần đổi. Đoạn nào giữ nguyên thì KHÔNG đưa vào rewrites.",
            "idx là số thứ tự paragraph từ input (0-based). new_text là nội dung viết lại.",
            "new_text giữ độ dài tương đương đoạn gốc ±40%, tiếng Việt nếu gốc tiếng Việt.",
            "Không bịa kinh nghiệm/năm/công ty không có trong CV gốc.",
        ],
    }


def _resolve_provider(user_id: str, provider: str | None, model: str | None) -> tuple[str, str | None]:
    """Unused — kept for signature compatibility. Caller routes through internal API now."""
    return provider, model

def _call_llm(user_id: str, provider: str | None, model: str | None, payload: dict) -> tuple[list[dict], str]:
    """Return (validated_rewrites, raw_response_text).
    Gọi API internal của HAgent thay vì gọi provider trực tiếp."""
    system = (
        "Bạn là một CV editor chuyên nghiệp cho thị trường Việt Nam. "
        "Đầu vào là danh sách paragraphs đánh số idx. Đầu ra phải là JSON đúng schema, không markdown."
    )
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]

    import os
    internal_url = os.environ.get("HAGENT_INTERNAL_API_URL", "http://127.0.0.1:8010")

    request_body = {
        "model": model or "deepseek-chat",
        # explicitly skip provider — let HAgent's internal router use its own default
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 4096,
        "stream": False,
    }

    try:
        data = json.dumps(request_body).encode("utf-8")
        req = urlrequest.Request(
            f"{internal_url.rstrip('/')}/api/hagent-ai/chat/completions",
            data=data,
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer internal",
            },
            method="POST",
        )
        resp = urlrequest.urlopen(req, timeout=180)
        result = json.loads(resp.read().decode("utf-8"))
        content = (result.get("choices") or [{}])[0].get("message", {}).get("content") or ""
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM lỗi khi viết CV (internal API): {exc}") from exc

    raw = content or ""
    parsed = _parse_json(raw)
    rewrites = parsed.get("rewrites") or parsed.get("changes") or parsed.get("edits") or []
    result: list[dict] = []
    for r in rewrites:
        if not isinstance(r, dict):
            continue
        idx = r.get("idx") or r.get("index") or r.get("id")
        new_text = r.get("new_text") or r.get("text") or r.get("content") or r.get("rewritten_text")
        if idx is not None and new_text:
            result.append({"idx": idx, "new_text": str(new_text).strip()})
    return result, raw


def _repair_json(text: str) -> str:
    """Repair common LLM JSON issues: trailing commas, single quotes, bare keys."""
    text = re.sub(r",\s*([}\]])", r"\1", text)
    text = re.sub(r"(?<!\\)'", '"', text)
    text = re.sub(r"(?<!\\)\\(?![/\\bfnrtu\"])", "\\\\", text)
    return text


def _extract_json_braces(text: str) -> str | None:
    """Extract top-level JSON object using brace counting (handles nested braces)."""
    depth = 0
    start = -1
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start != -1:
                return text[start : i + 1]
    return None


def _parse_json(text: str) -> dict:
    text = (text or "").strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```\s*$", "", text)

    for attempt in [text, _extract_json_braces(text), _repair_json(text)]:
        if not attempt:
            continue
        try:
            return json.loads(attempt)
        except Exception:
            pass

    # fallback: extract JSON with brace counting after repair
    extracted = _extract_json_braces(text)
    if extracted:
        try:
            return json.loads(_repair_json(extracted))
        except Exception:
            pass

    return {}


def _write_docx(src_path: Path, root: ET.Element, dst_path: Path) -> None:
    new_xml = ET.tostring(root, xml_declaration=True, encoding="UTF-8")
    with zipfile.ZipFile(src_path) as src, zipfile.ZipFile(dst_path, "w", zipfile.ZIP_DEFLATED) as dst:
        for item in src.namelist():
            if item == "word/document.xml":
                dst.writestr(item, new_xml)
            else:
                dst.writestr(item, src.read(item))


@router.post("/generate-docx")
async def generate_cv_docx(body: GenerateBody, request: Request):
    uid = _get_user_id(request)
    cv = _latest_cv(uid)
    if not cv:
        raise HTTPException(status_code=400, detail="Chưa có CV trong hệ thống. Hãy upload CV trước.")
    src_path = Path(cv["file_path"])
    if not src_path.exists():
        raise HTTPException(status_code=404, detail="File CV gốc không còn tồn tại trên đĩa.")
    if src_path.suffix.lower() != ".docx":
        raise HTTPException(status_code=400, detail="Chỉ rewrite được CV nguồn dạng .docx. Hãy upload lại bản .docx.")

    mode = (body.mode or "role").lower()
    if mode not in {"jd", "role"}:
        raise HTTPException(status_code=400, detail="mode phải là 'jd' hoặc 'role'.")
    if mode == "jd" and not (body.job_title or body.job_url or body.job_description):
        raise HTTPException(status_code=400, detail="Mode 'jd' cần ít nhất 1 trong: job_title, job_url, job_description.")

    root, paragraphs = _read_docx_paragraphs(src_path)
    if not paragraphs:
        raise HTTPException(status_code=400, detail="DOCX gốc trống.")

    payload = _build_prompt(mode, body, paragraphs)
    try:
        rewrites, raw_response = _call_llm(uid, body.provider, body.model, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    max_idx = max(idx for idx, _, _ in paragraphs) if paragraphs else 0
    by_idx: dict[int, str] = {}
    for r in rewrites:
        raw = r.get("new_text", "")
        if not raw.strip():
            continue
        raw_idx = r.get("idx")
        try:
            idx_int = int(raw_idx)
        except (ValueError, TypeError):
            continue
        # LLM sometimes uses 1-based indexing
        if idx_int > max_idx and idx_int > 0:
            idx_int = idx_int - 1
        by_idx[idx_int] = raw

    p_by_idx = {idx: p for idx, p, _ in paragraphs}
    changed = 0
    for idx, new_text in by_idx.items():
        p = p_by_idx.get(idx)
        if p is None:
            continue
        _replace_paragraph_text(p, new_text)
        changed += 1

    if changed == 0:
        snippet = (raw_response or "")[:1000]
        raise HTTPException(
            status_code=500,
            detail=f"LLM không trả về rewrite nào hợp lệ. Raw response: {snippet}",
        )

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    tag = "jd" if mode == "jd" else "role"
    base_name = Path(cv["filename"]).stem
    out_name = f"{base_name}__{tag}__{ts}__{uuid4().hex[:6]}.docx"
    out_path = GENERATED_DIR / out_name
    _write_docx(src_path, root, out_path)

    return {
        "ok": True,
        "filename": out_name,
        "download_url": f"/uploads/cv-generated/{out_name}",
        "changed_paragraphs": changed,
        "total_paragraphs": len(paragraphs),
        "mode": mode,
        "target": body.job_title if mode == "jd" else body.target_role,
    }
