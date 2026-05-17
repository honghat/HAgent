from __future__ import annotations

import importlib
import sys
from pathlib import Path

import yaml

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _reload_context(monkeypatch, tmp_path):
    monkeypatch.setenv("HAGENT_HOME", str(tmp_path / "home"))
    sys.modules.pop("api.services.context_compaction", None)
    return importlib.import_module("api.services.context_compaction")


def test_context_compaction_defaults_enable_auto_compact(monkeypatch, tmp_path):
    compaction = _reload_context(monkeypatch, tmp_path)

    status = compaction.get_compaction_status()

    assert status["auto_compacting"] is True
    assert status["engine"] == "compressor"
    assert status["compression"]["threshold"] == 0.5


def test_context_compaction_update_clamps_and_persists(monkeypatch, tmp_path):
    compaction = _reload_context(monkeypatch, tmp_path)

    status = compaction.update_compaction_config({
        "enabled": False,
        "threshold": 0.99,
        "target_ratio": 0.05,
        "protect_last_n": 2,
        "hygiene_hard_message_limit": 9999,
    })
    config_path = Path(status["config_path"])
    saved = yaml.safe_load(config_path.read_text(encoding="utf-8"))

    assert status["auto_compacting"] is False
    assert status["compression"]["threshold"] == 0.95
    assert status["compression"]["target_ratio"] == 0.1
    assert status["compression"]["protect_last_n"] == 4
    assert status["compression"]["hygiene_hard_message_limit"] == 2000
    assert saved["context"]["engine"] == "compressor"
