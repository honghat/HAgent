from __future__ import annotations

import json
import re
from uuid import uuid4

from api.services.db import get_connection


DEFAULT_USER_ID = "hat"
GOAL_STATUSES = {"active", "paused", "completed", "archived"}
TASK_STATUSES = {"pending", "running", "blocked", "done", "skipped"}


def _clip(value: str | None, limit: int) -> str:
    text = " ".join((value or "").split()).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def _safe_priority(value) -> int:
    try:
        priority = int(value)
    except Exception:
        priority = 3
    return max(1, min(priority, 5))


def _safe_status(value: str | None, allowed: set[str], default: str) -> str:
    status = (value or "").strip().lower()
    return status if status in allowed else default


def _json_load(raw: str | None, default):
    try:
        return json.loads(raw or "")
    except Exception:
        return default


def _row_to_goal(row, tasks: list[dict] | None = None) -> dict:
    item = dict(row)
    item["metadata"] = _json_load(item.pop("metadata_json", None), {})
    item["tasks"] = tasks if tasks is not None else []
    item["done"] = item["status"] == "completed"
    item["next_action"] = next_action_from_tasks(item["tasks"])
    return item


def _row_to_task(row) -> dict:
    return dict(row)


def _legacy_state_goals() -> list[dict]:
    with get_connection() as conn:
        conn.row_factory = None
        conn.execute("CREATE TABLE IF NOT EXISTS state_meta (key TEXT PRIMARY KEY, value TEXT)")
        row = conn.execute("SELECT value FROM state_meta WHERE key = 'goals'").fetchone()
    if not row:
        return []
    try:
        data = json.loads(row[0] or "[]")
    except Exception:
        return []
    return data if isinstance(data, list) else []


def migrate_legacy_goals(user_id: str = DEFAULT_USER_ID) -> int:
    legacy = _legacy_state_goals()
    if not legacy:
        return 0
    created = 0
    with get_connection() as conn:
        for old in legacy:
            if not isinstance(old, dict):
                continue
            legacy_id = str(old.get("id") or "")
            title = _clip(str(old.get("title") or old.get("goal") or ""), 240)
            if not title:
                continue
            existing = conn.execute(
                "SELECT metadata_json FROM agent_goals WHERE user_id = ? AND source = 'legacy'",
                (user_id,),
            ).fetchall()
            exists = any(_json_load(row["metadata_json"], {}).get("legacy_id") == legacy_id for row in existing)
            if exists:
                continue
            goal_id = str(uuid4())
            status = "completed" if old.get("done") else "active"
            conn.execute(
                """
                INSERT INTO agent_goals
                  (id, user_id, title, description, status, priority, progress, source, metadata_json, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'legacy', ?, CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END)
                """,
                (
                    goal_id,
                    user_id,
                    title,
                    _clip(str(old.get("description") or ""), 1000),
                    status,
                    3,
                    100 if status == "completed" else 0,
                    json.dumps({"legacy_id": legacy_id}, ensure_ascii=False),
                    status,
                ),
            )
            for task in _default_tasks_for_goal(title):
                _insert_task(conn, goal_id, user_id, task)
            created += 1
    return created


