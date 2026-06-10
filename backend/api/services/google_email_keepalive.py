"""Monthly Gmail activity messages between connected accounts."""
from __future__ import annotations

import base64
import calendar
import json
import logging
import threading
import time
import uuid
from datetime import datetime
from email.message import EmailMessage
from zoneinfo import ZoneInfo

from api.services.db import get_connection
from api.services.google_credential_store import load_google_credential


logger = logging.getLogger(__name__)

GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"
TIMEZONE = ZoneInfo("Asia/Ho_Chi_Minh")
POLL_SECONDS = 60 * 60

_scheduler_started = False
_run_lock = threading.Lock()


def init_google_email_keepalive_tables() -> None:
    with get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS google_email_keepalive_config (
                user_id TEXT PRIMARY KEY,
                target_email TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                schedule_day INTEGER NOT NULL DEFAULT 15,
                schedule_hour INTEGER NOT NULL DEFAULT 9,
                last_run_month TEXT NOT NULL DEFAULT '',
                last_run_at TEXT NOT NULL DEFAULT '',
                last_status TEXT NOT NULL DEFAULT '',
                last_error TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS google_email_keepalive_deliveries (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                month_key TEXT NOT NULL,
                direction_key TEXT NOT NULL,
                sender_email TEXT NOT NULL,
                recipient_email TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                message_id TEXT NOT NULL DEFAULT '',
                error TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, month_key, direction_key)
            );

            CREATE INDEX IF NOT EXISTS idx_google_keepalive_delivery_month
                ON google_email_keepalive_deliveries(user_id, month_key, status);
            """
        )
        delivery_columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(google_email_keepalive_deliveries)").fetchall()
        }
        if "direction_key" not in delivery_columns:
            conn.executescript(
                """
                DROP INDEX IF EXISTS idx_google_keepalive_delivery_month;
                ALTER TABLE google_email_keepalive_deliveries
                    RENAME TO google_email_keepalive_deliveries_legacy;

                CREATE TABLE google_email_keepalive_deliveries (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    month_key TEXT NOT NULL,
                    direction_key TEXT NOT NULL,
                    sender_email TEXT NOT NULL,
                    recipient_email TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    message_id TEXT NOT NULL DEFAULT '',
                    error TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, month_key, direction_key)
                );

                INSERT INTO google_email_keepalive_deliveries
                  (id, user_id, month_key, direction_key, sender_email, recipient_email,
                   status, message_id, error, created_at, updated_at)
                SELECT
                  delivery.id,
                  delivery.user_id,
                  delivery.month_key,
                  CASE
                    WHEN delivery.recipient_email = config.target_email
                      THEN 'to-target:' || delivery.sender_email
                    WHEN delivery.sender_email = config.target_email
                      THEN 'from-target:' || delivery.recipient_email
                    ELSE 'legacy:' || delivery.sender_email || '->' || delivery.recipient_email
                  END,
                  delivery.sender_email,
                  delivery.recipient_email,
                  delivery.status,
                  delivery.message_id,
                  delivery.error,
                  delivery.created_at,
                  delivery.updated_at
                FROM google_email_keepalive_deliveries_legacy AS delivery
                LEFT JOIN google_email_keepalive_config AS config
                  ON config.user_id = delivery.user_id;

                DROP TABLE google_email_keepalive_deliveries_legacy;

                CREATE INDEX idx_google_keepalive_delivery_month
                    ON google_email_keepalive_deliveries(user_id, month_key, status);
                """
            )


def configure_google_email_keepalive(
    user_id: str,
    target_email: str,
    *,
    enabled: bool = True,
    schedule_day: int = 15,
    schedule_hour: int = 9,
) -> dict:
    init_google_email_keepalive_tables()
    target = target_email.strip().lower()
    day = min(28, max(1, int(schedule_day)))
    hour = min(23, max(0, int(schedule_hour)))
    with get_connection() as conn:
        account = conn.execute(
            "SELECT 1 FROM google_accounts WHERE user_id = ? AND lower(email) = ?",
            (user_id, target),
        ).fetchone()
        if not account:
            raise ValueError(f"Email trung tâm chưa được kết nối: {target}")
        conn.execute(
            """
            INSERT INTO google_email_keepalive_config
              (user_id, target_email, enabled, schedule_day, schedule_hour, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
              target_email = excluded.target_email,
              enabled = excluded.enabled,
              schedule_day = excluded.schedule_day,
              schedule_hour = excluded.schedule_hour,
              updated_at = CURRENT_TIMESTAMP
            """,
            (user_id, target, int(enabled), day, hour),
        )
    return get_google_email_keepalive_status(user_id)


def _connected_accounts(user_id: str) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT email, token_path, scopes_json
            FROM google_accounts
            WHERE user_id = ? AND credential_encrypted != ''
            ORDER BY email ASC
            """,
            (user_id,),
        ).fetchall()
    accounts: list[dict] = []
    for row in rows:
        try:
            scopes = json.loads(row["scopes_json"] or "[]")
        except json.JSONDecodeError:
            scopes = []
        if GMAIL_SEND_SCOPE not in scopes:
            continue
        accounts.append(
            {
                "email": row["email"].strip().lower(),
                "token_path": row["token_path"],
                "scopes": scopes,
            }
        )
    return accounts


