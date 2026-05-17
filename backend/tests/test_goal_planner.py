from __future__ import annotations

import importlib
import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _reload_goal_planner(monkeypatch, tmp_path):
    monkeypatch.setenv("HAGENT_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("HAGENT_HOME", str(tmp_path / "home"))
    for name in ["api.services.db", "api.services.goal_planner"]:
        sys.modules.pop(name, None)
    db = importlib.import_module("api.services.db")
    db.init_db()
    planner = importlib.import_module("api.services.goal_planner")
    return db, planner


def test_create_goal_generates_tasks_and_resume(monkeypatch, tmp_path):
    _, planner = _reload_goal_planner(monkeypatch, tmp_path)

    goal = planner.create_goal("hat", "Cải thiện agent tự học", priority=2)
    resumed = planner.resume_goal("hat")

    assert goal["status"] == "active"
    assert goal["tasks"]
    assert any(task["title"] == "Ghi lại bài học tái sử dụng" for task in goal["tasks"])
    assert resumed["goal"]["id"] == goal["id"]
    assert resumed["next_task"]["status"] == "running"


def test_money_goal_uses_actionable_template_and_resume_starts_task(monkeypatch, tmp_path):
    _, planner = _reload_goal_planner(monkeypatch, tmp_path)

    goal = planner.create_goal("hat", "Kiếm tiền", priority=1)
    resumed = planner.resume_goal("hat", goal["id"])
    refreshed = planner.get_goal(goal["id"], "hat")

    titles = [task["title"] for task in goal["tasks"]]
    assert "Làm rõ kết quả mong muốn" not in titles
    assert titles[0] == "Chọn 3 hướng kiếm tiền khả thi ngay"
    assert resumed["next_task"]["status"] == "running"
    assert refreshed["tasks"][0]["status"] == "running"
    assert "task đang chạy" in resumed["execution_prompt"]


def test_task_completion_recomputes_goal_progress(monkeypatch, tmp_path):
    _, planner = _reload_goal_planner(monkeypatch, tmp_path)
    goal = planner.create_goal(
        "hat",
        "Ship narrow workflow",
        tasks=[
            {"title": "One", "priority": 1},
            {"title": "Two", "priority": 2},
        ],
    )

    planner.update_task(goal["id"], goal["tasks"][0]["id"], "hat", {"status": "done"})
    mid = planner.get_goal(goal["id"], "hat")
    planner.update_task(goal["id"], goal["tasks"][1]["id"], "hat", {"status": "done"})
    done = planner.get_goal(goal["id"], "hat")

    assert mid["progress"] == 50
    assert mid["status"] == "active"
    assert done["progress"] == 100
    assert done["status"] == "completed"


def test_replan_goal_replaces_existing_tasks(monkeypatch, tmp_path):
    _, planner = _reload_goal_planner(monkeypatch, tmp_path)
    goal = planner.create_goal("hat", "Kiếm tiền", tasks=[{"title": "Old generic task"}])

    replanned = planner.replan_goal(goal["id"], "hat")

    assert replanned["progress"] == 0
    assert replanned["tasks"][0]["title"] == "Chọn 3 hướng kiếm tiền khả thi ngay"
    assert all(task["title"] != "Old generic task" for task in replanned["tasks"])


def test_legacy_state_goals_are_migrated_once(monkeypatch, tmp_path):
    db, planner = _reload_goal_planner(monkeypatch, tmp_path)
    with db.get_connection() as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS state_meta (key TEXT PRIMARY KEY, value TEXT)")
        conn.execute(
            "INSERT INTO state_meta (key, value) VALUES ('goals', ?)",
            (json.dumps([{"id": "legacy-1", "title": "Old goal", "done": False}]),),
        )

    first = planner.list_goals("hat")
    second = planner.list_goals("hat")

    migrated = [goal for goal in first if goal["title"] == "Old goal"]
    assert len(migrated) == 1
    assert len([goal for goal in second if goal["title"] == "Old goal"]) == 1
