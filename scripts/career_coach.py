#!/usr/bin/env python3
"""career_coach.py — Soạn nhắc nhở phục vụ mục tiêu xin việc.

Gọi từ cron (no_agent=True). Output stdout sẽ được scheduler gửi sang
Telegram. Output rỗng → cron coi như SILENT.

Usage:
    python3 career_coach.py --slot {morning|code|english|apply|review} [--token hat]
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

API_BASE = "http://127.0.0.1:8010"
TTS_URL = "http://127.0.0.1:5002/tts"
TTS_VOICE = "vi-VN-HoaiMyNeural"
DEFAULT_TOKEN = "hat"
HTTP_TIMEOUT = 10

SLOT_TITLES = {
    "morning": "Mở ngày săn việc",
    "code":    "Học code 25 phút",
    "english": "Tiếng Anh cho phỏng vấn",
    "apply":   "Rà JD & ứng tuyển",
    "review":  "Tổng kết ngày",
}


def _http_json(method: str, path: str, token: str, body: dict | None = None) -> dict:
    url = f"{API_BASE}{path}"
    data = None
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
        raw = resp.read().decode("utf-8") or "{}"
        return json.loads(raw)


def _fetch_dashboard(token: str) -> dict:
    try:
        return _http_json("GET", f"/api/coach/dashboard?t={token}", token)
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError) as exc:
        print(f"[career_coach] dashboard lỗi: {exc}", file=sys.stderr)
        return {"matches_top": [], "lessons_backlog": [], "english_pending": 0, "recent_reminders": []}


def _short_title(s: str, limit: int = 48) -> str:
    s = (s or "").strip()
    return s if len(s) <= limit else s[: limit - 1] + "…"


def _top_match(dashboard: dict) -> dict | None:
    for m in dashboard.get("matches_top") or []:
        if (m.get("match_score") or 0) >= 0:
            return m
    return None


def _format_match_line(m: dict) -> str:
    title = _short_title(m.get("title") or "JD")
    company = _short_title(m.get("company") or "?", 24)
    score = int(round(float(m.get("match_score") or 0)))
    return f"{title} — {company} · {score}% match"


def _missing_skills(dashboard: dict) -> list[str]:
    skills: list[str] = []
    for m in (dashboard.get("matches_top") or [])[:3]:
        for sk in (m.get("missing") or [])[:3]:
            sk = str(sk).strip()
            if sk and sk.lower() not in {s.lower() for s in skills}:
                skills.append(sk)
        if len(skills) >= 4:
            break
    return skills[:4]


def _build_morning(d: dict) -> str:
    m = _top_match(d)
    if m:
        return (
            f"🌅 Mở ngày — Mục tiêu: xin việc\n"
            f"• JD top: {_format_match_line(m)}\n"
            f"• Hôm nay: cập nhật CV theo JD này, gửi 1 ứng tuyển trước 18h.\n"
            f"👉 Mở: {m.get('job_url') or m.get('url') or ''}"
        )
    return (
        "🌅 Mở ngày — chưa có JD match.\n"
        "• Hành động: chạy săn JD thủ công, hoặc bổ sung từ khoá CV.\n"
        "👉 /job-hunter/scrape"
    )


def _build_code(d: dict) -> str:
    missing = _missing_skills(d)
    lessons = d.get("lessons_backlog") or []
    if lessons:
        l = lessons[0]
        topic = _short_title(l.get("topic") or l.get("track") or "bài học")
        focus = f" (ưu tiên: {', '.join(missing[:2])})" if missing else ""
        return (
            "💻 Học code 25' — phục vụ JD đang nhắm" + focus + "\n"
            f"• Bài: #{l.get('id')} {topic}\n"
            "👉 Mở Learn, hoàn 1 bài trước 13h."
        )
    if missing:
        return (
            "💻 Học code 25' — bù kỹ năng thiếu cho JD\n"
            f"• Tập trung: {', '.join(missing[:3])}\n"
            "👉 Luyện 1 bài LeetCode/khoá ngắn về 1 kỹ năng trên."
        )
    return (
        "💻 Học code 25'\n"
        "• Chưa có lesson pending. Chọn 1 kỹ năng JD gần nhất cần.\n"
        "👉 Tạo bài học mới trong Learn."
    )


def _build_english(d: dict) -> str:
    pending = int(d.get("english_pending") or 0)
    m = _top_match(d)
    jd_hint = f" (đọc JD '{_short_title(m.get('title') or '', 30)}')" if m else ""
    if pending > 0:
        return (
            f"🗣️ Tiếng Anh phỏng vấn — còn {pending} mục pending{jd_hint}\n"
            "• Làm 5 mục, ưu tiên IT vocab / câu phỏng vấn.\n"
            "👉 Mở tab English."
        )
    return (
        "🗣️ Tiếng Anh phỏng vấn\n"
        f"• Không có mục pending. Dịch tóm tắt 1 JD top hôm nay{jd_hint}.\n"
        "👉 Mở tab English → tạo bài mới."
    )


def _build_apply(d: dict) -> str:
    matches = [m for m in (d.get("matches_top") or []) if (m.get("match_score") or 0) >= 60][:3]
    if not matches:
        return (
            "📨 Rà JD chiều — chưa có JD ≥ 60% match\n"
            "• Hành động: nới từ khoá hoặc cập nhật CV để mở rộng pool.\n"
            "👉 Mở Job Hunter."
        )
    lines = ["📨 Rà JD chiều — ứng tuyển ngay:"]
    for i, m in enumerate(matches, 1):
        lines.append(f"{i}. {_format_match_line(m)}")
    lines.append("👉 Chọn 1 JD, ứng tuyển + ghi log Apply.")
    return "\n".join(lines[:6])


def _build_review(d: dict) -> str:
    today_apply = len([m for m in (d.get("matches_top") or []) if (m.get("verdict") or "") == "applied"])
    lessons_left = len(d.get("lessons_backlog") or [])
    english_left = int(d.get("english_pending") or 0)
    return (
        "🌙 Tổng kết ngày — mục tiêu xin việc\n"
        f"• JD đã apply (7 ngày): {today_apply}\n"
        f"• Lesson pending: {lessons_left} · English pending: {english_left}\n"
        "👉 Đặt 1 mục tiêu cụ thể cho mai (vd: apply 2 JD)."
    )


SLOT_BUILDERS = {
    "morning": _build_morning,
    "code":    _build_code,
    "english": _build_english,
    "apply":   _build_apply,
    "review":  _build_review,
}


def _is_duplicate(message: str, recent: list[dict]) -> bool:
    if not recent:
        return False
    last = (recent[0].get("message") or "").strip()
    return last and last == message.strip()


def _save_reminder(slot: str, message: str, token: str) -> None:
    try:
        _http_json(
            "POST",
            "/api/coach/reminders",
            token,
            body={"message": message, "kind": slot, "meta": {"source": "career_coach"}},
        )
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError) as exc:
        print(f"[career_coach] lưu reminder lỗi: {exc}", file=sys.stderr)


def _speak_via_loa(text: str) -> None:
    """JARVIS đọc to qua loa Mac — best-effort, không ảnh hưởng cron delivery.

    Pipeline: text → Edge TTS server (port 5002) → file MP3 → afplay/paplay.
    Bất kỳ lỗi nào cũng nuốt im, để Telegram vẫn nhận stdout.
    """
    if not text or not text.strip():
        return
    player = None
    for cand in ("afplay", "paplay", "mpg123", "ffplay"):
        if shutil.which(cand):
            player = cand
            break
    if not player:
        return
    try:
        body = json.dumps({"text": text, "voice": TTS_VOICE}).encode("utf-8")
        req = urllib.request.Request(
            TTS_URL,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            audio = resp.read()
        if not audio:
            return
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp.write(audio)
            path = tmp.name
        try:
            cmd = [player, path] if player != "ffplay" else [player, "-nodisp", "-autoexit", path]
            subprocess.run(cmd, check=False, capture_output=True, timeout=120)
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass
    except (urllib.error.URLError, urllib.error.HTTPError, subprocess.TimeoutExpired, OSError) as exc:
        print(f"[career_coach] TTS speak lỗi: {exc}", file=sys.stderr)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--slot", required=True, choices=sorted(SLOT_BUILDERS.keys()))
    parser.add_argument("--token", default=DEFAULT_TOKEN)
    parser.add_argument("--speak", action="store_true", help="Đọc to qua loa Mac (Edge TTS)")
    args = parser.parse_args()

    dashboard = _fetch_dashboard(args.token)
    message = SLOT_BUILDERS[args.slot](dashboard).strip()

    if not message:
        return 0
    if _is_duplicate(message, dashboard.get("recent_reminders") or []):
        return 0

    _save_reminder(args.slot, message, args.token)
    print(message)
    if args.speak:
        _speak_via_loa(message)
    return 0


if __name__ == "__main__":
    sys.exit(main())
