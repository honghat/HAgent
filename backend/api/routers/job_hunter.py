"""Job Hunter API — multi-source job scraper with search, watch & export
Supports: ITViec, TopDev, VietnamWorks, CareerLink

* Fixed: shared browser per request (was launching browser per page)
* Fixed: posted_date now scraped from page (was faking with datetime.now)
* Fixed: description_snippet now populated (was always None)
* Fixed: print() replaced with logger
* Fixed: salary parser handles commas, updated USD rate, proper fallback
* Fixed: skills extraction has text-based fallback when CSS tags missing
* Added: date parsing from common VN/EN patterns
"""
import logging
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
import asyncio, json, csv, io, re
from pathlib import Path
from playwright.async_api import async_playwright, Browser

from api.services.db import DATA_DIR as APP_DATA_DIR, get_connection
from api.services.job_location import LOCATION_LABELS, canonical_location, canonical_locations
from api.services.user_store import resolve_user_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/job-hunter", tags=["Job Hunter"])
DATA_DIR = APP_DATA_DIR / "job-hunter"
DATA_DIR.mkdir(parents=True, exist_ok=True)
CACHE_FILE = DATA_DIR / "jobs_cache.json"
WATCH_FILE = DATA_DIR / "watches.json"
JOB_RETENTION_DAYS = 3


def _get_user_id(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    token = auth.replace("Bearer ", "").strip() or request.query_params.get("t", "hat")
    uid = resolve_user_id(token)
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return uid


def _empty_prefs() -> dict:
    return {
        "target_roles": [],
        "locations": [],
        "keywords": [],
        "salary_min": 20_000_000,
        "work_modes": [],
        "level": None,
        "must_have_skills": [],
        "avoid_keywords": [],
        "languages": [],
        "compressed_week": True,
        "target_companies": [],
    }


def load_prefs(user_id: str) -> dict:
    with get_connection() as conn:
        row = conn.execute(
            """SELECT target_roles, locations, keywords, salary_min, work_modes,
                      level, must_have_skills, avoid_keywords, languages,
                      compressed_week, target_companies
               FROM user_job_preferences WHERE user_id = ?""",
            (user_id,),
        ).fetchone()
    if not row:
        return _empty_prefs()
    out = _empty_prefs()
    for key in ("target_roles", "locations", "keywords", "work_modes",
                "must_have_skills", "avoid_keywords", "languages"):
        try:
            out[key] = json.loads(row[key] or "[]")
        except Exception:
            out[key] = []
    try:
        out["target_companies"] = json.loads(row["target_companies"] or "[]")
    except Exception:
        out["target_companies"] = []
    out["salary_min"] = row["salary_min"] or 20_000_000
    out["level"] = row["level"]
    out["compressed_week"] = bool(row["compressed_week"])
    return out


def _normalize_string_list(items, max_len: int = 32) -> list[str]:
    if not isinstance(items, list):
        return []
    seen: list[str] = []
    for raw in items:
        if not isinstance(raw, (str, int, float)):
            continue
        val = str(raw).strip()
        if not val or val in seen:
            continue
        seen.append(val[:120])
        if len(seen) >= max_len:
            break
    return seen


_VALID_WORK_MODES = {"onsite", "hybrid", "remote"}
_VALID_LEVELS = {"intern", "junior", "mid", "senior", "lead"}


def _detect_work_mode(text: str) -> str | None:
    t = (text or "").lower()
    if any(k in t for k in ("remote", "wfh", "work from home", "làm tại nhà", "tu xa")):
        return "remote"
    if "hybrid" in t or "linh hoạt" in t:
        return "hybrid"
    return None


def _job_matches_prefs(job: dict, prefs: dict) -> bool:
    """Hard filter — return False if job clearly conflicts with user prefs."""
    if not prefs:
        return True
    if prefs.get("locations"):
        wanted = set(prefs["locations"])
        actual = set(canonical_locations(job.get("location") or ""))
        if "remote" in wanted and _detect_work_mode(job.get("description_snippet") or "") == "remote":
            actual.add("remote")
        if not (wanted & actual):
            return False
    sal_min = prefs.get("salary_min")
    if sal_min:
        jmax = job.get("salary_max") or 0
        if jmax and jmax < sal_min:
            return False
    if prefs.get("work_modes"):
        wanted_modes = set(prefs["work_modes"])
        if wanted_modes and "onsite" not in wanted_modes:
            mode = _detect_work_mode(job.get("description_snippet") or "")
            if mode and mode not in wanted_modes:
                return False
    # Nếu compressed_week = true, filter JD có dấu hiệu làm thứ 7
    if prefs.get("compressed_week"):
        text = f"{job.get('title','')} {job.get('company','')} {job.get('description_snippet','')}".lower()
        sat_indicators = ("thứ 7", "thứ bảy", "saturday", "làm việc sáng thứ 7", "t7")
        if any(ind in text for ind in sat_indicators):
            return False
    avoid = [w.lower() for w in (prefs.get("avoid_keywords") or []) if w]
    if avoid:
        text = f"{job.get('title','')} {job.get('description_snippet','')}".lower()
        if any(w in text for w in avoid):
            return False
    return True
UNSUITABLE_JOB_TERMS = (
    "lào",
    "laos",
    "campuchia",
    "cambodia",
    "cambodian",
    "phnom penh",
    "vientiane",
    "vientian",
    "myanmar",
    "yangon",
    "relocate",
    "relocation",
    "oversea",
    "overseas",
)

USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0",
]


def _log_scrape_run(source: str, keyword: str, count: int, ok: bool, error: str | None = None):
    """Record per-source scrape outcome so we can tell which scraper is failing."""
    try:
        with get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS scrape_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source TEXT NOT NULL,
                    keyword TEXT NOT NULL DEFAULT '',
                    count INTEGER NOT NULL DEFAULT 0,
                    ok INTEGER NOT NULL DEFAULT 1,
                    error TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                "INSERT INTO scrape_runs (source, keyword, count, ok, error) VALUES (?, ?, ?, ?, ?)",
                (source, keyword, int(count or 0), 1 if ok else 0, (error or None)),
            )
    except Exception:
        pass

# ── Models ────────────────────────────────────────────────────────────

