#!/usr/bin/env python3
import json
import sqlite3
from pathlib import Path

db_path = Path(__file__).resolve().parents[1] / "data" / "hagent.db"
db = sqlite3.connect(db_path)
r = db.execute("SELECT job_id, last_run_at, last_status, last_error, cron_output FROM cron_jobs ORDER BY updated_at DESC LIMIT 1").fetchone()
if r:
    d = dict(zip(["id","last_run_at","last_status","last_error","cron_output"], r))
    print(json.dumps(d, indent=2, default=str))
else:
    print("no rows")
db.close()
