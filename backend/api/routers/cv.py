"""CV router — upload CV, evaluate it, suggest matching jobs, and prep interviews."""

from __future__ import annotations

import asyncio
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


class CVJobCompareBody(BaseModel):
    title: str = ""
    company: str = ""
    url: str = ""
    description: str = ""
    skills: list[str] = []
    location: str = ""
    salary: str | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    source: str | None = None
    provider: str | None = None
    model: str | None = None


def _compact_text(value: str, limit: int = 24000) -> str:
    value = re.sub(r"\s+", " ", value or "").strip()
    if len(value) <= limit:
        return value
    return value[:limit] + "\n\n[Đã rút gọn do CV quá dài]"


def _ai_fallback_notice(detail: str | None) -> str:
    text = detail or ""
    if "429" in text or "Too Many Requests" in text:
        return "AI đang quá tải nên tạm dùng chấm nhanh bằng kỹ năng trong CV và JD."
    return "AI chưa phản hồi được nên tạm dùng chấm nhanh bằng kỹ năng trong CV và JD."


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
    with get_connection() as conn:
        try:
            rows = conn.execute(
                """
                SELECT url, title, company, location, salary, salary_min, salary_max, source,
                       posted_date, skills, description_snippet, created_at, updated_at
                FROM cached_jobs
                ORDER BY updated_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        except Exception:
            rows = []
    jobs = []
    for row in rows:
        item = dict(row)
        try:
            item["skills"] = json.loads(item.get("skills") or "[]")
        except json.JSONDecodeError:
            item["skills"] = []
        jobs.append(item)
    if jobs:
        return jobs
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


COMPARE_KEYWORDS = [
    "python", "sql", "excel", "power bi", "tableau", "dashboard", "etl", "data analyst",
    "business analyst", "bi analyst", "financial analyst", "finance", "accounting",
    "kế toán", "tài chính", "báo cáo", "hợp nhất", "vas", "ifrs", "erp", "sap",
    "product owner", "product manager", "agile", "scrum", "api", "automation",
    "vba", "pandas", "database", "reporting", "stakeholder", "english",
]

UNSUITABLE_JOB_TERMS = (
    "lào",
    "laos",
    "campuchia",
    "cambodia",
    "cambodian",
    "phnom penh",
    "vientiane",
    "myanmar",
    "yangon",
    "relocate",
    "relocation",
    "oversea",
    "overseas",
)

# Skill aliases — different spellings/casings collapse to a canonical form so the
# heuristic match recognises "ReactJS" / "React.js" / "react" as the same skill.
SKILL_ALIASES = {
    "reactjs": "react", "react.js": "react", "react js": "react",
    "nodejs": "node", "node.js": "node", "node js": "node",
    "nextjs": "next", "next.js": "next",
    "vuejs": "vue", "vue.js": "vue",
    "ms sql": "sql server", "mssql": "sql server", "tsql": "sql server", "t-sql": "sql server",
    "postgres": "postgresql",
    "py": "python", "python3": "python",
    "ts": "typescript",
    "js": "javascript",
    "k8s": "kubernetes",
    "tf": "terraform",
    "ml": "machine learning",
    "dl": "deep learning",
    "powerbi": "power bi", "power-bi": "power bi",
    "google sheet": "google sheets",
    "bi": "business intelligence",
    "kế toán tổng hợp": "kế toán",
    "tài chính kế toán": "kế toán",
}

LEVEL_KEYWORDS = {
    "junior": 1, "fresher": 1, "intern": 1, "thực tập": 1, "mới ra trường": 1,
    "mid": 2, "middle": 2, "intermediate": 2,
    "senior": 3, "sr.": 3, "sr ": 3, "lead": 4, "principal": 4, "manager": 4, "head of": 4,
}


def _canonical_skill(text: str) -> str:
    t = re.sub(r"\s+", " ", (text or "").lower()).strip(" .,-/\\")
    return SKILL_ALIASES.get(t, t)


def _detect_level(text: str) -> int:
    lowered = (text or "").lower()
    best = 0
    for key, lvl in LEVEL_KEYWORDS.items():
        if key in lowered:
            best = max(best, lvl)
    return best


def _detect_work_mode(text: str) -> str | None:
    lowered = (text or "").lower()
    if any(k in lowered for k in ("remote", "wfh", "work from home", "làm tại nhà", "từ xa", "tu xa")):
        return "remote"
    if "hybrid" in lowered or "linh hoạt" in lowered:
        return "hybrid"
    if any(k in lowered for k in ("onsite", "on-site", "văn phòng", "tại văn phòng")):
        return "onsite"
    return None


def _prefs_for_compare(prefs: dict | None) -> dict:
    if not prefs:
        return {}
    keys = (
        "target_roles", "locations", "salary_min", "work_modes", "level",
        "must_have_skills", "avoid_keywords", "languages",
        "compressed_week", "target_companies",
    )
    return {key: prefs.get(key) for key in keys if prefs.get(key) not in (None, "", [], {})}


def _job_text(job: CVJobCompareBody) -> str:
    return " ".join([
        job.title,
        job.company,
        job.location,
        job.salary or "",
        job.source or "",
        job.description,
        " ".join(str(item) for item in job.skills),
    ]).lower()


def _is_unsuitable_job(job: CVJobCompareBody) -> bool:
    return any(term in _job_text(job) for term in UNSUITABLE_JOB_TERMS)


def _keyword_hits(text: str) -> set[str]:
    lowered = (text or "").lower()
    return {kw for kw in COMPARE_KEYWORDS if kw in lowered}


def _fallback_job_compare(cv_text: str, job: CVJobCompareBody, prefs: dict | None = None) -> dict:
    if _is_unsuitable_job(job):
        return {
            "match_score": 20,
            "verdict": "Bỏ qua JD này: địa điểm/điều kiện làm việc không phù hợp với mục tiêu hiện tại.",
            "matched_requirements": [],
            "missing_requirements": ["JD có tín hiệu làm việc ở Lào/Campuchia/overseas hoặc yêu cầu relocation."],
            "cv_updates": ["Không nên tốn thời gian tailor CV cho JD này."],
            "interview_focus": ["Ưu tiên JD ở Việt Nam/remote phù hợp hơn."],
            "evidence": ["Bộ lọc phát hiện địa điểm hoặc điều kiện làm việc không phù hợp."],
        }

    cv_lower = (cv_text or "").lower()
    cv_hits = _keyword_hits(cv_text)
    cv_canon = {_canonical_skill(k) for k in cv_hits}
    # Index CV skill canonicals by literal substring as well for alias-aware match.
    cv_canon_substr = set(cv_canon)
    for alias, canon in SKILL_ALIASES.items():
        if alias and alias in cv_lower:
            cv_canon_substr.add(canon)

    job_text_lower = _job_text(job)
    job_hits = _keyword_hits(job_text_lower)
    explicit_skills = {str(item).strip().lower() for item in job.skills if str(item).strip()}
    required_raw = sorted((job_hits | explicit_skills) - {""})
    if not required_raw:
        required_raw = sorted(_keyword_hits(f"{job.title} {job.description}"))
    required = sorted({_canonical_skill(r) for r in required_raw})

    title_lower = (job.title or "").lower()
    title_skills = {_canonical_skill(s) for s in required if s and s in title_lower}

    matched: list[str] = []
    missing: list[str] = []
    for skill in required:
        if not skill:
            continue
        if skill in cv_canon_substr or skill in cv_lower:
            matched.append(skill)
        else:
            missing.append(skill)

    # Weighted score: each title-skill match counts 2x; missing counts 1x.
    if required:
        weight_total = sum(2 if s in title_skills else 1 for s in required)
        weight_matched = sum(2 if s in title_skills else 1 for s in matched)
        raw = round((weight_matched / weight_total) * 100) if weight_total else 50
    else:
        raw = 50

    # Level adjustment: subtract up to 12 points when JD asks for senior+ and CV
    # has no senior keywords; bump up to 6 points when CV exceeds JD level.
    jd_level = _detect_level(f"{job.title} {job.description}")
    cv_level = _detect_level(cv_text)
    level_delta = 0
    if jd_level >= 3 and cv_level < jd_level:
        level_delta = -min(12, (jd_level - cv_level) * 6)
    elif cv_level > jd_level >= 1:
        level_delta = min(6, (cv_level - jd_level) * 3)

    score = max(20, min(95, raw + level_delta))
    pref_notes: list[str] = []
    if prefs:
        try:
            from api.services.job_location import canonical_locations
        except Exception:
            canonical_locations = None  # type: ignore
        if prefs.get("locations") and canonical_locations:
            wanted = set(prefs["locations"])
            jd_locs = set(canonical_locations(job.location or ""))
            if wanted & jd_locs:
                score = min(95, score + 8)
                pref_notes.append("Vị trí JD khớp địa điểm bạn chọn (+8).")
            elif jd_locs:
                score = max(20, score - 25)
                pref_notes.append("Vị trí JD lệch địa điểm bạn chọn (-25).")
        sal_min = prefs.get("salary_min") or 0
        if sal_min and (job.title or job.description):
            jmax = 0
            try:
                jmax = int(job.salary_max or 0)
            except Exception:
                jmax = 0
            if jmax and jmax < sal_min:
                score = max(20, score - 20)
                pref_notes.append(f"Lương trần JD < kỳ vọng {sal_min // 1_000_000}tr (-20).")
        roles = [s.lower() for s in (prefs.get("target_roles") or []) if s]
        if roles:
            role_blob = f"{job.title} {job.description}".lower()
            role_hit = [role for role in roles if role in role_blob]
            if role_hit:
                score = min(95, score + 8)
                pref_notes.append(f"Khớp vị trí mục tiêu: {', '.join(role_hit[:3])} (+8).")
            else:
                score = max(15, score - 18)
                pref_notes.append("Tên JD/mô tả chưa khớp vị trí mục tiêu của bạn (-18).")
        wanted_modes = set(prefs.get("work_modes") or [])
        if wanted_modes:
            mode = _detect_work_mode(job_text_lower)
            if mode and mode in wanted_modes:
                score = min(95, score + 5)
                pref_notes.append(f"Hình thức làm việc khớp {mode} (+5).")
            elif mode and mode not in wanted_modes:
                score = max(15, score - 16)
                pref_notes.append(f"Hình thức {mode} lệch lựa chọn của bạn (-16).")
        if prefs.get("compressed_week"):
            sat_terms = ("thứ 7", "thứ bảy", "saturday", "làm việc sáng thứ 7", "t7")
            if any(term in job_text_lower for term in sat_terms):
                score = max(15, score - 25)
                pref_notes.append("JD có tín hiệu làm thứ 7 trong khi bạn chọn nghỉ T7 (-25).")
        target_companies = [s.lower() for s in (prefs.get("target_companies") or []) if s]
        if target_companies:
            company_lower = (job.company or "").lower()
            company_hit = [name for name in target_companies if name in company_lower]
            if company_hit:
                score = min(95, score + 10)
                pref_notes.append(f"Công ty thuộc danh sách mục tiêu: {', '.join(company_hit[:2])} (+10).")
        wanted_level = prefs.get("level")
        if wanted_level:
            wanted_rank = LEVEL_KEYWORDS.get(str(wanted_level).lower(), 0)
            if wanted_rank and jd_level and abs(jd_level - wanted_rank) >= 2:
                score = max(15, score - 12)
                pref_notes.append("Cấp độ JD lệch đáng kể so với cấp độ bạn chọn (-12).")
        must = [s.lower() for s in (prefs.get("must_have_skills") or []) if s]
        if must:
            hit = [s for s in must if s in cv_lower and s in job_text_lower]
            if hit:
                score = min(95, score + min(10, 3 * len(hit)))
                pref_notes.append(f"Khớp kỹ năng must-have: {', '.join(hit[:4])}.")
            missing_must = [s for s in must if s not in job_text_lower]
            if missing_must and len(missing_must) == len(must):
                score = max(15, score - 12)
                pref_notes.append("JD không thể hiện kỹ năng must-have bạn ưu tiên (-12).")
        avoid = [w.lower() for w in (prefs.get("avoid_keywords") or []) if w]
        if avoid:
            blob = f"{job.title} {job.description}".lower()
            hit = [w for w in avoid if w in blob]
            if hit:
                score = max(15, score - 30)
                pref_notes.append(f"JD chứa từ khóa bạn muốn tránh: {', '.join(hit[:3])} (-30).")
    if score >= 75:
        verdict = "Nên ứng tuyển, nhưng vẫn cần chỉnh CV theo JD."
    elif score >= 50:
        verdict = "Có thể ứng tuyển nếu bổ sung bằng chứng cho các gap chính."
    else:
        verdict = "Chưa nên nộp ngay; cần chọn JD khác hoặc chỉnh CV mạnh hơn."

    evidence = [
        "Điểm tính từ overlap canonical skills giữa CV và JD (có alias React/ReactJS, SQL/MSSQL, ...).",
        "Kỹ năng xuất hiện trong title JD được nhân hệ số 2 để ưu tiên match đúng vai trò.",
    ]
    if level_delta:
        evidence.append(
            f"Điều chỉnh {level_delta:+d} điểm do chênh lệch cấp độ (JD={jd_level}, CV={cv_level})."
        )
    evidence.extend(pref_notes)
    return {
        "match_score": score,
        "verdict": verdict,
        "matched_requirements": matched[:12],
        "missing_requirements": missing[:12],
        "cv_updates": [
            f"Thêm bullet có số liệu chứng minh kinh nghiệm liên quan tới {item}."
            for item in missing[:4]
        ] or ["Đưa các thành tựu định lượng lên phần đầu CV để tăng tín hiệu phù hợp."],
        "interview_focus": [
            f"Chuẩn bị ví dụ thực tế cho yêu cầu: {item}."
            for item in (matched[:3] + missing[:3])
        ],
        "evidence": evidence,
    }


def _call_ai_job_compare(cv_text: str, job: CVJobCompareBody, prefs: dict | None = None) -> dict:
    cfg = get_provider_config(job.provider, job.model)
    if cfg.type != "openai" or not cfg.base_url or not cfg.api_key:
        raise HTTPException(status_code=400, detail=f"Provider {cfg.name} chưa hỗ trợ đối chiếu JD")
    system = (
        "Bạn là recruiter thực chiến. Trả lời JSON hợp lệ, không markdown. "
        "Đối chiếu CV với JD thật và tiêu chí cá nhân của ứng viên. "
        "Nếu JD lệch tiêu chí cứng như địa điểm, lương, cấp độ, ngày làm việc, từ khóa né tránh, "
        "hãy hạ điểm mạnh và nêu rõ lý do. Chỉ ra điểm khớp, điểm thiếu, và cách sửa CV cụ thể trước khi nộp."
    )
    payload = {
        "cv_text": _compact_text(cv_text, 22000),
        "job": job.model_dump(),
        "user_preferences": _prefs_for_compare(prefs),
        "schema": {
            "match_score": "0-100",
            "verdict": "string",
            "matched_requirements": ["string"],
            "missing_requirements": ["string"],
            "cv_updates": ["string"],
            "interview_focus": ["string"],
            "evidence": ["string"],
        },
    }
    body = {
        "model": cfg.model,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
    }
    req = urlrequest.Request(
        f"{cfg.base_url.rstrip('/')}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {cfg.api_key}",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        method="POST",
    )
    try:
        with urlrequest.urlopen(req, timeout=180) as response:
            data = json.loads(response.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Không gọi được provider {cfg.name}: {exc}") from exc
    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    return _json_from_model(content)


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
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {cfg.api_key}",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
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
        result = await asyncio.to_thread(
            _call_ai,
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
        result["ai_notice"] = _ai_fallback_notice(str(exc.detail))

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


@router.post("/compare-job")
async def compare_cv_with_job(body: CVJobCompareBody, request: Request):
    uid = _get_user_id(request)
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT extracted_text
            FROM cv_documents
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (uid,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=400, detail="Chưa có CV. Hãy tải CV lên trước khi đối chiếu JD.")
    cv_text = row["extracted_text"] or ""
    try:
        from api.routers.job_hunter import load_prefs as _load_job_prefs
        _prefs = _load_job_prefs(uid)
    except Exception:
        _prefs = None
    try:
        result = await asyncio.to_thread(_call_ai_job_compare, cv_text, body, _prefs)
    except HTTPException as exc:
        result = _fallback_job_compare(cv_text, body, _prefs)
        result["ai_notice"] = _ai_fallback_notice(str(exc.detail))
    result.setdefault("match_score", 0)
    result.setdefault("matched_requirements", [])
    result.setdefault("missing_requirements", [])
    result.setdefault("cv_updates", [])
    result.setdefault("interview_focus", [])
    result.setdefault("evidence", [])
    return {"job": body.model_dump(), "result": result}


@router.delete("/documents")
async def delete_all_cv_documents(request: Request):
    uid = _get_user_id(request)
    with get_connection() as conn:
        rows = conn.execute("SELECT file_path FROM cv_documents WHERE user_id = ?", (uid,)).fetchall()
        for row in rows:
            try:
                p = Path(row["file_path"])
                p.unlink(missing_ok=True)
            except Exception:
                pass
        conn.execute("DELETE FROM cv_documents WHERE user_id = ?", (uid,))
    return {"status": "cleared"}