class JobResult(BaseModel):
    url: str
    title: str
    company: str
    location: Optional[str] = None
    salary: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    source: str = "itviec"
    posted_date: Optional[str] = None
    skills: List[str] = []
    description_snippet: Optional[str] = None

class ScrapeRequest(BaseModel):
    keywords: List[str]
    sources: List[str] = ["itviec"]
    max_pages: int = 1

class SearchParams(BaseModel):
    keyword: Optional[str] = None
    source: Optional[str] = None
    location: Optional[str] = None
    salary_min: Optional[int] = None
    company: Optional[str] = None
    days_old: Optional[int] = None
    limit: int = 50

class WatchRequest(BaseModel):
    keywords: List[str]
    sources: List[str] = ["itviec"]
    interval_minutes: int = 60
    notify: bool = True

class DeleteJobRequest(BaseModel):
    url: str

# ── Persistence ───────────────────────────────────────────────────────

def _ensure_deleted_jobs_table(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS deleted_jobs (
            url TEXT PRIMARY KEY,
            deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )


def _deleted_job_urls() -> set[str]:
    with get_connection() as conn:
        _ensure_deleted_jobs_table(conn)
        rows = conn.execute("SELECT url FROM deleted_jobs").fetchall()
    return {str(row["url"] or "") for row in rows if row["url"]}

def _load_cache() -> List[dict]:
    jobs: List[dict] = []
    deleted_urls = _deleted_job_urls()
    with get_connection() as conn:
        try:
            rows = conn.execute(
                """
                SELECT url, title, company, location, salary, salary_min, salary_max, source,
                       posted_date, skills, description_snippet, created_at, updated_at
                FROM cached_jobs
                ORDER BY updated_at DESC
                LIMIT 1000
                """
            ).fetchall()
        except Exception:
            rows = []
    for row in rows:
        item = dict(row)
        if item.get("url") in deleted_urls:
            continue
        try:
            item["skills"] = json.loads(item.get("skills") or "[]")
        except json.JSONDecodeError:
            item["skills"] = []
        jobs.append(item)
    if jobs:
        return jobs
    if CACHE_FILE.exists():
        try: return json.loads(CACHE_FILE.read_text())
        except: pass
    return []

def _save_cache(jobs: List[dict]):
    deleted_urls = _deleted_job_urls()
    with get_connection() as conn:
        for job in jobs:
            url = str(job.get("url") or "").strip()
            if not url or url in deleted_urls:
                continue
            conn.execute(
                """
                INSERT INTO cached_jobs (
                    url, title, company, location, salary, salary_min, salary_max,
                    source, posted_date, skills, description_snippet, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
                ON CONFLICT(url) DO UPDATE SET
                    title = excluded.title,
                    company = excluded.company,
                    location = excluded.location,
                    salary = excluded.salary,
                    salary_min = excluded.salary_min,
                    salary_max = excluded.salary_max,
                    source = excluded.source,
                    posted_date = excluded.posted_date,
                    skills = excluded.skills,
                    description_snippet = excluded.description_snippet,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (
                    url,
                    str(job.get("title") or "Không tiêu đề"),
                    str(job.get("company") or "Không rõ công ty"),
                    job.get("location"),
                    job.get("salary"),
                    job.get("salary_min"),
                    job.get("salary_max"),
                    str(job.get("source") or ""),
                    job.get("posted_date"),
                    json.dumps(job.get("skills") or [], ensure_ascii=False),
                    job.get("description_snippet"),
                    job.get("discovered_at") or job.get("created_at"),
                ),
            )
    visible_jobs = [job for job in jobs if str(job.get("url") or "").strip() not in deleted_urls]
    CACHE_FILE.write_text(json.dumps(visible_jobs, ensure_ascii=False, indent=2))


def _count_cached_urls(urls: list[str]) -> int:
    clean_urls = [str(url or "").strip() for url in urls if str(url or "").strip()]
    if not clean_urls:
        return 0
    placeholders = ",".join("?" for _ in clean_urls)
    with get_connection() as conn:
        row = conn.execute(
            f"SELECT COUNT(*) AS count FROM cached_jobs WHERE url IN ({placeholders})",
            clean_urls,
        ).fetchone()
    return int(row["count"] or 0) if row else 0

def _parse_cache_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        pass
    try:
        return datetime.strptime(value[:10], "%Y-%m-%d")
    except Exception:
        return None

def _job_cache_date(job: dict) -> Optional[datetime]:
    return _parse_cache_date(job.get("discovered_at")) or _parse_cache_date(job.get("posted_date"))

def _prune_old_jobs(jobs: List[dict], save: bool = False) -> List[dict]:
    cutoff = datetime.now() - timedelta(days=JOB_RETENTION_DAYS)
    kept = []
    for job in jobs:
        job_date = _job_cache_date(job)
        if job_date and job_date < cutoff:
            continue
        kept.append(job)
    if save and len(kept) != len(jobs):
        _save_cache(kept)
        stale_urls = {str(job.get("url") or "") for job in jobs if job not in kept}
        if stale_urls:
            with get_connection() as conn:
                conn.executemany("DELETE FROM cached_jobs WHERE url = ?", [(url,) for url in stale_urls if url])
    return kept

def _load_fresh_cache(save: bool = True) -> List[dict]:
    return _prune_old_jobs(_load_cache(), save=save)


def _keyword_terms(keyword: Optional[str]) -> list[str]:
    if not keyword:
        return []
    return [part.strip().lower() for part in re.split(r"[,;\n|]+", keyword) if part.strip()]


def _looks_unsuitable_job(job: dict) -> bool:
    text = " ".join(
        str(job.get(key) or "")
        for key in ("title", "company", "location", "description_snippet")
    ).lower()
    return any(term in text for term in UNSUITABLE_JOB_TERMS)

def _load_watches() -> List[dict]:
    if WATCH_FILE.exists():
        try: return json.loads(WATCH_FILE.read_text())
        except: pass
    return []

def _save_watches(watches: List[dict]):
    WATCH_FILE.write_text(json.dumps(watches, ensure_ascii=False, indent=2))

# ── Salary Parsing ───────────────────────────────────────────────────

def _clean_num(s: str) -> int:
    """Extract integer from a number string, handling commas and dots."""
    s = s.strip()
    # If there's a comma as thousand-sep, remove it
    if "," in s and "." not in s:
        s = s.replace(",", "")
    # Remove dots (thousand separator in VN convention)
    s = s.replace(",", "").replace(".", "")
    return int(s) if s else 0

SALARY_RULES = [
    # Range: "12 - 15 triệu", "1,200 - 1,500 USD"
    (r"(\d[\d,.]*)\s*[-–]\s*(\d[\d,.]*)\s*(triệu|tr|m)\b",
     lambda a, b: (_clean_num(a) * 1_000_000, _clean_num(b) * 1_000_000)),
    (r"(\d[\d,.]*)\s*[-–]\s*(\d[\d,.]*)\s*(usd|\$)",
     lambda a, b: (_clean_num(a) * 26_000, _clean_num(b) * 26_000)),
    # Up to: "up to 20 triệu", "lên tới 2000 USD"
    (r"(up to|tới|lên tới)\s*(\d[\d,.]*)\s*(triệu|tr|m)\b",
     lambda _, a: (0, _clean_num(a) * 1_000_000)),
    (r"(up to|tới|lên tới)\s*(\d[\d,.]*)\s*(usd|\$)",
     lambda _, a: (0, _clean_num(a) * 26_000)),
    # Single: "15 triệu", "2000 USD"
    (r"(\d[\d,.]*)\s*(triệu|tr|m)\b",
     lambda a: (_clean_num(a) * 1_000_000, _clean_num(a) * 1_000_000)),
    (r"(\d[\d,.]*)\s*(usd|\$)",
     lambda a: (_clean_num(a) * 26_000, _clean_num(a) * 26_000)),
    # Bare number + "K" (e.g. "20K" = 20,000,000)
    (r"(\d[\d,.]*)\s*k\b",
     lambda a: (_clean_num(a) * 1_000_000, _clean_num(a) * 1_000_000)),
    # Negotiable
    (r"(thỏa thuận|negotiable|negotiate|thương lượng|cạnh tranh|competitive)", lambda: (0, 0)),
]

def parse_salary(text: str) -> tuple:
    """Returns (salary_min, salary_max) in VND, or (None, None)."""
    if not text:
        return None, None
    t = text.lower().strip()
    for pattern, fn in SALARY_RULES:
        m = re.search(pattern, t)
        if m:
            try:
                result = fn(*m.groups())
                if isinstance(result, tuple) and len(result) == 2:
                    return result
            except Exception:
                return None, None
    return None, None

def _format_vnd_display(s_min: Optional[int], s_max: Optional[int], raw_text: str) -> str:
    """Convert raw salary text to VND display string.
    If the raw text was in USD, convert to 'X triệu' / 'X - Y triệu' format.
    Otherwise return the original text (already VND)."""
    if not raw_text or (s_min is None and s_max is None):
        return raw_text or ""

    # Check if original text was in USD or had USD-like patterns
    has_usd = bool(re.search(r'(usd|\$)', raw_text, re.IGNORECASE))
    if not has_usd:
        return raw_text.strip()

    # Convert to VND display
    def _fmt(n: int) -> str:
        if n >= 1_000_000:
            m = n / 1_000_000
            return f"{m:,.0f}" if m == int(m) else f"{m:,.1f}"
        return f"{n:,}"

    s_min_vnd = _fmt(s_min) if s_min else None
    s_max_vnd = _fmt(s_max) if s_max else None

    if s_min and s_max and s_min != s_max:
        return f"{s_min_vnd} - {s_max_vnd} VND"
    elif s_min and s_max and s_min == s_max:
        return f"{s_min_vnd} VND"
    elif s_min and not s_max:
        return f"Từ {s_min_vnd} VND"
    elif not s_min and s_max:
        return f"Lên tới {s_max_vnd} VND"
    return raw_text.strip()

# ── Date Parsing ─────────────────────────────────────────────────────

_DATE_PATTERNS = [
    (r"(?:posted|đã đăng|cách đây)\s*(\d+)\s*(?:day|ngày)\s*(?:ago|trước)",
     lambda d: (datetime.now() - timedelta(days=int(d))).strftime("%Y-%m-%d")),
    (r"(?:posted|đã đăng|cách đây)\s*(\d+)\s*(?:week|tuần)\s*(?:ago|trước)",
     lambda d: (datetime.now() - timedelta(weeks=int(d))).strftime("%Y-%m-%d")),
    (r"^(today|hôm nay)$", lambda: datetime.now().strftime("%Y-%m-%d")),
    (r"^(yesterday|hôm qua)$",
     lambda: (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")),
    (r"(\d{4}-\d{2}-\d{2})", lambda d: d),
    # Vietnamese format: "Hạn nộp: 30-06-2026" or "Cập nhật: 16-05-2026"
    (r"(?:hạn nộp|cập nhật|updated|posted)\s*[:]*\s*(\d{2})-(\d{2})-(\d{4})",
     lambda d, m, y: f"{y}-{m}-{d}"),
]

def parse_posted_date(text: str) -> Optional[str]:
    if not text:
        return None
    t = text.strip()
    for pattern, fn in _DATE_PATTERNS:
        m = re.search(pattern, t, re.IGNORECASE)
        if m:
            try:
                return fn(*m.groups()) if m.groups() else fn()
            except Exception:
                continue
    return None

# ── Skills Extraction ────────────────────────────────────────────────

SKILL_KEYWORDS = [
    "python", "javascript", "typescript", "java", "c#", ".net", "c++", "go", "rust",
    "ruby", "php", "swift", "kotlin", "scala", "r", "matlab", "perl",
    "react", "angular", "vue", "nodejs", "django", "flask", "spring", "laravel",
    "rails", "express", "nextjs", "nuxt", "svelte",
    "aws", "gcp", "azure", "docker", "kubernetes", "terraform", "jenkins",
    "gitlab", "github actions", "ansible",
    "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "kafka",
    "rabbitmq", "sqlite", "cassandra",
    "machine learning", "deep learning", "ai", "data science", "nlp",
    "computer vision", "tensorflow", "pytorch", "scikit-learn",
    "devops", "sre", "ci/cd", "microservices", "rest api", "graphql",
    "html", "css", "tailwind", "bootstrap", "material ui",
    "flutter", "react native", "android", "ios",
    "agile", "scrum", "linux", "bash", "nginx", "apache",
]

def extract_skills(title: str, company: str, card_text: str, html_tags: List[str]) -> List[str]:
    """Combine CSS tag skills with text-based keyword extraction."""
    corpus = f"{title} {company} {card_text} {' '.join(html_tags)}".lower()
    found = []
    for skill in SKILL_KEYWORDS:
        if skill in corpus:
            found.append(skill)
    seen = set()
    result = []
    for s in found:
        if s not in seen:
            seen.add(s)
            pretty = s.title() if len(s) > 3 else s.upper()
            result.append(pretty)
    return result

# ── Source Configs ────────────────────────────────────────────────────

# ── Source Configs ────────────────────────────────────────────────────

SOURCE_CONF = {
    "itviec": {
        "base": "https://itviec.com",
        "url": lambda kw, pg: f"https://itviec.com/it-jobs/{kw.replace(' ', '-')}" + (f"?page={pg}" if pg > 1 else ""),
        "card": ".job-card",
        "company": ".text-rich-grey",
        "salary": ".salary, [class*=salary]",
        "date": ".small-text",
        "skill_tags": ".text-reset",
        "title": "h3",
    },
    "topdev": {
        # Uses REST API — no browser scraping
        "api_url": "https://api.topdev.vn/td/v2/jobs",
        "base": "https://topdev.vn",
    },
    "vietnamworks": {
        "base": "https://www.vietnamworks.com",
        "url": lambda kw, pg: f"https://www.vietnamworks.com/{kw.replace(' ', '-')}-kw" + (f"?page={pg}" if pg > 1 else ""),
        "card": ".job-item",
        # Inner fields use dynamic classes (styled-components), extracted via text heuristic
        "text_based": True,
    },
    "careerlink": {
        "base": "https://www.careerlink.vn",
        "url": lambda kw, pg: f"https://www.careerlink.vn/viec-lam/{kw.replace(' ', '-')}" + (f"?page={pg}" if pg > 1 else ""),
        "card": ".list-group-item.job-item",
        "title": "h5.job-name",
        "company": "a.job-company",
        "salary": ".job-salary",
        "date": ".cl-datetime",
        "skill_tags": "[class*=skill], [class*=tag]",
    },
    "careerviet": {
        "base": "https://careerviet.vn",
        "url": lambda kw, pg: f"https://careerviet.vn/viec-lam/{kw.replace(' ', '-')}-k-vi.html" + (f"?page={pg}" if pg > 1 else ""),
        "card": ".figure",
        "title": "h2 a.job_link",
        "company": "a.company-name",
        "salary": "div.salary",
        "location": "div.location",
        "wait_seconds": 8,
    },
}

# ── TopDev API fetcher ───────────────────────────────────────────────

async def _fetch_topdev_api(keyword: str, page_num: int) -> List[dict]:
    """Fetch jobs from TopDev public REST API directly."""
    import httpx
    url = f"https://api.topdev.vn/td/v2/jobs"
    params = {
        "locale": "vi_VN",
        "q": keyword,
        "page": page_num,
        "page_size": 15,
        "fields[job]": "id,title,salary,company,locations,skills_arr,slug,detail_url,responsibilities_original,requirements_original"
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, params=params, headers=headers)
            if r.status_code != 200:
                logger.warning("TopDev API returned %d", r.status_code)
                _log_scrape_run("topdev", keyword, 0, False, f"http {r.status_code}")
                return []
            data = r.json()
    except Exception as e:
        logger.warning("TopDev API error: %s", e)
        _log_scrape_run("topdev", keyword, 0, False, str(e)[:300])
        return []

    jobs = []
    for item in data.get("data", []):
        try:
            title = item.get("title", "")
            if not title:
                continue

            # Company
            company_data = item.get("company") or {}
            company = company_data.get("name") or company_data.get("display_name") or "Unknown"

            # Location
            locations = item.get("locations", [])
            location = ", ".join(
                l.get("city", {}).get("value", "") or l.get("text", "")
                for l in (locations if isinstance(locations, list) else [locations])
                if l
            ) if locations else None

            # Salary
            salary_raw = item.get("salary", {}) or {}
            salary_text = salary_raw.get("value", "") or salary_raw.get("text", "")

            # min_estimate/max_estimate are integers (0 = hidden/unknown)
            s_min_raw = salary_raw.get("min_estimate")
            s_max_raw = salary_raw.get("max_estimate")
            try:
                s_min = int(s_min_raw) if s_min_raw and int(s_min_raw) > 0 else None
            except (ValueError, TypeError):
                s_min = None
            try:
                s_max = int(s_max_raw) if s_max_raw and int(s_max_raw) > 0 else None
            except (ValueError, TypeError):
                s_max = None

            # Skills
            skills = []
            for s in (item.get("skills_arr") or []):
                if isinstance(s, dict):
                    skills.append(s.get("value") or s.get("name", ""))
                elif isinstance(s, str):
                    skills.append(s)

            # Posted date — API doesn't provide it, use today as fallback
            posted_date = item.get("created_at") or item.get("posted_date") or datetime.now().strftime("%Y-%m-%d")

            # URL
            job_url = item.get("detail_url") or ""
            if not job_url:
                slug = item.get("slug") or ""
                job_id = item.get("id") or ""
                if slug:
                    job_url = f"https://topdev.vn/viec-lam/{slug}"
                elif job_id:
                    job_url = f"https://topdev.vn/viec-lam/{job_id}"

            salary_display = _format_vnd_display(s_min, s_max, salary_text) if salary_text else None

            # Build description_snippet from TopDev's rich fields
            import re as _re
            from html import unescape as _unescape
            topdev_desc_parts = []
            for field_key in ("responsibilities_original", "requirements_original", "benefits_original"):
                raw = item.get(field_key, "")
                if raw and raw.strip():
                    text = _re.sub(r"<[^>]+>", "", raw)
                    text = _unescape(text).strip()
                    if text:
                        topdev_desc_parts.append(text)
            topdev_desc = " | ".join(topdev_desc_parts)[:300] if topdev_desc_parts else None

            jobs.append(JobResult(
                url=job_url,
                title=title.strip(),
                company=company.strip(),
                location=location.strip() if location else None,
                salary=salary_display or salary_text or None,
                salary_min=s_min,
                salary_max=s_max,
                source="topdev",
                posted_date=posted_date,
                skills=skills,
                description_snippet=topdev_desc,
            ).model_dump())
        except Exception:
            continue

    _log_scrape_run("topdev", keyword, len(jobs), True)
    return jobs


# ── Text-based card parser (for sources with dynamic CSS classes) ─────

def _parse_card_text_vietnamworks(card_text: str) -> dict:
    """Parse VNW card text into fields. Card text has consistent line order:
    [badge] Title / Company / Location / Salary / Date / [skills...]
    """
    lines = [l.strip() for l in card_text.split("\n") if l.strip()]
    # Filter out common noise
    lines = [l for l in lines if l not in ("New", "HOT", "Urgent", "Top")]

    result = {
        "title": "",
        "company": "",
        "location": "",
        "salary": "",
        "date": "",
    }

    if not lines:
        return result

    # First meaningful line is the title
    result["title"] = lines[0]

    # Second line is company
    if len(lines) > 1:
        result["company"] = lines[1]

    # Third line is salary (or location if salary missing)
    idx = 2
    if len(lines) > idx:
        line = lines[idx]
        # Detect if it's a location or salary
        if any(city in line for city in ["Hà Nội", "Ha Noi", "Hồ Chí Minh", "Ho Chi Minh", "Đà Nẵng", "Da Nang"]):
            result["location"] = line
            idx += 1
            if len(lines) > idx:
                result["salary"] = lines[idx]
        else:
            result["salary"] = line
            idx += 1
            if len(lines) > idx:
                # Check if next line is a location
                loc_line = lines[idx]
                if any(city in loc_line for city in ["Hà Nội", "Ha Noi", "Hồ Chí Minh", "Ho Chi Minh", "Đà Nẵng", "Da Nang"]):
                    result["location"] = loc_line
                    idx += 1

    # Remaining lines: date (last meaningful line), skills (everything else)
    remaining = lines[idx:]
    # Date is usually the last line or contains "Today"/"Yesterday"/"ago"
    if remaining:
        seen_date = False
        for i, line in enumerate(remaining):
            low = line.lower()
            if any(w in low for w in ["today", "yesterday", "hour", "day", "week", "month", "cập nhật", "updated", "ago"]):
                result["date"] = line
                seen_date = True
                break
        if not seen_date:
            result["date"] = remaining[-1]

    return result


# ── Scraper (shared browser) ─────────────────────────────────────────

async def _scrape_source(
    browser: Browser,
    keyword: str,
    source: str,
    page_num: int,
    max_retries: int = 2,
) -> List[dict]:
    """Scrape one page from one source using a shared browser instance."""
    conf = SOURCE_CONF.get(source)
    if not conf:
        return []

    # Handle TopDev API-based source
    if "api_url" in conf:
        return await _fetch_topdev_api(keyword, page_num)

    url = conf["url"](keyword, page_num)

    last_error = None
    for attempt in range(max_retries + 1):
        try:
            ctx = await browser.new_context(
                user_agent=USER_AGENTS[attempt % len(USER_AGENTS)],
                locale="vi-VN",
                viewport={"width": 1366, "height": 768},
            )
            page = await ctx.new_page()
            await page.goto(url, timeout=30000, wait_until="domcontentloaded")
            await asyncio.sleep(conf.get("wait_seconds", 2 + attempt))

            cards = await page.query_selector_all(conf["card"])
            if not cards:
                await ctx.close()
                if attempt < max_retries:
                    await asyncio.sleep(2 + attempt * 2)
                    continue
                _log_scrape_run(source, keyword, 0, True, "no cards found")
                return []

            jobs = []
            for card in cards:
                try:
                    # ── VietnamWorks text-based extraction ──
                    if conf.get("text_based"):
                        card_text = await card.inner_text()
                        parsed = _parse_card_text_vietnamworks(card_text)
                        title = parsed["title"]
                        company = parsed["company"] or "Unknown"
                        location = parsed["location"] or None
                        salary_text = parsed["salary"] or None
                        date_text = parsed["date"] or None

                        # Get URL from the first link in the card
                        links = await card.query_selector_all("a")
                        full_url = ""
                        for link in links:
                            href = await link.get_attribute("href") or ""
                            if href and href != "#" and not href.startswith("javascript"):
                                full_url = href if href.startswith("http") else conf["base"] + href
                                break

                        s_min, s_max = parse_salary(salary_text)
                        salary_display = _format_vnd_display(s_min, s_max, salary_text) if salary_text else None
                        posted_date = parse_posted_date(date_text) if date_text else None
                        if not posted_date:
                            posted_date = parse_posted_date(card_text)
                        if not posted_date:
                            posted_date = datetime.now().strftime("%Y-%m-%d")

                        card_full_text = await card.inner_text()
                        skills = extract_skills(title, company, card_full_text, [])

                        jobs.append(JobResult(
                            url=full_url,
                            title=title.strip(),
                            company=company.strip(),
                            location=location.strip() if location else None,
                            salary=salary_display or salary_text,
                            salary_min=s_min,
                            salary_max=s_max,
                            source=source,
                            posted_date=posted_date,
                            skills=skills,
                            description_snippet=None,
                        ).model_dump())
                        continue

                    # ── Standard CSS-selector-based extraction ──
                    title_elem = await card.query_selector(conf["title"])
                    if not title_elem:
                        continue
                    title = await title_elem.inner_text()
                    # Try href, then data-url, then first real link in card
                    href = await title_elem.get_attribute("href") or ""
                    if not href or href in ("null", "#", ""):
                        href = await title_elem.get_attribute("data-url") or ""
                    if not href or href in ("null", "#", ""):
                        links_in_card = await card.query_selector_all("a[href]")
                        for link in links_in_card:
                            lh = await link.get_attribute("href") or ""
                            if lh and lh not in ("null", "#", "") and not lh.startswith("javascript"):
                                href = lh
                                break
                    full_url = href if href.startswith("http") else conf["base"] + href

                    company_elem = await card.query_selector(conf["company"])
                    company = await company_elem.inner_text() if company_elem else "Unknown"

                    # Salary
                    salary_text = None
                    salary_elem = await card.query_selector(conf["salary"])
                    if salary_elem:
                        salary_text = await salary_elem.inner_text()
                    s_min, s_max = parse_salary(salary_text)
                    salary_display = _format_vnd_display(s_min, s_max, salary_text)

                    # Posted date
                    posted_date = None
                    if "date" in conf:
                        date_elem = await card.query_selector(conf["date"])
                        if date_elem:
                            date_text = await date_elem.inner_text()
                            posted_date = parse_posted_date(date_text)
                    if not posted_date:
                        all_text = await card.inner_text()
                        posted_date = parse_posted_date(all_text)
                    if not posted_date:
                        posted_date = datetime.now().strftime("%Y-%m-%d")

                    # Location & description & skills
                    location = None
                    if "location" in conf:
                        loc_elem = await card.query_selector(conf["location"])
                        location = await loc_elem.inner_text() if loc_elem else None

                    description_snippet = None
                    desc_text_built = None
                    if "desc" in conf:
                        desc_elem = await card.query_selector(conf["desc"])
                        if desc_elem:
                            desc_text_built = (await desc_elem.inner_text()).strip()
                    if not desc_text_built and not conf.get("api_url"):
                        # Fallback: use card's full text minus known short fields
                        full_text = await card.inner_text()
                        known_titles = {"new", "hot", "urgent", "top", "sign in to view salary"}
                        lines = [l.strip() for l in full_text.split("\n") if l.strip() and l.strip().lower() not in known_titles]
                        # Filter out very short lines unless they contain skill-like content
                        meaningful = [l for l in lines if len(l) > 15 or any(ch in l for ch in ("Python", "SQL", "Go", "Java", "AWS", "React", "AI", "ML", "EXCEL"))]
                        if meaningful:
                            desc_text_built = meaningful[0][:300]
                        elif lines:
                            # Include title/skills as fallback
                            segments = [l for l in lines if len(l) > 5]
                            desc_text_built = " | ".join(segments[:3])[:300]
                    # For TopDev: already built by _fetch_topdev_api
                    description_snippet = desc_text_built or None

                    skill_tags = []
                    if "skill_tags" in conf:
                        skill_elems = await card.query_selector_all(conf["skill_tags"])
                        for se in skill_elems[:8]:
                            st = await se.inner_text()
                            skill_tags.append(st.strip())

                    card_text = await card.inner_text()
                    skills = extract_skills(title, company, card_text, skill_tags)

                    jobs.append(JobResult(
                        url=full_url,
                        title=title.strip(),
                        company=company.strip(),
                        location=location.strip() if location else None,
                        salary=salary_display or None,
                        salary_min=s_min,
                        salary_max=s_max,
                        source=source,
                        posted_date=posted_date,
                        skills=skills,
                        description_snippet=description_snippet,
                    ).model_dump())
                except Exception:
                    continue

            await ctx.close()
            _log_scrape_run(source, keyword, len(jobs), True)
            return jobs

        except Exception as e:
            last_error = str(e)[:300]
            if attempt < max_retries:
                await asyncio.sleep(3 * (attempt + 1))
                continue
            logger.warning("Failed %s/%s page %d: %s", source, keyword, page_num, e)
            _log_scrape_run(source, keyword, 0, False, last_error)
            return []

    return []

# ── Endpoints ─────────────────────────────────────────────────────────

@router.get("/source-health")
async def source_health(hours: int = Query(24, ge=1, le=168)):
    """Per-source scrape success rate over the last N hours (default 24h)."""
    cutoff = (datetime.now() - timedelta(hours=hours)).isoformat()
    out: dict = {}
    with get_connection() as conn:
        try:
            rows = conn.execute(
                """
                SELECT source,
                       COUNT(*) AS runs,
                       SUM(CASE WHEN ok=1 THEN 1 ELSE 0 END) AS oks,
                       SUM(count) AS total_jobs,
                       MAX(created_at) AS last_run,
                       (SELECT error FROM scrape_runs sr2
                        WHERE sr2.source = sr.source AND sr2.ok = 0
                        ORDER BY created_at DESC LIMIT 1) AS last_error
                FROM scrape_runs sr
                WHERE created_at >= ?
                GROUP BY source
                ORDER BY source
                """,
                (cutoff,),
            ).fetchall()
        except Exception:
            rows = []
    for row in rows:
        item = dict(row)
        runs = item.get("runs") or 0
        oks = item.get("oks") or 0
        item["success_rate"] = round((oks / runs) * 100) if runs else 0
        out[item["source"]] = item
    return {"window_hours": hours, "sources": out}


@router.get("/health")
async def health():
    cached = len(_load_fresh_cache())
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "sources": list(SOURCE_CONF.keys()),
        "cached_jobs": cached,
    }

@router.post("/scrape")
async def scrape_jobs(req: ScrapeRequest):
    """Scrape jobs — ONE browser shared across all tasks."""
    if not req.keywords:
        raise HTTPException(400, "At least one keyword required")
    invalid = [s for s in req.sources if s not in SOURCE_CONF]
    if invalid:
        raise HTTPException(400, f"Invalid sources: {invalid}. Valid: {list(SOURCE_CONF.keys())}")

    all_jobs = []
    browser_needed = any("api_url" not in SOURCE_CONF[s] for s in req.sources)

    if browser_needed:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            try:
                tasks = []
                for kw in req.keywords:
                    for src in req.sources:
                        for pg in range(1, req.max_pages + 1):
                            tasks.append(_scrape_source(browser, kw, src, pg))

                sem = asyncio.Semaphore(4)
                async def limited(t):
                    async with sem:
                        try:
                            return await t
                        except Exception as e:
                            logger.warning("Scrape task failed: %s", e)
                            return []
                results = await asyncio.gather(*[limited(t) for t in tasks], return_exceptions=False)
            finally:
                await browser.close()
    else:
        # None of the sources need a browser (e.g. only topdev)
        tasks = []
        for kw in req.keywords:
            for src in req.sources:
                for pg in range(1, req.max_pages + 1):
                    tasks.append(_scrape_source(None, kw, src, pg))
        results = await asyncio.gather(*tasks, return_exceptions=True)
        results = [r if isinstance(r, list) else [] for r in results]

    for r in results:
        all_jobs.extend(r)

    # Dedup by URL
    seen = set()
    unique = []
    for j in all_jobs:
        if j["url"] not in seen:
            seen.add(j["url"])
            unique.append(j)

    # Merge with cache, keeping only the last 3 days of search results.
    cached = _load_fresh_cache()
    existing_urls = {j["url"] for j in cached}
    new_count = 0
    now_iso = datetime.now().isoformat()
    for j in unique:
        if j["url"] not in existing_urls:
            j["discovered_at"] = now_iso
            cached.append(j)
            existing_urls.add(j["url"])
            new_count += 1
    cached = _prune_old_jobs(cached)
    _save_cache(cached)
    db_saved_count = _count_cached_urls([j.get("url") for j in unique])

    try:
        from api.services.agent_events import broadcast_agent_event
        broadcast_agent_event("agent.data", {
            "tab": "jobs",
            "payload": {"count": len(unique), "new_count": new_count,
                        "total_cached": len(cached), "preview": unique[:20]},
        })
        if new_count:
            broadcast_agent_event("agent.notification", {
                "message": f"Săn việc: +{new_count} JD mới ({len(unique)} kết quả, {len(cached)} cache)",
            })
    except Exception:
        pass

    return {
        "jobs": unique,
        "count": len(unique),
        "new_count": new_count,
        "total_cached": len(cached),
        "db_saved_count": db_saved_count,
        "db_table": "cached_jobs",
    }

@router.get("/job-detail")
async def get_job_detail(url: str = Query(...)):
    """Get full detail of a single cached job by URL."""
    jobs = _load_fresh_cache()
    for j in jobs:
        if j.get("url") == url:
            return {"job": j}
    raise HTTPException(404, "Job not found in cache")


@router.get("/search")
async def search_jobs(
    keyword: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    salary_min: Optional[int] = Query(None),
    company: Optional[str] = Query(None),
    days_old: Optional[int] = Query(None),
    limit: int = Query(50, le=200),
    apply_prefs: bool = Query(True),
    request: Request = None,
):
    """Search cached jobs with filters. When apply_prefs=true and user has
    saved preferences, jobs that conflict with locations / salary_min /
    work_modes / avoid_keywords are filtered out."""
    jobs = _load_fresh_cache()
    if not jobs:
        return {"jobs": [], "count": 0, "message": "No jobs cached. POST /job-hunter/scrape first."}

    prefs = None
    if apply_prefs and request is not None:
        try:
            uid = _get_user_id(request)
            prefs = load_prefs(uid)
            if not any([prefs.get("locations"), prefs.get("salary_min"),
                        prefs.get("work_modes"), prefs.get("avoid_keywords")]):
                prefs = None
        except HTTPException:
            prefs = None

    filtered = []
    kw_terms = _keyword_terms(keyword)
    canonical_query_loc = canonical_location(location) if location else None
    now = datetime.now()

    for j in jobs:
        if _looks_unsuitable_job(j):
            continue
        if source and j.get("source") != source:
            continue
        if location:
            if canonical_query_loc:
                if canonical_query_loc not in canonical_locations(j.get("location") or ""):
                    continue
            elif location.lower() not in (j.get("location") or "").lower():
                continue
        if salary_min and (j.get("salary_max") or 0) < salary_min:
            continue
        if company and company.lower() not in (j.get("company") or "").lower():
            continue
        if kw_terms:
            text = f"{j.get('title','')} {j.get('company','')} {j.get('description_snippet','')} {' '.join(j.get('skills',[]))}"
            lowered = text.lower()
            if not any(term in lowered for term in kw_terms):
                continue
        if days_old:
            pd = j.get("posted_date")
            if pd:
                try:
                    d = datetime.fromisoformat(pd)
                    if now - d > timedelta(days=days_old):
                        continue
                except Exception:
                    pass
        if prefs and not _job_matches_prefs(j, prefs):
            continue
        filtered.append(j)

    filtered.sort(key=lambda x: x.get("salary_max") or 0, reverse=True)

    # Ưu tiên target_companies (công ty lớn, ổn định) lên đầu
    if prefs and prefs.get("target_companies"):
        target_lower = [c.lower() for c in prefs["target_companies"]]
        def company_score(j):
            cl = (j.get("company") or "").lower()
            for t in target_lower:
                if t in cl:
                    return 1
            return 0
        filtered.sort(key=lambda x: (company_score(x), x.get("salary_max") or 0), reverse=True)

    return {
        "jobs": filtered[:limit],
        "count": len(filtered[:limit]),
        "total_matching": len(filtered),
        "prefs_applied": bool(prefs),
    }


@router.get("/preferences")
async def get_preferences(request: Request):
    uid = _get_user_id(request)
    return {"preferences": load_prefs(uid), "location_labels": LOCATION_LABELS}


class PreferencesBody(BaseModel):
    target_roles: List[str] = []
    locations: List[str] = []
    keywords: List[str] = []
    salary_min: Optional[int] = None
    work_modes: List[str] = []
    level: Optional[str] = None
    must_have_skills: List[str] = []
    avoid_keywords: List[str] = []
    languages: List[str] = []
    compressed_week: bool = True
    target_companies: List[str] = []


@router.put("/preferences")
async def put_preferences(body: PreferencesBody, request: Request):
    uid = _get_user_id(request)
    locations = [loc for loc in body.locations if loc in LOCATION_LABELS]
    work_modes = [m for m in body.work_modes if m in _VALID_WORK_MODES]
    level = body.level if body.level in _VALID_LEVELS else None
    salary = max(0, int(body.salary_min)) if body.salary_min else 20_000_000
    payload = {
        "target_roles": _normalize_string_list(body.target_roles, 8),
        "locations": locations[:8],
        "keywords": _normalize_string_list(body.keywords, 16),
        "salary_min": salary,
        "work_modes": work_modes,
        "level": level,
        "must_have_skills": _normalize_string_list(body.must_have_skills, 24),
        "avoid_keywords": _normalize_string_list(body.avoid_keywords, 24),
        "languages": _normalize_string_list(body.languages, 8),
        "compressed_week": bool(body.compressed_week),
        "target_companies": _normalize_string_list(body.target_companies, 16),
    }
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO user_job_preferences
                (user_id, target_roles, locations, keywords, salary_min, work_modes,
                 level, must_have_skills, avoid_keywords, languages,
                 compressed_week, target_companies, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id) DO UPDATE SET
                    target_roles = excluded.target_roles,
                    locations = excluded.locations,
                    keywords = excluded.keywords,
                    salary_min = excluded.salary_min,
                    work_modes = excluded.work_modes,
                    level = excluded.level,
                    must_have_skills = excluded.must_have_skills,
                    avoid_keywords = excluded.avoid_keywords,
                    languages = excluded.languages,
                    compressed_week = excluded.compressed_week,
                    target_companies = excluded.target_companies,
                    updated_at = CURRENT_TIMESTAMP""",
            (
                uid,
                json.dumps(payload["target_roles"], ensure_ascii=False),
                json.dumps(payload["locations"], ensure_ascii=False),
                json.dumps(payload["keywords"], ensure_ascii=False),
                payload["salary_min"],
                json.dumps(payload["work_modes"], ensure_ascii=False),
                payload["level"],
                json.dumps(payload["must_have_skills"], ensure_ascii=False),
                json.dumps(payload["avoid_keywords"], ensure_ascii=False),
                json.dumps(payload["languages"], ensure_ascii=False),
                int(payload["compressed_week"]),
                json.dumps(payload["target_companies"], ensure_ascii=False),
            ),
        )
    return {"preferences": payload, "location_labels": LOCATION_LABELS}

@router.get("/sources")
async def list_sources():
    return {"sources": list(SOURCE_CONF.keys())}

@router.delete("/jobs")
async def delete_job(req: DeleteJobRequest):
    return _delete_job_by_url(req.url)


@router.delete("/jobs/{job_ref:path}")
async def delete_job_by_ref(job_ref: str):
    with get_connection() as conn:
        _ensure_deleted_jobs_table(conn)
        row = conn.execute(
            """
            SELECT url FROM cached_jobs
            WHERE url = ?
            """,
            (job_ref,),
        ).fetchone()
    if not row:
        raise HTTPException(404, "Job not found")
    return _delete_job_by_url(row["url"])


def _delete_job_by_url(url: str):
    clean_url = str(url or "").strip()
    if not clean_url:
        raise HTTPException(400, "Job url required")
    jobs = _load_fresh_cache()
    kept = [job for job in jobs if job.get("url") != clean_url]
    if len(kept) == len(jobs):
        with get_connection() as conn:
            existing = conn.execute("SELECT 1 FROM cached_jobs WHERE url = ?", (clean_url,)).fetchone()
            if not existing:
                raise HTTPException(404, "Job not found")
    with get_connection() as conn:
        _ensure_deleted_jobs_table(conn)
        conn.execute(
            """
            INSERT INTO deleted_jobs (url, deleted_at)
            VALUES (?, CURRENT_TIMESTAMP)
            ON CONFLICT(url) DO UPDATE SET deleted_at = CURRENT_TIMESTAMP
            """,
            (clean_url,),
        )
        conn.execute("DELETE FROM cv_match_scores WHERE job_url = ?", (clean_url,))
        conn.execute("DELETE FROM cached_jobs WHERE url = ?", (clean_url,))
    CACHE_FILE.write_text(json.dumps(kept, ensure_ascii=False, indent=2))
    return {"status": "deleted", "deleted": True, "url": clean_url, "total_cached": len(kept)}


async def delete_job_alias(req: DeleteJobRequest):
    return _delete_job_by_url(req.url)


async def delete_job_by_ref_alias(job_ref: str):
    return await delete_job_by_ref(job_ref)

@router.post("/watch")
async def watch_jobs(req: WatchRequest):
    watches = _load_watches()
    watch = {
        "id": str(len(watches) + 1),
        "keywords": req.keywords,
        "sources": req.sources,
        "interval_minutes": req.interval_minutes,
        "notify": req.notify,
        "created_at": datetime.now().isoformat(),
        "last_run": None,
    }
    watches.append(watch)
    _save_watches(watches)
    return {"status": "created", "watch": watch}

@router.get("/watches")
async def list_watches():
    return {"watches": _load_watches()}

@router.delete("/watches/{watch_id}")
async def delete_watch(watch_id: str):
    watches = _load_watches()
    new_watches = [w for w in watches if w.get("id") != watch_id]
    if len(new_watches) == len(watches):
        raise HTTPException(404, "Watch not found")
    _save_watches(new_watches)
    return {"status": "deleted"}

@router.get("/export")
async def export_csv(
    keyword: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    salary_min: Optional[int] = Query(None),
):
    """Export cached jobs as CSV."""
    jobs = _load_fresh_cache()
    filtered = []
    for j in jobs:
        if source and j.get("source") != source:
            continue
        if salary_min and (j.get("salary_max") or 0) < salary_min:
            continue
        if keyword and keyword.lower() not in f"{j.get('title','')} {j.get('company','')}".lower():
            continue
        filtered.append(j)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["title", "company", "location", "salary", "salary_min_vnd",
                      "salary_max_vnd", "source", "posted_date", "skills", "url",
                      "description_snippet"])
    for j in filtered:
        writer.writerow([
            j.get("title", ""),
            j.get("company", ""),
            j.get("location", ""),
            j.get("salary", ""),
            j.get("salary_min", ""),
            j.get("salary_max", ""),
            j.get("source", ""),
            j.get("posted_date", ""),
            ", ".join(j.get("skills", [])),
            j.get("url", ""),
            j.get("description_snippet", ""),
        ])
    content = output.getvalue()
    return {"csv": content, "rows": len(filtered)}

@router.delete("/cache")
async def clear_cache():
    CACHE_FILE.unlink(missing_ok=True)
    with get_connection() as conn:
        conn.execute("DELETE FROM cached_jobs")
    return {"status": "cleared"}

@router.get("/stats")
async def stats():
    """Statistics about cached jobs."""
    jobs = _load_fresh_cache()
    if not jobs:
        return {"total": 0}
    by_source = {}
    by_company = {}
    salary_jobs = [j for j in jobs if j.get("salary_max")]
    for j in jobs:
        src = j.get("source", "unknown")
        by_source[src] = by_source.get(src, 0) + 1
        co = j.get("company", "Unknown")
        by_company[co] = by_company.get(co, 0) + 1
    return {
        "total": len(jobs),
        "by_source": by_source,
        "top_companies": sorted(by_company.items(), key=lambda x: -x[1])[:10],
        "avg_salary_max": sum(j["salary_max"] for j in salary_jobs) // len(salary_jobs) if salary_jobs else None,
        "salary_currency": "VND/month",
    }
