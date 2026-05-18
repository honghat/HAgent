"""CV router — upload CV, evaluate it, suggest matching jobs, and prep interviews."""

from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path
from urllib import error, request as urlrequest
from uuid import uuid4
from xml.etree import ElementTree

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel

from api.services.db import DATA_DIR, get_connection
from api.services.provider_config import get_provider_config
from api.services.user_store import resolve_user_id

router = APIRouter(prefix="/api/cv", tags=["CV"])

UPLOAD_DIR = DATA_DIR / "uploads" / "cv"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_SUFFIXES = {".pdf", ".docx"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024


def _get_user_id(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    token = auth.replace("Bearer ", "").strip() or request.query_params.get("t", "hat")
    uid = resolve_user_id(token)
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return uid


class CVProfileBody(BaseModel):
    skills: str = ""
    roles: str = ""
    experience: str = ""


def _compact_text(value: str, limit: int = 24000) -> str:
    value = re.sub(r"\s+", " ", value or "").strip()
    if len(value) <= limit:
        return value
    return value[:limit] + "\n\n[Đã rút gọn do CV quá dài]"


def _extract_docx_text(path: Path) -> str:
    try:
        with zipfile.ZipFile(path) as archive:
            xml = archive.read("word/document.xml")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Không đọc được DOCX: {exc}") from exc

    root = ElementTree.fromstring(xml)
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs: list[str] = []
    for paragraph in root.findall(".//w:p", ns):
        parts = [node.text or "" for node in paragraph.findall(".//w:t", ns)]
        text = "".join(parts).strip()
        if text:
            paragraphs.append(text)
    return "\n".join(paragraphs)


def _extract_pdf_text(path: Path) -> str:
    errors: list[str] = []
    for module_name in ("pypdf", "PyPDF2"):
        try:
            module = __import__(module_name)
            reader = module.PdfReader(str(path))
            return "\n".join((page.extract_text() or "") for page in reader.pages)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{module_name}: {exc}")

    try:
        from pdfminer.high_level import extract_text  # type: ignore

        return extract_text(str(path)) or ""
    except Exception as exc:  # noqa: BLE001
        errors.append(f"pdfminer: {exc}")

    raise HTTPException(
        status_code=400,
        detail="Không trích xuất được PDF. Hãy thử file DOCX hoặc cài pypdf/pdfminer.six.",
    )


def _extract_text(path: Path) -> str:
    if path.suffix.lower() == ".docx":
        return _extract_docx_text(path)
    if path.suffix.lower() == ".pdf":
        return _extract_pdf_text(path)
    raise HTTPException(status_code=400, detail="Chỉ hỗ trợ CV dạng PDF hoặc DOCX")


def _load_jobs(limit: int = 80) -> list[dict]:
    cache_path = Path(__file__).parent.parent / "data" / "jobs_cache.json"
    if not cache_path.exists():
        return []
    try:
        jobs = json.loads(cache_path.read_text())
        return jobs[:limit] if isinstance(jobs, list) else []
    except Exception:
        return []


def _score_jobs(cv_text: str, jobs: list[dict]) -> list[dict]:
    words = {w.lower() for w in re.findall(r"[A-Za-z0-9+#.]{2,}", cv_text)}
    scored: list[dict] = []
    for job in jobs:
        skills = [str(item) for item in (job.get("skills") or [])]
        haystack = " ".join([
            str(job.get("title") or ""),
            str(job.get("company") or ""),
            str(job.get("description_snippet") or ""),
            " ".join(skills),
        ])
        tokens = {w.lower() for w in re.findall(r"[A-Za-z0-9+#.]{2,}", haystack)}
        overlap = sorted(words & tokens)
        if not overlap:
            continue
        scored.append({
            **job,
            "match_score": min(98, 35 + len(overlap) * 6),
            "match_reasons": overlap[:10],
        })
    scored.sort(key=lambda item: (item.get("match_score") or 0, item.get("salary_max") or 0), reverse=True)
    return scored[:8]


def _json_from_model(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
    try:
        return json.loads(cleaned)
    except Exception:
        match = re.search(r"\{.*\}", cleaned, flags=re.S)
        if match:
            try:
                return json.loads(match.group(0))
            except Exception:
                pass
    return {"summary": cleaned}


def _fallback_result(cv_text: str, matching_jobs: list[dict]) -> dict:
    tokens = re.findall(r"[A-Za-z][A-Za-z0-9+#. -]{1,28}", cv_text)
    common = []
    seen = set()
    for token in tokens:
        item = token.strip(" -").lower()
        if item and item not in seen and len(item) > 2:
            seen.add(item)
            common.append(token.strip())
        if len(common) >= 12:
            break
    return {
        "score": 65,
        "summary": "Đã trích xuất CV và tạo đánh giá nhanh bằng heuristic vì chưa gọi được AI provider.",
        "strengths": common[:5],
        "issues": [
            "Cần kiểm tra lại phần thành tựu có số liệu định lượng.",
            "Nên tùy biến CV theo từng vị trí ứng tuyển.",
        ],
        "improved_cv": cv_text[:5000],
        "target_roles": [],
        "matching_jobs": matching_jobs,
        "interview_plan": [
            {
                "topic": "Kinh nghiệm dự án",
                "questions": [
                    {
                        "question": "Hãy kể về dự án nổi bật nhất trong CV.",
                        "answer_hint": "Nêu bối cảnh, vai trò, hành động cụ thể, công nghệ dùng và kết quả đo được.",
                    }
                ],
            }
        ],
    }


def _call_ai(cv_text: str, matching_jobs: list[dict], *, provider: str | None, model: str | None, target_role: str, location: str) -> dict:
    cfg = get_provider_config(provider, model)
    if cfg.type != "openai" or not cfg.base_url or not cfg.api_key:
        raise HTTPException(status_code=400, detail=f"Provider {cfg.name} chưa hỗ trợ phân tích CV")

    system = (
        "Bạn là career coach và technical recruiter cho thị trường Việt Nam. "
        "Trả lời JSON hợp lệ, không markdown. Đánh giá CV thực tế, sửa CV bằng tiếng Việt, "
        "gợi ý việc phù hợp từ danh sách được đưa vào, và tạo câu hỏi phỏng vấn kèm gợi ý trả lời."
    )
    user = {
        "target_role": target_role,
        "location": location,
        "cv_text": _compact_text(cv_text),
        "jobs": matching_jobs,
        "schema": {
            "score": "0-100",
            "summary": "string",
            "strengths": ["string"],
            "issues": ["string"],
            "improved_cv": "CV đã chỉnh sửa, sẵn để copy",
            "target_roles": ["string"],
            "matching_jobs": [{"title": "string", "company": "string", "url": "string", "match_score": 0, "reason": "string"}],
            "interview_plan": [{"topic": "string", "questions": [{"question": "string", "answer_hint": "string"}]}],
        },
    }
    body = {
        "model": cfg.model,
        "temperature": 0.25,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
        ],
    }
    req = urlrequest.Request(
        f"{cfg.base_url.rstrip('/')}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {cfg.api_key}"},
        method="POST",
    )
    try:
        with urlrequest.urlopen(req, timeout=180) as response:
            data = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        text = exc.read().decode("utf-8", errors="ignore")
        raise HTTPException(status_code=502, detail=f"Lỗi provider {cfg.name}: HTTP {exc.code} - {text[:240]}") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Không gọi được provider {cfg.name}: {exc}") from exc

    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    result = _json_from_model(content)
    result.setdefault("matching_jobs", matching_jobs)
    return result


@router.get("/profile")
async def get_cv_profile(request: Request):
    uid = _get_user_id(request)
    with get_connection() as conn:
        row = conn.execute(
            "SELECT skills, roles, experience, updated_at FROM user_cv_profile WHERE user_id = ?",
            (uid,),
        ).fetchone()
    if not row:
        return {"skills": "", "roles": "", "experience": "", "updated_at": None}
    return dict(row)


@router.put("/profile")
async def upsert_cv_profile(body: CVProfileBody, request: Request):
    uid = _get_user_id(request)
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO user_cv_profile (user_id, skills, roles, experience, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
                skills = excluded.skills,
                roles = excluded.roles,
                experience = excluded.experience,
                updated_at = CURRENT_TIMESTAMP
        """,
            (uid, body.skills, body.roles, body.experience),
        )
    return {"ok": True}


@router.post("/analyze")
async def analyze_cv(
    request: Request,
    file: UploadFile = File(...),
    provider: str | None = Form(None),
    model: str | None = Form(None),
    target_role: str = Form(""),
    location: str = Form(""),
):
    uid = _get_user_id(request)
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ upload PDF hoặc DOCX")

    document_id = uuid4().hex
    safe_name = re.sub(r"[^A-Za-z0-9_.-]+", "_", file.filename or f"cv{suffix}")
    path = UPLOAD_DIR / f"{document_id}_{safe_name}"
    size = 0
    with path.open("wb") as output:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                path.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="CV tối đa 10MB")
            output.write(chunk)

    extracted_text = _compact_text(_extract_text(path), limit=32000)
    if len(extracted_text) < 80:
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Không đọc được đủ nội dung từ CV")

    jobs = _load_jobs()
    matching_jobs = _score_jobs(extracted_text, jobs)
    try:
        result = _call_ai(
            extracted_text,
            matching_jobs,
            provider=provider,
            model=model,
            target_role=target_role,
            location=location,
        )
    except HTTPException as exc:
        if exc.status_code < 500:
            raise
        result = _fallback_result(extracted_text, matching_jobs)
        result["ai_error"] = exc.detail

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO cv_documents
                (id, user_id, filename, file_path, content_type, extracted_text, result_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                document_id,
                uid,
                file.filename or safe_name,
                str(path),
                file.content_type or "",
                extracted_text,
                json.dumps(result, ensure_ascii=False),
            ),
        )
    return {
        "id": document_id,
        "filename": file.filename,
        "text_preview": extracted_text[:1200],
        "result": result,
    }


@router.get("/documents/latest")
async def latest_cv_document(request: Request):
    uid = _get_user_id(request)
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT id, filename, extracted_text, result_json, created_at
            FROM cv_documents
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (uid,),
        ).fetchone()
    if not row:
        return {"document": None}
    item = dict(row)
    item["result"] = json.loads(item.pop("result_json") or "{}")
    item["text_preview"] = item.pop("extracted_text")[:1200]
    return {"document": item}
