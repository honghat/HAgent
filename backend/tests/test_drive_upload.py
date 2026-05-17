from __future__ import annotations

import asyncio
import importlib
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _drive_module():
    return importlib.import_module("api.routers.drive")


def test_upload_path_file_is_not_archived(monkeypatch, tmp_path):
    drive = _drive_module()
    source = tmp_path / "note.txt"
    source.write_text("hello", encoding="utf-8")
    calls = []

    async def fake_upload(path, folder_id):
        calls.append((path, folder_id))
        return {"id": "file-1", "name": path.name}

    monkeypatch.setattr(drive, "_upload_local_file", fake_upload)

    result = asyncio.run(drive.upload_path_to_drive(drive.UploadPathRequest(path=str(source), folder_id="parent")))

    assert result["type"] == "file"
    assert result["archived"] is False
    assert result["file"]["name"] == "note.txt"
    assert calls == [(source.resolve(), "parent")]


def test_upload_path_directory_preserves_folder_tree(monkeypatch, tmp_path):
    drive = _drive_module()
    source = tmp_path / "project"
    nested = source / "docs" / "drafts"
    nested.mkdir(parents=True)
    (source / "README.md").write_text("readme", encoding="utf-8")
    (source / "docs" / "guide.md").write_text("guide", encoding="utf-8")
    (nested / "v1.md").write_text("v1", encoding="utf-8")

    created = []
    uploaded = []

    async def fake_resolve(folder_id):
        return folder_id or "root"

    async def fake_create_folder(name, parent):
        item = {"id": f"folder-{len(created) + 1}", "name": name, "parents": [parent]}
        created.append(item)
        return item

    async def fake_upload_file(path, parent):
        item = {"id": f"file-{len(uploaded) + 1}", "name": path.name, "parents": [parent]}
        uploaded.append(item)
        return item

    monkeypatch.setattr(drive, "_resolve_folder_id", fake_resolve)
    monkeypatch.setattr(drive, "_create_drive_folder", fake_create_folder)
    monkeypatch.setattr(drive, "_upload_local_file_to_parent", fake_upload_file)

    result = asyncio.run(drive.upload_path_to_drive(drive.UploadPathRequest(path=str(source), folder_id="parent")))

    assert result["type"] == "folder"
    assert result["archived"] is False
    assert result["folder"]["name"] == "project"
    assert result["folder_count"] == 3
    assert result["file_count"] == 3
    assert [(item["name"], item["parents"][0]) for item in created] == [
        ("project", "parent"),
        ("docs", "folder-1"),
        ("drafts", "folder-2"),
    ]
    assert sorted((item["name"], item["parents"][0]) for item in uploaded) == [
        ("README.md", "folder-1"),
        ("guide.md", "folder-2"),
        ("v1.md", "folder-3"),
    ]
