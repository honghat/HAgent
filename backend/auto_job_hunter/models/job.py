from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List

@dataclass
class RawJob:
    source: str          # "linkedin" | "topcv" | "itviec"
    external_id: str     # ID gốc từ site
    title: str
    company: str
    location: str
    salary_raw: str      # "15-25 triệu" — chưa parse
    url: str
    description_html: str
    posted_at: Optional[datetime]
    scraped_at: datetime

@dataclass
class ParsedJob:
    job_id: int
    required_skills: List[str]
    nice_to_have: List[str]
    seniority: str                   # "junior" | "mid" | "senior" | "lead"
    job_type: str                    # "full-time" | "part-time" | "contract"
    remote: bool
    tech_stack: List[str]
    responsibilities: List[str]
    requirements_summary: str
    match_score: float               # 0.0–1.0
    match_reasons: List[str]
