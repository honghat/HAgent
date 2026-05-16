"""Skills router — list, create, update, delete skills (delegates to file system)."""

import json
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from hagent_constants import get_hagent_home, _APP_ROOT

router = APIRouter(prefix="/api/skills", tags=["skills"])


def _skills_dir() -> Path:
    return _APP_ROOT / "skills"


def _build_skill_md(name: str, description: str, instructions: str) -> str:
    return f"""---
name: "{name}"
description: "{description or ''}"
---

{instructions or ''}
"""


def _parse_skill_md(path: Path) -> dict:
    content = path.read_text("utf-8")
    name = path.parent.name
    desc = ""
    instructions = content
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            for line in parts[1].strip().split("\n"):
                if line.startswith("description:"):
                    desc = line.split(":", 1)[1].strip().strip('"')
            instructions = parts[2].strip() if len(parts) > 2 else ""
    return {"name": name, "description": desc, "instructions": instructions, "file": str(path)}


@router.get("")
def list_skills(request: Request):
    skills_dir = _skills_dir()
    if not skills_dir.exists():
        return []
    skills = []
    for skill_md in sorted(skills_dir.rglob("SKILL.md")):
        rel = skill_md.relative_to(skills_dir).parent
        name = "/".join(rel.parts)
        parsed = _parse_skill_md(skill_md)
        parsed["name"] = name
        skills.append(parsed)
    return skills


class CreateSkillBody(BaseModel):
    name: str
    description: Optional[str] = ""
    instructions: Optional[str] = ""


@router.post("")
def create_skill(body: CreateSkillBody, request: Request):
    import re
    if not re.match(r"^[a-z0-9-]+$", body.name):
        raise HTTPException(status_code=400, detail="Ten ky nang chi chua chu thuong, so va gach ngang.")
    skill_dir = _skills_dir() / body.name
    skill_md = skill_dir / "SKILL.md"
    if skill_md.exists():
        raise HTTPException(status_code=400, detail="Ky nang nay da ton tai.")
    skill_dir.mkdir(parents=True, exist_ok=True)
    skill_md.write_text(_build_skill_md(body.name, body.description or "", body.instructions or ""), "utf-8")
    return {"success": True, "name": body.name}


class UpdateSkillBody(BaseModel):
    description: Optional[str] = ""
    instructions: Optional[str] = ""


@router.put("/{name}")
def update_skill(name: str, body: UpdateSkillBody, request: Request):
    skill_md = _skills_dir() / name / "SKILL.md"
    if not skill_md.exists():
        raise HTTPException(status_code=404, detail="Ky nang khong ton tai.")
    skill_md.write_text(
        _build_skill_md(name, body.description or "", body.instructions or ""), "utf-8"
    )
    return {"success": True, "name": name}


@router.delete("/{name}")
def delete_skill(name: str, request: Request):
    import shutil
    skill_dir = _skills_dir() / name
    if skill_dir.exists():
        shutil.rmtree(skill_dir)
    return {"success": True}
