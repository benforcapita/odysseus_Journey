"""Owner-scoped, desktop-gated route tests for the Projects surface.

These tests drive the real FastAPI router via TestClient against a temporary
SQLite database, mirroring the proven gallery/cleanup route-test pattern. They
pin the three invariants the design depends on:

  1. Projects routes are desktop-only: without ODYSSEUS_DESKTOP_APP=1 every
     route returns 503 ``projects_requires_desktop_app`` so a browser-served
     request can never partially succeed.
  2. Every Project row is owner-scoped: user A cannot list, read, or modify
     user B's projects (404), and linked-path additions are scoped likewise.
  3. Linked paths persist with their declared kind/mode and round-trip through
     project_to_dict.
"""
import os

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

import core.database as cdb
import routes.project_routes as project_routes
from core.database import Project


def _bind_db(monkeypatch, tmp_path):
    """Create a temp SQLite DB and return a session factory bound to it."""
    engine = create_engine(
        f"sqlite:///{tmp_path / 'projects.db'}",
        connect_args={"check_same_thread": False},
        poolclass=NullPool,
    )
    cdb.Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


def _make_client(monkeypatch, factory, user, *, desktop=True):
    monkeypatch.setattr(project_routes, "SessionLocal", factory)
    if desktop:
        monkeypatch.setenv("ODYSSEUS_DESKTOP_APP", "1")
    else:
        monkeypatch.delenv("ODYSSEUS_DESKTOP_APP", raising=False)

    # Per-app auth: a tiny middleware stamps request.state.current_user so the
    # real get_current_user() resolves the right owner for each client. Two
    # clients share the same routes module, so we cannot monkeypatch a single
    # module-global get_current_user without one user clobbering the other.
    from starlette.middleware.base import BaseHTTPMiddleware

    class _AuthStamp(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            request.state.current_user = user
            return await call_next(request)

    app = FastAPI()
    app.add_middleware(_AuthStamp)
    app.include_router(project_routes.setup_project_routes())
    return TestClient(app)


def test_projects_require_desktop_flag(monkeypatch, tmp_path):
    factory = _bind_db(monkeypatch, tmp_path)
    client = _make_client(monkeypatch, factory, "alice", desktop=False)

    res = client.get("/api/projects")
    assert res.status_code == 503
    assert res.json()["detail"]["error"] == "projects_requires_desktop_app"


def test_pick_folder_uses_desktop_dialog_fallback(monkeypatch, tmp_path):
    factory = _bind_db(monkeypatch, tmp_path)
    picked = tmp_path / "repo"
    picked.mkdir()

    class _Proc:
        returncode = 0
        stdout = str(picked) + "\n"

    monkeypatch.setattr(project_routes.subprocess, "run", lambda *a, **k: _Proc())
    client = _make_client(monkeypatch, factory, "alice")

    res = client.post("/api/projects/pick-folder")
    assert res.status_code == 200
    assert res.json() == {"cancelled": False, "path": os.path.realpath(picked)}


def test_create_list_and_owner_scope_project(monkeypatch, tmp_path):
    factory = _bind_db(monkeypatch, tmp_path)
    root_a = tmp_path / "repo-a"
    root_b = tmp_path / "repo-b"
    root_a.mkdir()
    root_b.mkdir()

    alice = _make_client(monkeypatch, factory, "alice")
    bob = _make_client(monkeypatch, factory, "bob")

    created = alice.post("/api/projects", json={"folder_path": str(root_a)}).json()
    assert created["name"] == "repo-a"
    assert created["folder_path"] == os.path.realpath(root_a)
    assert created["tree"]["root"] == os.path.realpath(root_a)
    assert created["tree"]["truncated"] is False

    listed = alice.get("/api/projects").json()
    assert len(listed) == 1
    assert listed[0]["id"] == created["id"]

    # Bob cannot read Alice's project.
    assert bob.get(f"/api/projects/{created['id']}").status_code == 404

    bob_created = bob.post(
        "/api/projects", json={"folder_path": str(root_b), "name": "mine"}
    ).json()
    assert bob_created["name"] == "mine"
    # Alice cannot read Bob's project.
    assert alice.get(f"/api/projects/{bob_created['id']}").status_code == 404
    # Each owner only lists their own.
    assert len(alice.get("/api/projects").json()) == 1
    assert len(bob.get("/api/projects").json()) == 1


def test_get_project_returns_tree_and_messages(monkeypatch, tmp_path):
    factory = _bind_db(monkeypatch, tmp_path)
    root = tmp_path / "repo"
    (root / "src").mkdir(parents=True)
    (root / "src" / "app.py").write_text("print('hi')\n", encoding="utf-8")
    (root / "README.md").write_text("hello", encoding="utf-8")

    client = _make_client(monkeypatch, factory, "alice")
    project = client.post("/api/projects", json={"folder_path": str(root)}).json()

    detail = client.get(f"/api/projects/{project['id']}").json()
    paths = {entry["path"] for entry in detail["tree"]["entries"]}
    assert "src" in paths
    assert os.path.join("src", "app.py") in paths
    assert "README.md" in paths
    assert detail["messages"] == []

    # Tree endpoint mirrors the embedded tree.
    tree = client.get(f"/api/projects/{project['id']}/tree").json()
    assert tree["root"] == os.path.realpath(root)
    assert {e["path"] for e in tree["entries"]} == paths


def test_linked_path_modes(monkeypatch, tmp_path):
    factory = _bind_db(monkeypatch, tmp_path)
    root = tmp_path / "repo"
    root.mkdir()
    shared = tmp_path / "shared.md"
    shared.write_text("shared", encoding="utf-8")
    linked_dir = tmp_path / "notes"
    linked_dir.mkdir()

    client = _make_client(monkeypatch, factory, "alice")
    project = client.post("/api/projects", json={"folder_path": str(root)}).json()

    res = client.post(
        f"/api/projects/{project['id']}/linked",
        json={"path": str(shared), "kind": "file", "mode": "ro"},
    )
    assert res.status_code == 200
    links = res.json()["linked_paths"]
    assert links[-1]["mode"] == "ro"
    assert links[-1]["kind"] == "file"
    assert links[-1]["path"] == os.path.realpath(shared)

    res = client.post(
        f"/api/projects/{project['id']}/linked",
        json={"path": str(linked_dir), "kind": "folder", "mode": "rw"},
    )
    assert res.status_code == 200
    links = res.json()["linked_paths"]
    assert links[-1]["mode"] == "rw"
    assert links[-1]["kind"] == "folder"


def test_linked_path_rejects_invalid_kind_and_mode(monkeypatch, tmp_path):
    factory = _bind_db(monkeypatch, tmp_path)
    root = tmp_path / "repo"
    root.mkdir()
    shared = tmp_path / "shared.md"
    shared.write_text("shared", encoding="utf-8")

    client = _make_client(monkeypatch, factory, "alice")
    project = client.post("/api/projects", json={"folder_path": str(root)}).json()

    assert (
        client.post(
            f"/api/projects/{project['id']}/linked",
            json={"path": str(shared), "kind": "file", "mode": "execute"},
        ).status_code
        == 400
    )
    assert (
        client.post(
            f"/api/projects/{project['id']}/linked",
            json={"path": str(shared), "kind": "symlink", "mode": "ro"},
        ).status_code
        == 400
    )


def test_linked_path_cross_owner_denied(monkeypatch, tmp_path):
    factory = _bind_db(monkeypatch, tmp_path)
    root = tmp_path / "repo"
    root.mkdir()
    shared = tmp_path / "shared.md"
    shared.write_text("shared", encoding="utf-8")

    alice = _make_client(monkeypatch, factory, "alice")
    bob = _make_client(monkeypatch, factory, "bob")
    project = alice.post("/api/projects", json={"folder_path": str(root)}).json()

    assert (
        bob.post(
            f"/api/projects/{project['id']}/linked",
            json={"path": str(shared), "kind": "file", "mode": "ro"},
        ).status_code
        == 404
    )


def test_create_project_rejects_missing_directory(monkeypatch, tmp_path):
    factory = _bind_db(monkeypatch, tmp_path)
    client = _make_client(monkeypatch, factory, "alice")

    res = client.post(
        "/api/projects", json={"folder_path": str(tmp_path / "does-not-exist")}
    )
    assert res.status_code == 400


def test_post_message_requires_content(monkeypatch, tmp_path):
    factory = _bind_db(monkeypatch, tmp_path)
    root = tmp_path / "repo"
    root.mkdir()
    client = _make_client(monkeypatch, factory, "alice")
    project = client.post("/api/projects", json={"folder_path": str(root)}).json()

    assert client.post(f"/api/projects/{project['id']}/messages", json={}).status_code == 400
    assert (
        client.post(
            f"/api/projects/{project['id']}/messages", json={"content": "  "}
        ).status_code
        == 400
    )


def test_post_message_starts_run(monkeypatch, tmp_path):
    factory = _bind_db(monkeypatch, tmp_path)
    root = tmp_path / "repo"
    root.mkdir()
    client = _make_client(monkeypatch, factory, "alice")
    project = client.post("/api/projects", json={"folder_path": str(root)}).json()

    # Stub the agent loop + detached-run manager so no real LLM/subprocess runs.
    import asyncio
    import src.agent_loop as agent_loop_mod
    import src.agent_runs as agent_runs_mod

    async def _fake_stream(*args, **kwargs):
        yield 'data: [DONE]\n\n'
        return

    monkeypatch.setattr(agent_loop_mod, "stream_agent_loop", _fake_stream)
    monkeypatch.setattr(agent_runs_mod, "start", lambda sid, agen: type("R", (), {"task": None})())

    res = client.post(
        f"/api/projects/{project['id']}/messages", json={"content": "hello"}
    )
    assert res.status_code == 200
    assert res.json() == {"status": "started", "project_id": project["id"]}


def test_post_message_and_stop_cross_owner_denied(monkeypatch, tmp_path):
    factory = _bind_db(monkeypatch, tmp_path)
    root = tmp_path / "repo"
    root.mkdir()
    alice = _make_client(monkeypatch, factory, "alice")
    bob = _make_client(monkeypatch, factory, "bob")
    project = alice.post("/api/projects", json={"folder_path": str(root)}).json()

    assert (
        bob.post(
            f"/api/projects/{project['id']}/messages", json={"content": "hi"}
        ).status_code
        == 404
    )
    assert bob.post(f"/api/projects/{project['id']}/stop").status_code == 404
    # Streaming another user's project is also denied before subscribing.
    assert bob.get(f"/api/projects/{project['id']}/stream").status_code == 404


def _seed_pending(project_id, owner, operation, ttl=300):
    from src.project_approval import create_pending
    return create_pending(project_id, owner, operation, ttl_seconds=ttl)


def test_approve_reject_path(monkeypatch, tmp_path):
    factory = _bind_db(monkeypatch, tmp_path)
    root = tmp_path / "repo"
    root.mkdir()
    client = _make_client(monkeypatch, factory, "alice")
    project = client.post("/api/projects", json={"folder_path": str(root)}).json()

    pending = _seed_pending(project["id"], "alice", {
        "tool": "write_file",
        "content": "app.py\nprint('hi')",
        "summary": "write app.py",
    })

    res = client.post(
        f"/api/projects/{project['id']}/approve/{pending['pending_id']}",
        json={"decision": "reject"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "reject"
    # Rejecting must not have written the file.
    assert not (root / "app.py").exists()
    from src.project_approval import get_pending
    assert get_pending(pending["pending_id"], "alice", project["id"]) is None


def test_approve_executes_write(monkeypatch, tmp_path):
    factory = _bind_db(monkeypatch, tmp_path)
    root = tmp_path / "repo"
    root.mkdir()
    client = _make_client(monkeypatch, factory, "alice")
    project = client.post("/api/projects", json={"folder_path": str(root)}).json()

    pending = _seed_pending(project["id"], "alice", {
        "tool": "write_file",
        "content": "app.py\nprint('hi')",
        "summary": "write app.py",
    })

    res = client.post(
        f"/api/projects/{project['id']}/approve/{pending['pending_id']}",
        json={"decision": "approve"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "approve"
    assert body["result"]["exit_code"] == 0
    # The approved write actually executed inside the project sandbox.
    assert (root / "app.py").read_text() == "print('hi')"


def test_approve_cross_owner_denied(monkeypatch, tmp_path):
    factory = _bind_db(monkeypatch, tmp_path)
    root = tmp_path / "repo"
    root.mkdir()
    alice = _make_client(monkeypatch, factory, "alice")
    bob = _make_client(monkeypatch, factory, "bob")
    project = alice.post("/api/projects", json={"folder_path": str(root)}).json()

    pending = _seed_pending(project["id"], "alice", {
        "tool": "write_file",
        "content": "app.py\nx",
        "summary": "write app.py",
    })

    assert (
        bob.post(
            f"/api/projects/{project['id']}/approve/{pending['pending_id']}",
            json={"decision": "approve"},
        ).status_code
        == 404
    )
    # Bob's failed approve must not have executed the write.
    assert not (root / "app.py").exists()


def test_approve_unknown_pending_returns_404(monkeypatch, tmp_path):
    factory = _bind_db(monkeypatch, tmp_path)
    root = tmp_path / "repo"
    root.mkdir()
    client = _make_client(monkeypatch, factory, "alice")
    project = client.post("/api/projects", json={"folder_path": str(root)}).json()

    res = client.post(
        f"/api/projects/{project['id']}/approve/pending-doesnotexist",
        json={"decision": "approve"},
    )
    assert res.status_code == 404


def test_project_chat_does_not_create_normal_chat_session(monkeypatch, tmp_path):
    """A project prompt must never spill into the Chats session list.

    Projects and Chats have separate persistence (ProjectMessage vs Session),
    so posting to /api/projects/<id>/messages must leave the sessions table
    untouched. We stub the agent loop + detached-run manager so no real LLM run
    happens, then assert: one ProjectMessage (the user's prompt) is persisted,
    and zero Session rows exist.
    """
    from core.database import Session as SessionModel, ProjectMessage

    factory = _bind_db(monkeypatch, tmp_path)
    root = tmp_path / "repo"
    root.mkdir()
    client = _make_client(monkeypatch, factory, "alice")
    project = client.post("/api/projects", json={"folder_path": str(root)}).json()

    import src.agent_loop as agent_loop_mod
    import src.agent_runs as agent_runs_mod

    async def _fake_stream(*args, **kwargs):
        yield 'data: [DONE]\n\n'
        return

    monkeypatch.setattr(agent_loop_mod, "stream_agent_loop", _fake_stream)
    monkeypatch.setattr(agent_runs_mod, "start", lambda sid, agen: type("R", (), {"task": None})())

    res = client.post(
        f"/api/projects/{project['id']}/messages", json={"content": "hello"}
    )
    assert res.status_code == 200

    db = factory()
    try:
        assert db.query(SessionModel).count() == 0
        assert db.query(ProjectMessage).filter(ProjectMessage.project_id == project["id"]).count() == 1
    finally:
        db.close()
