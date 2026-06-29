"""Project message persistence: tool metadata is scrubbed before it lands in the
ProjectMessage row, preserving invariant 3 (no raw tool inputs/outputs/snapshots
in persisted history — only operation records: paths, sizes, diffs, statuses).

The model's JSON column is exposed as the `meta_data` attribute (mapped to the
"metadata" column); these tests use that attribute directly so they reflect what
the routes actually persist.
"""
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import core.database as cdb
from core.database import Project, ProjectMessage
from src.projects import scrub_project_metadata


def _bind_temp_db(monkeypatch):
    # :memory: defaults to StaticPool so all sessions share one in-memory DB;
    # adding NullPool would break that sharing (each session gets its own empty DB).
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    cdb.Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setattr(cdb, "SessionLocal", factory)
    return factory


def _make_project(db, owner="alice", name="repo", folder_path="/tmp/repo"):
    project = Project(
        id="p-" + uuid.uuid4().hex[:8],
        owner=owner,
        name=name,
        folder_path=folder_path,
        linked_paths=[],
    )
    db.add(project)
    db.commit()
    return project


def test_scrub_drops_raw_inputs_before_persist(monkeypatch):
    factory = _bind_temp_db(monkeypatch)
    raw = {
        "tool": "write_file",
        "path": "app.py",
        "diff": {"text": "--- a/app.py\n+++ b/app.py\n", "added": 1, "removed": 1, "file": "app.py"},
        "status": "done",
        "exit_code": 0,
        "raw_content": "the full file body the agent wrote",
        "file_snapshot": "previous full file body",
        "command": "cat secrets.txt",
        "output": "secret terminal output",
    }
    cleaned = scrub_project_metadata(raw)

    db = factory()
    try:
        project = _make_project(db)
        db.add(ProjectMessage(
            id="m-" + uuid.uuid4().hex[:8],
            project_id=project.id,
            owner="alice",
            role="tool",
            content="Edited app.py",
            meta_data=cleaned,
        ))
        db.commit()
        row = db.query(ProjectMessage).filter(ProjectMessage.project_id == project.id).one()
    finally:
        db.close()

    # Operation record is kept; raw inputs/outputs/snapshots are dropped.
    assert row.meta_data["tool"] == "write_file"
    assert row.meta_data["path"] == "app.py"
    assert row.meta_data["status"] == "done"
    assert row.meta_data["exit_code"] == 0
    assert row.meta_data["diff"]["added"] == 1
    assert "raw_content" not in row.meta_data
    assert "file_snapshot" not in row.meta_data
    assert "command" not in row.meta_data
    assert "output" not in row.meta_data


def test_save_project_message_helper_scrubs_and_persists(monkeypatch, tmp_path):
    import routes.project_routes as pr
    factory = _bind_temp_db(monkeypatch)
    monkeypatch.setattr(pr, "SessionLocal", factory)

    db = factory()
    try:
        project = _make_project(db, folder_path=str(tmp_path))
        project_id = project.id
    finally:
        db.close()

    pr.save_project_message(project_id, "alice", "tool", "Edited app.py", {
        "tool": "write_file",
        "path": "app.py",
        "status": "done",
        "raw_content": "should not persist",
    })

    db = factory()
    try:
        row = db.query(ProjectMessage).filter(ProjectMessage.project_id == project_id).one()
    finally:
        db.close()

    assert row.role == "tool"
    assert row.content == "Edited app.py"
    assert row.meta_data["path"] == "app.py"
    assert row.meta_data["status"] == "done"
    assert "raw_content" not in row.meta_data


def test_save_project_message_owner_scoped(monkeypatch, tmp_path):
    """A saved message is stamped with the caller's owner so cross-owner queries
    (filtered by ProjectMessage.owner) never surface another user's tool history."""
    import routes.project_routes as pr
    factory = _bind_temp_db(monkeypatch)
    monkeypatch.setattr(pr, "SessionLocal", factory)

    db = factory()
    try:
        project = _make_project(db, owner="alice", folder_path=str(tmp_path))
        project_id = project.id
    finally:
        db.close()

    pr.save_project_message(project_id, "alice", "tool", "ran bash", {"tool": "bash"})

    db = factory()
    try:
        row = db.query(ProjectMessage).filter(ProjectMessage.project_id == project_id).one()
    finally:
        db.close()
    assert row.owner == "alice"
