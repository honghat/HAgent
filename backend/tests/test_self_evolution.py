from __future__ import annotations

import importlib
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _reload_services(monkeypatch, tmp_path):
    monkeypatch.setenv("HAGENT_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("HAGENT_HOME", str(tmp_path / "home"))
    for name in [
        "api.services.db",
        "api.services.wiki_memory",
        "api.services.self_evolution",
    ]:
        sys.modules.pop(name, None)
    db = importlib.import_module("api.services.db")
    db.init_db()
    evolution = importlib.import_module("api.services.self_evolution")
    return db, evolution


def test_feedback_creates_learning_event(monkeypatch, tmp_path):
    db, evolution = _reload_services(monkeypatch, tmp_path)
    with db.get_connection() as conn:
        conn.execute("INSERT INTO chat_sessions (id, user_id, title) VALUES (?, ?, ?)", ("s1", "hat", "Test"))
        conn.execute(
            "INSERT INTO messages (id, session_id, user_id, role, content) VALUES (?, ?, ?, ?, ?)",
            ("m1", "s1", "hat", "assistant", "Tôi đã chạy git push thành công."),
        )

    result = evolution.record_feedback("hat", "s1", "m1", "negative", "Bạn chưa chạy lệnh thật.")

    assert result["ok"] is True
    assert result["event"]["event_type"] == "agent_failure"
    assert result["event"]["status"] == "applied"
    events = evolution.list_events("hat")
    assert len(events) == 1
    assert "chưa đạt" in events[0]["title"]
    assert events[0]["status"] == "applied"


def test_heuristic_reflection_flags_fake_execution(monkeypatch, tmp_path):
    _, evolution = _reload_services(monkeypatch, tmp_path)

    events = evolution.reflect_interaction(
        user_id="hat",
        session_id="s1",
        user_message_id="u1",
        assistant_message_id="a1",
        user_content="Sai rồi, bạn nói mà không làm.",
        assistant_content="Đã xong.",
        provider="missing-provider",
    )

    assert events
    assert any(event["event_type"] == "agent_failure" for event in events)
    assert all(event["status"] == "applied" for event in events)