def _default_tasks_for_goal(title: str) -> list[dict]:
    title_lower = title.lower()
    if re.search(r"\b(kiếm tiền|money|income|revenue|doanh thu|freelance|bán hàng|kinh doanh)\b", title_lower):
        return _money_tasks_for_goal()
    tasks = [
        {"title": "Làm rõ kết quả mong muốn", "detail": "Xác định output cuối cùng, phạm vi, ràng buộc và tiêu chí hoàn thành.", "priority": 1},
        {"title": "Thu thập ngữ cảnh cần thiết", "detail": "Đọc dữ liệu/code/tài liệu/log liên quan trước khi hành động.", "priority": 2},
        {"title": "Thực hiện bước chính", "detail": "Triển khai hoặc xử lý phần cốt lõi của mục tiêu.", "priority": 3},
        {"title": "Kiểm chứng bằng bằng chứng thật", "detail": "Chạy test, kiểm tra API, build, log hoặc output thực tế phù hợp với mục tiêu.", "priority": 4},
        {"title": "Báo cáo kết quả và việc còn lại", "detail": "Tóm tắt thay đổi, bằng chứng kiểm chứng, rủi ro và bước kế tiếp.", "priority": 5},
    ]
    if re.search(r"\b(code|bug|fix|sửa|lỗi|build|test|deploy|git)\b", title_lower):
        tasks.insert(2, {"title": "Xác định file/module chịu ảnh hưởng", "detail": "Khoanh vùng đúng nơi cần sửa, tránh refactor ngoài phạm vi.", "priority": 2})
    if re.search(r"\b(học|learn|cải thiện|tự động|agent|memory|wiki)\b", title_lower):
        tasks.insert(3, {"title": "Ghi lại bài học tái sử dụng", "detail": "Lưu lesson phù hợp vào self-evolution, memory, wiki hoặc skill.", "priority": 4})
    return tasks


def _money_tasks_for_goal() -> list[dict]:
    return [
        {
            "title": "Chọn 3 hướng kiếm tiền khả thi ngay",
            "detail": "Liệt kê 3 hướng dựa trên tài sản hiện có: kỹ năng, thời gian, công cụ, mạng lưới, vốn và mức rủi ro.",
            "priority": 1,
        },
        {
            "title": "Chọn một hướng thử trong 24 giờ",
            "detail": "Ưu tiên hướng có thể tạo offer nhanh, ít vốn, có khách hàng tiếp cận được ngay.",
            "priority": 2,
        },
        {
            "title": "Tạo offer đầu tiên",
            "detail": "Viết gói dịch vụ/sản phẩm rõ: bán cho ai, giải quyết vấn đề gì, giá thử nghiệm, kết quả cam kết.",
            "priority": 3,
        },
        {
            "title": "Lập danh sách 20 khách hàng hoặc kênh tiếp cận",
            "detail": "Tạo danh sách lead/kênh đăng bài/kênh outreach phù hợp với offer đã chọn.",
            "priority": 4,
        },
        {
            "title": "Soạn nội dung chào bán",
            "detail": "Chuẩn bị tin nhắn, bài đăng, landing copy hoặc kịch bản gọi để thử bán.",
            "priority": 5,
        },
        {
            "title": "Chạy thử bán hàng và ghi kết quả",
            "detail": "Gửi/đăng thử, ghi số người tiếp cận, phản hồi, cuộc hẹn, đơn hàng hoặc lý do từ chối.",
            "priority": 6,
        },
        {
            "title": "Tối ưu vòng tiếp theo",
            "detail": "Dựa trên phản hồi thật để sửa offer, giá, tệp khách hàng hoặc kênh tiếp cận.",
            "priority": 7,
        },
    ]


def _insert_task(conn, goal_id: str, user_id: str, task: dict) -> str:
    task_id = str(uuid4())
    conn.execute(
        """
        INSERT INTO goal_tasks (id, goal_id, user_id, title, detail, status, priority)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            task_id,
            goal_id,
            user_id,
            _clip(str(task.get("title") or ""), 240),
            _clip(str(task.get("detail") or ""), 1500),
            _safe_status(task.get("status"), TASK_STATUSES, "pending"),
            _safe_priority(task.get("priority")),
        ),
    )
    return task_id


def list_tasks(goal_id: str, user_id: str) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM goal_tasks
            WHERE goal_id = ? AND user_id = ?
            ORDER BY
              CASE status
                WHEN 'running' THEN 0
                WHEN 'pending' THEN 1
                WHEN 'blocked' THEN 2
                WHEN 'done' THEN 3
                ELSE 4
              END,
              priority ASC,
              created_at ASC
            """,
            (goal_id, user_id),
        ).fetchall()
    return [_row_to_task(row) for row in rows]


