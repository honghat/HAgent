"""CV Profile router — save/load user CV data (skills, roles, experience)."""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from api.services.db import get_connection
from api.services.user_store import resolve_user_id

router = APIRouter(prefix="/api/cv", tags=["CV"])


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


@router.get("/profile")
async def get_cv_profile(request: Request):
    uid = _get_user_id(request)
    with get_connection() as conn:
        row = conn.execute(
            "SELECT skills, roles, experience, updated_at FROM user_cv_profile WHERE user_id = ?",
            (uid,)
        ).fetchone()
    if not row:
        return {"skills": "", "roles": "", "experience": "", "updated_at": None}
    return dict(row)


@router.put("/profile")
async def upsert_cv_profile(body: CVProfileBody, request: Request):
    uid = _get_user_id(request)
    with get_connection() as conn:
        conn.execute("""
            INSERT INTO user_cv_profile (user_id, skills, roles, experience, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
                skills = excluded.skills,
                roles = excluded.roles,
                experience = excluded.experience,
                updated_at = CURRENT_TIMESTAMP
        """, (uid, body.skills, body.roles, body.experience))
    return {"ok": True}
