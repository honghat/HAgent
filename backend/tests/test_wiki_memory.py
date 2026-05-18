from __future__ import annotations

import importlib
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _reload_wiki(monkeypatch, tmp_path):
    monkeypatch.setenv("HAGENT_DATA_DIR", str(tmp_path))
    for name in ["api.services.db", "api.services.wiki_memory"]:
        sys.modules.pop(name, None)
    db = importlib.import_module("api.services.db")
    db.init_db()
    wiki = importlib.import_module("api.services.wiki_memory")
    return wiki


def test_wiki_search_scores_relevant_title_first(monkeypatch, tmp_path):
    wiki = _reload_wiki(monkeypatch, tmp_path)
    wiki.save_wiki_entry("hat", {
        "title": "Giá vàng DOJI",
        "summary": "Nguồn lấy giá vàng",
        "content": "Giá vàng DOJI lấy từ trang giavang.doji.vn.",
        "topics": ["finance"],
    })
    wiki.save_wiki_entry("hat", {
        "title": "OpenVPN install",
        "summary": "Script VPN",
        "content": "Script tự cài OpenVPN server.",
        "topics": ["networking"],
    })

    results = wiki.search_wiki("hat", "giá vàng hôm nay doji", limit=2)

    assert results
    assert results[0]["title"] == "Giá vàng DOJI"
    assert results[0]["_score"] >= results[-1]["_score"]


def test_wiki_semantic_dedupe_merges_similar_entry(monkeypatch, tmp_path):
    wiki = _reload_wiki(monkeypatch, tmp_path)
    first = wiki.save_wiki_entry("hat", {
        "title": "Browser Tool HAgent",
        "summary": "Cách dùng browser tool",
        "content": "Browser tool trong HAgent hỗ trợ navigate, click, type và snapshot.",
        "topics": ["tools"],
    })
    second = wiki.save_wiki_entry("hat", {
        "title": "HAgent Browser Tool",
        "summary": "Cách dùng browser tool",
        "content": "Browser tool trong HAgent hỗ trợ navigate, click, type, scroll và snapshot.",
        "topics": ["tools"],
    })

    assert first["id"] == second["id"]
    assert second["existing"] is True


def test_wiki_rejects_git_material(monkeypatch, tmp_path):
    wiki = _reload_wiki(monkeypatch, tmp_path)

    result = wiki.save_wiki_entry("hat", {
        "title": "Git status snapshot",
        "summary": "Repo state",
        "content": "On branch main\nChanges not staged:\n  modified: backend/foo.py",
        "topics": ["git"],
    })

    assert result is None
    assert wiki.list_wiki_entries("hat") == []


def test_wiki_git_policy_does_not_block_unrelated_words(monkeypatch, tmp_path):
    wiki = _reload_wiki(monkeypatch, tmp_path)

    result = wiki.save_wiki_entry("hat", {
        "title": "Digital garden",
        "summary": "Personal knowledge structure",
        "content": "A digital garden is a lightweight way to organize notes.",
        "topics": ["knowledge"],
    })

    assert result is not None
