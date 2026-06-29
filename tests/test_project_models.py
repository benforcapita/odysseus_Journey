import os
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import core.database as cdb
from core.database import Project, ProjectMessage
from src.projects import (
    canonical_folder,
    get_owned_project,
    project_to_dict,
    project_message_to_dict,
    scrub_project_metadata,
)


def _memory_db(monkeypatch):
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    cdb.Base.metadata.create_all(bind=engine)
    TestSessionLocal = sessionmaker(bind=engine)
    monkeypatch.setattr(cdb, "SessionLocal", TestSessionLocal)
    return TestSessionLocal


def test_project_round_trip_owner_scoped(monkeypatch, tmp_path):
    SessionLocal = _memory_db(monkeypatch)
    root = tmp_path / "demo"
    root.mkdir()
    project = Project(
        id="proj-" + uuid.uuid4().hex[:8],
        owner="alice",
        name="demo",
        folder_path=str(root),
        linked_paths=[],
        model="llama3",
        endpoint_url="http://127.0.0.1:11434/v1",
        auto_approve=False,
    )
    with SessionLocal() as db:
        db.add(project)
        db.commit()
        row = db.query(Project).filter(Project.owner == "alice").one()
        data = project_to_dict(row)

    assert data["name"] == "demo"
    assert data["folder_path"] == os.path.realpath(root)
    assert data["linked_paths"] == []
    assert data["auto_approve"] is False


def test_project_message_metadata_scrub_rejects_hidden_full_snapshots(monkeypatch):
    cleaned = scrub_project_metadata({
        "tool": "write_file",
        "path": "app.py",
        "diff": {"text": "--- a/app.py\n+++ b/app.py\n@@\n-old\n+new", "added": 1, "removed": 1},
        "raw_content": "secret full file",
        "file_snapshot": "secret full file",
        "command": "cat secrets.txt",
        "output": "secret terminal output",
        "status": "approved",
    })
    assert cleaned == {
        "tool": "write_file",
        "path": "app.py",
        "diff": {"text": "--- a/app.py\n+++ b/app.py\n@@\n-old\n+new", "added": 1, "removed": 1},
        "status": "approved",
    }

    SessionLocal = _memory_db(monkeypatch)
    project = Project(
        id="project-1",
        owner="alice",
        name="demo",
        folder_path="/tmp/demo",
        linked_paths=[],
    )
    msg = ProjectMessage(
        id="msg-" + uuid.uuid4().hex[:8],
        project_id="project-1",
        owner="alice",
        role="tool",
        content="Edited app.py",
        meta_data=cleaned,
    )
    with SessionLocal() as db:
        db.add(project)
        db.add(msg)
        db.commit()
        row = db.query(ProjectMessage).filter(ProjectMessage.owner == "alice").one()
        data = project_message_to_dict(row)

    assert data["metadata"]["diff"]["added"] == 1
    assert "raw_content" not in data["metadata"]
    assert "file_snapshot" not in data["metadata"]
    assert "command" not in data["metadata"]
    assert "output" not in data["metadata"]


@pytest.mark.parametrize("blank_path", ["", "   ", "\t\n"])
def test_canonical_folder_rejects_blank_paths(blank_path):
    with pytest.raises(HTTPException) as exc_info:
        canonical_folder(blank_path)
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Project folder must be an existing directory"


def test_get_owned_project_updates_last_opened_for_owner(monkeypatch, tmp_path):
    SessionLocal = _memory_db(monkeypatch)
    root = tmp_path / "demo"
    root.mkdir()
    project = Project(
        id="project-owned",
        owner="alice",
        name="demo",
        folder_path=str(root),
        linked_paths=[],
        archived=False,
    )
    with SessionLocal() as db:
        db.add(project)
        db.commit()

        row = get_owned_project(db, "project-owned", "alice")
        assert row.id == "project-owned"
        assert row.last_opened_at is not None


def test_get_owned_project_cross_owner_raises_404(monkeypatch, tmp_path):
    SessionLocal = _memory_db(monkeypatch)
    root = tmp_path / "demo"
    root.mkdir()
    project = Project(
        id="project-owned",
        owner="alice",
        name="demo",
        folder_path=str(root),
        linked_paths=[],
    )
    with SessionLocal() as db:
        db.add(project)
        db.commit()

        with pytest.raises(HTTPException) as exc_info:
            get_owned_project(db, "project-owned", "bob")
        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Project not found"


def test_get_owned_project_archived_raises_404(monkeypatch, tmp_path):
    SessionLocal = _memory_db(monkeypatch)
    root = tmp_path / "demo"
    root.mkdir()
    project = Project(
        id="project-archived",
        owner="alice",
        name="demo",
        folder_path=str(root),
        linked_paths=[],
        archived=True,
    )
    with SessionLocal() as db:
        db.add(project)
        db.commit()

        with pytest.raises(HTTPException) as exc_info:
            get_owned_project(db, "project-archived", "alice")
        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Project not found"
