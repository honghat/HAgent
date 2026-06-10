#!/bin/bash
# Wrapper for cron security check: scripts must live under repo-root scripts/.
# Delegates to the real runner in backend/jobs/.
exec /Users/nguyenhat/HAgent/backend/.venv/bin/python /Users/nguyenhat/HAgent/backend/jobs/job_hunt_runner.py "$@"
