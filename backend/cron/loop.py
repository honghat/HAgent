"""Backend-owned cron tick loop.

This keeps cron runtime under backend/cron so PM2 and local runs share the same
module path and HAGENT_HOME.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("HAGENT_HOME", str(BACKEND_DIR))

try:
    from dotenv import load_dotenv  # noqa: E402
    load_dotenv(BACKEND_DIR.parent / ".env", override=True)
except ImportError:
    pass

from api.services.self_evolution import run_daily_review  # noqa: E402
from cron.scheduler import tick  # noqa: E402


INTERVAL = 60


def main() -> None:
    while True:
        try:
            tick(verbose=False)
            run_daily_review("hat")
        except Exception as exc:  # noqa: BLE001
            print(f"[cron] tick error: {exc}", file=sys.stderr)
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
