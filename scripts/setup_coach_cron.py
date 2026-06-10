#!/usr/bin/env python3
"""Bootstrap the 3 coach cron jobs into backend/cron/jobs.json.

Phải chạy bằng backend venv (chứa croniter):

    backend/.venv/bin/python scripts/setup_coach_cron.py            # add missing jobs (idempotent)
    backend/.venv/bin/python scripts/setup_coach_cron.py --replace  # overwrite by name

Jobs:
  1. "scrape JD mỗi ngày"        — 08:13 daily, no_agent script
  2. "watch list JD mỗi 30 phút" — every 30 min, no_agent script
  3. "Coach học + săn việc"       — hourly 8h-23h (minute 7), agent + telegram, skill=study-job-coach
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Make backend imports work no matter where the script is launched.
ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from cron import jobs as cron_jobs  # noqa: E402

RUNNER = str(BACKEND / "jobs" / "job_hunt_runner.py")

CRON_JOBS = [
    {
        "name": "scrape JD mỗi ngày",
        "schedule": "13 8 * * *",
        "no_agent": True,
        "script": f"{RUNNER} --mode daily --token hat",
        "deliver": "telegram",
        "workdir": str(BACKEND),
    },
    {
        "name": "watch list JD mỗi 30 phút",
        "schedule": "every 30m",
        "no_agent": True,
        "script": f"{RUNNER} --mode watch --token hat",
        "deliver": "telegram",
        "workdir": str(BACKEND),
    },
    {
        "name": "Coach học + săn việc",
        "schedule": "7 8-23 * * *",
        "prompt": (
            "Use skill study-job-coach. Đọc dashboard tại /api/coach/dashboard "
            "(user hat). Soạn 1 nhắc nhở ≤ 5 dòng theo khung giờ hiện tại. "
            "Sau khi soạn xong, POST /api/coach/reminders với JSON "
            "{message, kind:'hourly', meta:{...}} để lưu vào coach_reminders. "
            "Nếu không có gì đáng nhắc, trả về [SILENT]."
        ),
        "skills": ["study-job-coach"],
        "deliver": "telegram",
        "workdir": str(BACKEND),
    },
]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--replace", action="store_true",
                        help="Remove any existing job with the same name before adding")
    args = parser.parse_args()

    existing = cron_jobs.load_jobs()
    existing_by_name = {j.get("name"): j for j in existing}
    added: list[str] = []
    skipped: list[str] = []

    for spec in CRON_JOBS:
        name = spec["name"]
        if name in existing_by_name:
            if not args.replace:
                skipped.append(name)
                continue
            cron_jobs.remove_job(existing_by_name[name]["id"])

        kwargs = dict(spec)
        kwargs.pop("name", None)
        kwargs.pop("schedule", None)

        cron_jobs.create_job(
            prompt=spec.get("prompt"),
            schedule=spec["schedule"],
            name=name,
            **{k: v for k, v in kwargs.items() if k in {
                "deliver", "skills", "no_agent", "script", "workdir",
                "model", "provider", "enabled_toolsets",
            }},
        )
        added.append(name)

    print(json.dumps({"added": added, "skipped": skipped}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