def next_action_from_tasks(tasks: list[dict]) -> str:
    for status in ("running", "pending", "blocked"):
        for task in tasks:
            if task.get("status") == status:
                return task.get("title") or ""
    return ""


def recompute_goal_progress(goal_id: str, user_id: str) -> None:
    tasks = list_tasks(goal_id, user_id)
    if not tasks:
        progress = 0
        status = "active"
    else:
        done_count = sum(1 for task in tasks if task["status"] in {"done", "skipped"})
        progress = round(done_count * 100 / len(tasks))
        status = "completed" if progress == 100 else "active"
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE agent_goals
            SET progress = ?, status = CASE WHEN status = 'archived' THEN status ELSE ? END,
                completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE completed_at END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
            """,
            (progress, status, status, goal_id, user_id),
        )


def create_goal(
    user_id: str,
    title: str,
    description: str = "",
    priority: int = 3,
    deadline: str | None = None,
    tasks: list[dict] | None = None,
    source: str = "manual",
) -> dict:
    goal_title = _clip(title, 240)
    if not goal_title:
        raise ValueError("Goal title is required")
    goal_id = str(uuid4())
    task_items = tasks if tasks else _default_tasks_for_goal(goal_title)
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO agent_goals
              (id, user_id, title, description, status, priority, deadline, source, metadata_json)
            VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)
            """,
            (
                goal_id,
                user_id,
                goal_title,
                _clip(description, 1500),
                _safe_priority(priority),
                _clip(deadline, 80) or None,
                source,
                json.dumps({}, ensure_ascii=False),
            ),
        )
        for task in task_items:
            if task.get("title"):
                _insert_task(conn, goal_id, user_id, task)
    recompute_goal_progress(goal_id, user_id)
    return get_goal(goal_id, user_id) or {}