def _message_pairs(accounts: list[dict], target_email: str) -> list[tuple[str, str, str]]:
    emails = {account["email"] for account in accounts}
    if target_email not in emails:
        return []
    ordered_emails = sorted(emails)
    return [(email, target_email, f"to-target:{email}") for email in ordered_emails] + [
        (target_email, email, f"from-target:{email}") for email in ordered_emails
    ]


def _next_run_at(config: dict, now: datetime | None = None) -> str:
    now = now or datetime.now(TIMEZONE)
    day = int(config["schedule_day"])
    hour = int(config["schedule_hour"])
    current_month = now.strftime("%Y-%m")
    this_run = now.replace(day=min(day, calendar.monthrange(now.year, now.month)[1]), hour=hour, minute=0, second=0, microsecond=0)
    if config["last_run_month"] != current_month and now < this_run:
        return this_run.isoformat()
    year = now.year + (1 if now.month == 12 else 0)
    month = 1 if now.month == 12 else now.month + 1
    next_day = min(day, calendar.monthrange(year, month)[1])
    return datetime(year, month, next_day, hour, tzinfo=TIMEZONE).isoformat()


def get_google_email_keepalive_status(user_id: str) -> dict | None:
    init_google_email_keepalive_tables()
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM google_email_keepalive_config WHERE user_id = ?",
            (user_id,),
        ).fetchone()
    if not row:
        return None
    config = dict(row)
    accounts = _connected_accounts(user_id)
    pairs = _message_pairs(accounts, config["target_email"])
    return {
        "enabled": bool(config["enabled"]),
        "targetEmail": config["target_email"],
        "scheduleDay": config["schedule_day"],
        "scheduleHour": config["schedule_hour"],
        "accountCount": len(accounts),
        "messageCount": len(pairs),
        "lastRunMonth": config["last_run_month"],
        "lastRunAt": config["last_run_at"],
        "lastStatus": config["last_status"],
        "lastError": config["last_error"],
        "nextRunAt": _next_run_at(config),
    }


def _gmail_service(account: dict):
    try:
        from google.auth.transport.requests import Request as GoogleRequest
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
    except ImportError as exc:
        raise RuntimeError(f"Google API libraries are not installed: {exc}") from exc

    payload = load_google_credential(account["token_path"])
    if not payload.get("refresh_token"):
        raise RuntimeError(f"Credential không có refresh token: {account['email']}")
    credentials = Credentials.from_authorized_user_info(payload, account["scopes"])
    if credentials.expired:
        credentials.refresh(GoogleRequest())
    return build("gmail", "v1", credentials=credentials, cache_discovery=False)


def _send_message(
    service,
    sender_email: str,
    recipient_email: str,
    month_key: str,
    direction_key: str,
) -> str:
    year, month = month_key.split("-", 1)
    direction_label = "gửi tới email trung tâm" if direction_key.startswith("to-target:") else "email trung tâm gửi ngược lại"
    message = EmailMessage()
    message["From"] = sender_email
    message["To"] = recipient_email
    message["Subject"] = f"Duy trì hoạt động Gmail tháng {month}/{year} - {direction_label}"
    message.set_content(
        "Đây là email tự động hàng tháng để duy trì hoạt động giữa các tài khoản Gmail "
        f"đã kết nối với HAgent.\n\nTừ: {sender_email}\nĐến: {recipient_email}\n"
        f"Chiều: {direction_label}\nTháng: {month_key}\n"
    )
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii")
    result = service.users().messages().send(userId="me", body={"raw": raw}).execute()
    return str(result.get("id") or "")