def list_goals(user_id: str, include_archived: bool = False) -> list[dict]:
    migrate_legacy_goals(user_id)
    clauses = ["user_id = ?"]
    params: list = [user_id]
    if not include_archived:
        clauses.append("status != 'archived'")
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT * FROM agent_goals
            WHERE {' AND '.join(clauses)}
            ORDER BY
              CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
              priority ASC,
              updated_at DESC
            """,
            params,
        ).fetchall()
    goals = []
    for row in rows:
        tasks = list_tasks(row["id"], user_id)
        goals.append(_row_to_goal(row, tasks))
    return goals


def get_goal(goal_id: str, user_id: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM agent_goals WHERE id = ? AND user_id = ?", (goal_id, user_id)).fetchone()
    if not row:
        return None
    return _row_to_goal(row, list_tasks(goal_id, user_id))


def update_goal(goal_id: str, user_id: str, updates: dict) -> dict | None:
    allowed = {"title", "description", "status", "priority", "deadline"}
    fields, params = [], []
    for key, value in updates.items():
        if key not in allowed:
            continue
        if key == "status":
            value = _safe_status(value, GOAL_STATUSES, "active")
        elif key == "priority":
            value = _safe_priority(value)
        elif key in {"title", "description"}:
            value = _clip(str(value or ""), 240 if key == "title" else 1500)
        fields.append(f"{key} = ?")
        params.append(value)
    if not fields:
        return get_goal(goal_id, user_id)
    fields.append("updated_at = CURRENT_TIMESTAMP")
    if updates.get("status") == "completed":
        fields.append("completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)")
        fields.append("progress = 100")
    if updates.get("status") == "archived":
        fields.append("archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP)")
    params.extend([goal_id, user_id])
    with get_connection() as conn:
        conn.execute(f"UPDATE agent_goals SET {', '.join(fields)} WHERE id = ? AND user_id = ?", params)
    return get_goal(goal_id, user_id)


def add_task(goal_id: str, user_id: str, title: str, detail: str = "", priority: int = 3) -> dict | None:
    if not get_goal(goal_id, user_id):
        return None
    with get_connection() as conn:
        task_id = _insert_task(conn, goal_id, user_id, {"title": title, "detail": detail, "priority": priority})
    recompute_goal_progress(goal_id, user_id)
    return get_task(task_id, user_id)


def replan_goal(goal_id: str, user_id: str, tasks: list[dict] | None = None) -> dict | None:
    goal = get_goal(goal_id, user_id)
    if not goal:
        return None
    next_tasks = tasks if tasks else _default_tasks_for_goal(goal["title"])
    with get_connection() as conn:
        conn.execute("DELETE FROM goal_tasks WHERE goal_id = ? AND user_id = ?", (goal_id, user_id))
        for task in next_tasks:
            if task.get("title"):
                _insert_task(conn, goal_id, user_id, task)
        conn.execute(
            """
            UPDATE agent_goals
            SET status = 'active', progress = 0, completed_at = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
            """,
            (goal_id, user_id),
        )
    return get_goal(goal_id, user_id)


def get_task(task_id: str, user_id: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM goal_tasks WHERE id = ? AND user_id = ?", (task_id, user_id)).fetchone()
    return _row_to_task(row) if row else None


def update_task(goal_id: str, task_id: str, user_id: str, updates: dict) -> dict | None:
    allowed = {"title", "detail", "status", "priority", "evidence", "result"}
    fields, params = [], []
    for key, value in updates.items():
        if key not in allowed:
            continue
        if key == "status":
            value = _safe_status(value, TASK_STATUSES, "pending")
            if value == "running":
                fields.append("last_attempt_at = CURRENT_TIMESTAMP")
            if value in {"done", "skipped"}:
                fields.append("completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)")
        elif key == "priority":
            value = _safe_priority(value)
        elif key in {"title", "detail", "evidence", "result"}:
            value = _clip(str(value or ""), 240 if key == "title" else 2000)
        fields.append(f"{key} = ?")
        params.append(value)
    if not fields:
        return get_task(task_id, user_id)
    fields.append("updated_at = CURRENT_TIMESTAMP")
    params.extend([goal_id, task_id, user_id])
    with get_connection() as conn:
        conn.execute(
            f"UPDATE goal_tasks SET {', '.join(fields)} WHERE goal_id = ? AND id = ? AND user_id = ?",
            params,
        )
    recompute_goal_progress(goal_id, user_id)
    return get_task(task_id, user_id)


def resume_goal(user_id: str, goal_id: str | None = None) -> dict | None:
    goals = [get_goal(goal_id, user_id)] if goal_id else list_goals(user_id)
    goals = [goal for goal in goals if goal and goal["status"] in {"active", "paused"}]
    if not goals:
        return None
    goal = sorted(goals, key=lambda item: (item["priority"], -int(item.get("progress") or 0)))[0]
    next_task = next((task for task in goal["tasks"] if task["status"] == "running"), None)
    next_task = next_task or next((task for task in goal["tasks"] if task["status"] == "pending"), None)
    next_task = next_task or next((task for task in goal["tasks"] if task["status"] == "blocked"), None)
    if next_task and next_task["status"] == "pending":
        next_task = update_task(goal["id"], next_task["id"], user_id, {"status": "running"}) or next_task
        goal = get_goal(goal["id"], user_id) or goal
    next_action = next_task.get("title") if next_task else goal.get("next_action") or ""
    execution_prompt = ""
    if next_action:
        execution_prompt = f"Tiếp tục goal '{goal['title']}'. Hãy thực hiện task đang chạy: {next_action}"
    return {
        "ok": True,
        "goal": goal,
        "next_task": next_task,
        "next_action": next_action,
        "execution_prompt": execution_prompt,
    }


def clear_goals(user_id: str) -> dict:
    with get_connection() as conn:
        conn.execute("DELETE FROM goal_tasks WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM agent_goals WHERE user_id = ?", (user_id,))
        conn.execute("CREATE TABLE IF NOT EXISTS state_meta (key TEXT PRIMARY KEY, value TEXT)")
        conn.execute("INSERT OR REPLACE INTO state_meta (key, value) VALUES ('goals', '[]')")
    return {"ok": True}