def _set_delivery(
    user_id: str,
    month_key: str,
    direction_key: str,
    sender_email: str,
    recipient_email: str,
    *,
    status: str,
    message_id: str = "",
    error: str = "",
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO google_email_keepalive_deliveries
              (id, user_id, month_key, direction_key, sender_email, recipient_email,
               status, message_id, error, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, month_key, direction_key) DO UPDATE SET
              status = excluded.status,
              message_id = excluded.message_id,
              error = excluded.error,
              updated_at = CURRENT_TIMESTAMP
            """,
            (
                str(uuid.uuid4()),
                user_id,
                month_key,
                direction_key,
                sender_email,
                recipient_email,
                status,
                message_id,
                error[:2000],
            ),
        )


def run_google_email_keepalive(user_id: str, month_key: str | None = None) -> dict:
    """Send any missing directions for one user's monthly Gmail activity cycle."""
    init_google_email_keepalive_tables()
    with _run_lock:
        with get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM google_email_keepalive_config WHERE user_id = ? AND enabled = 1",
                (user_id,),
            ).fetchone()
        if not row:
            return {"status": "disabled", "sent": 0, "failed": 0, "skipped": 0}

        config = dict(row)
        month_key = month_key or datetime.now(TIMEZONE).strftime("%Y-%m")
        accounts = _connected_accounts(user_id)
        account_map = {account["email"]: account for account in accounts}
        pairs = _message_pairs(accounts, config["target_email"])
        if not pairs:
            error = "Email trung tâm chưa kết nối hoặc không có quyền gmail.send"
            _update_config_result(user_id, status="error", error=error)
            return {"status": "error", "sent": 0, "failed": 0, "skipped": 0, "error": error}

        with get_connection() as conn:
            sent_rows = conn.execute(
                """
                SELECT direction_key
                FROM google_email_keepalive_deliveries
                WHERE user_id = ? AND month_key = ? AND status = 'sent'
                """,
                (user_id, month_key),
            ).fetchall()
        already_sent = {row["direction_key"] for row in sent_rows}
        services: dict[str, object] = {}
        sent = 0
        failed = 0
        skipped = 0
        errors: list[str] = []

        for sender_email, recipient_email, direction_key in pairs:
            if direction_key in already_sent:
                skipped += 1
                continue
            try:
                service = services.get(sender_email)
                if service is None:
                    service = _gmail_service(account_map[sender_email])
                    services[sender_email] = service
                message_id = _send_message(
                    service,
                    sender_email,
                    recipient_email,
                    month_key,
                    direction_key,
                )
                _set_delivery(
                    user_id,
                    month_key,
                    direction_key,
                    sender_email,
                    recipient_email,
                    status="sent",
                    message_id=message_id,
                )
                sent += 1
            except Exception as exc:
                error = str(exc)
                errors.append(f"{sender_email} -> {recipient_email}: {error}")
                _set_delivery(
                    user_id,
                    month_key,
                    direction_key,
                    sender_email,
                    recipient_email,
                    status="failed",
                    error=error,
                )
                failed += 1

        completed = failed == 0
        status = "success" if completed else "partial"
        _update_config_result(
            user_id,
            status=status,
            error="\n".join(errors)[:4000],
            month_key=month_key if completed else "",
        )
        logger.info(
            "Google email keepalive %s for %s: sent=%d failed=%d skipped=%d",
            status,
            user_id,
            sent,
            failed,
            skipped,
        )
        return {"status": status, "sent": sent, "failed": failed, "skipped": skipped}


def _update_config_result(
    user_id: str,
    *,
    status: str,
    error: str,
    month_key: str = "",
) -> None:
    with get_connection() as conn:
        if month_key:
            conn.execute(
                """
                UPDATE google_email_keepalive_config
                SET last_run_month = ?, last_run_at = CURRENT_TIMESTAMP,
                    last_status = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
                """,
                (month_key, status, error, user_id),
            )
        else:
            conn.execute(
                """
                UPDATE google_email_keepalive_config
                SET last_run_at = CURRENT_TIMESTAMP, last_status = ?,
                    last_error = ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
                """,
                (status, error, user_id),
            )


def run_due_google_email_keepalive_jobs(now: datetime | None = None) -> None:
    init_google_email_keepalive_tables()
    now = now or datetime.now(TIMEZONE)
    month_key = now.strftime("%Y-%m")
    with get_connection() as conn:
        configs = conn.execute(
            "SELECT * FROM google_email_keepalive_config WHERE enabled = 1"
        ).fetchall()
    for row in configs:
        config = dict(row)
        scheduled_at = now.replace(
            day=min(int(config["schedule_day"]), calendar.monthrange(now.year, now.month)[1]),
            hour=int(config["schedule_hour"]),
            minute=0,
            second=0,
            microsecond=0,
        )
        if config["last_run_month"] == month_key or now < scheduled_at:
            continue
        try:
            run_google_email_keepalive(config["user_id"], month_key)
        except Exception:
            logger.exception("Google email keepalive scheduler failed for %s", config["user_id"])


def _scheduler_loop() -> None:
    while True:
        try:
            run_due_google_email_keepalive_jobs()
        except Exception:
            logger.exception("Google email keepalive scheduler tick failed")
        time.sleep(POLL_SECONDS)


def start_google_email_keepalive_scheduler() -> None:
    global _scheduler_started
    if _scheduler_started:
        return
    init_google_email_keepalive_tables()
    _scheduler_started = True
    threading.Thread(
        target=_scheduler_loop,
        name="google-email-keepalive",
        daemon=True,
    ).start()
    logger.info("Google email keepalive scheduler started")
