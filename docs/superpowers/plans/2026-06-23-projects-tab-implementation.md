# Projects Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a macOS desktop-only Projects surface that lets a user choose a folder, chat with the built-in Odysseus agent inside that workspace, review diffs and shell output, and approve mutating actions.

**Architecture:** Reuse the existing Odysseus agent loop, model providers, `agent_runs` streaming, file-tool diff rendering, and owner-scoped auth. Add the smallest new layer around them: project persistence, project path policy, pending approvals, desktop native folder picking, project routes, and a sidebar-native frontend. External Codex/Claude runtimes are not part of v1.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy/SQLite, existing plain ES modules under `static/js/`, existing CSS in `static/style.css`, pywebview in `desktop_main.py`, pytest, Node syntax checks, Playwright/browser verification for UI.

---

## File Structure

- Modify `core/database.py`: add `Project` and `ProjectMessage` SQLAlchemy models, indexes, startup migration helpers, and exports through the existing `src/database.py` re-export path.
- Create `src/projects.py`: small project-domain helpers for serialization, file-tree scanning, owner-scoped lookup, model resolution defaults, and metadata scrubbing.
- Create `src/project_sandbox.py`: path resolution and linked-path enforcement for project file access.
- Create `src/project_approval.py`: in-memory pending approval registry with TTL, operation records, approve/reject helpers, and shell command classification.
- Modify `src/tool_execution.py`: accept `project_policy`, route project file/shell tools through approval/sandbox helpers, and use project-local shell environment.
- Modify `src/agent_loop.py`: accept `project_policy`, append project instructions, pass policy into `execute_tool_block`, and stream `pending_approval` events.
- Create `routes/project_routes.py`: owner-scoped `/api/projects/*` routes for CRUD, file tree, messages, stream, approvals, linked paths, stop, and desktop-required gating.
- Modify `app.py`: include project routes.
- Modify `desktop_main.py`: set desktop mode and expose `NativeBridge.pick_folder`, `pick_file`, and `reveal_in_finder`.
- Create `static/js/projects.js`: Projects UI controller, API calls, SSE handling, approval cards, file tree, and changes pane.
- Modify `static/index.html`: add Projects rail button and Projects view shell.
- Modify `static/app.js`: initialize Projects UI and switch rail/sidebar state without disturbing Chats or Tools.
- Modify `static/style.css`: Projects layout, sidebar rows, approval cards, and changes pane using existing tokens.
- Modify `THREAT_MODEL.md`: document Projects sandbox scope and shell network-egress gap.
- Modify `context/progress-tracker.md`: add one line after each implementation task when the task is complete.

---

### Task 1: Project Persistence

**Files:**
- Modify: `core/database.py`
- Create: `src/projects.py`
- Test: `tests/test_project_models.py`
- Modify after passing: `context/progress-tracker.md`

- [ ] **Step 1: Write failing model and serialization tests**

Create `tests/test_project_models.py`:

```python
import os
import uuid

from core.database import Project, ProjectMessage, SessionLocal
from src.projects import project_to_dict, project_message_to_dict, scrub_project_metadata


def test_project_round_trip_owner_scoped(temp_db, tmp_path):
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


def test_project_message_metadata_scrub_rejects_hidden_full_snapshots(temp_db, tmp_path):
    cleaned = scrub_project_metadata({
        "tool": "write_file",
        "path": "app.py",
        "diff": {"text": "--- a/app.py\n+++ b/app.py\n@@\n-old\n+new", "added": 1, "removed": 1},
        "raw_content": "secret full file",
        "file_snapshot": "secret full file",
        "status": "approved",
    })
    assert cleaned == {
        "tool": "write_file",
        "path": "app.py",
        "diff": {"text": "--- a/app.py\n+++ b/app.py\n@@\n-old\n+new", "added": 1, "removed": 1},
        "status": "approved",
    }

    msg = ProjectMessage(
        id="msg-" + uuid.uuid4().hex[:8],
        project_id="project-1",
        owner="alice",
        role="tool",
        content="Edited app.py",
        metadata=cleaned,
    )
    data = project_message_to_dict(msg)
    assert data["metadata"]["diff"]["added"] == 1
    assert "raw_content" not in data["metadata"]
    assert "file_snapshot" not in data["metadata"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_project_models.py -v`

Expected: FAIL because `Project`, `ProjectMessage`, and `src.projects` do not exist.

- [ ] **Step 3: Add minimal database models and migration**

In `core/database.py`, add imports already available in the file if missing, then add models after `ChatMessage`:

```python
class Project(TimestampMixin, Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, index=True)
    owner = Column(String, nullable=True, index=True)
    name = Column(String, nullable=False)
    folder_path = Column(String, nullable=False)
    linked_paths = Column(JSON, default=list, nullable=False)
    model = Column(String, nullable=True, default="")
    endpoint_url = Column(String, nullable=True, default="")
    endpoint_id = Column(String, nullable=True, default="")
    headers = Column(JSON, default=dict)
    auto_approve = Column(Boolean, default=False, nullable=False)
    last_opened_at = Column(DateTime, nullable=True, default=None)
    archived = Column(Boolean, default=False, nullable=False)

    messages = relationship("ProjectMessage", back_populates="project", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_projects_owner_archived_opened", "owner", "archived", "last_opened_at"),
        Index("ix_projects_owner_name", "owner", "name"),
    )


class ProjectMessage(Base):
    __tablename__ = "project_messages"

    id = Column(String, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    owner = Column(String, nullable=True, index=True)
    role = Column(String, nullable=False)
    content = Column(Text, nullable=False, default="")
    metadata = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow_naive, nullable=False)

    project = relationship("Project", back_populates="messages")

    __table_args__ = (
        Index("ix_project_messages_project_time", "project_id", "created_at"),
        Index("ix_project_messages_owner_project", "owner", "project_id"),
    )
```

Add a migration helper near the existing `_migrate_*` helpers:

```python
def _migrate_add_projects_tables():
    try:
        Base.metadata.create_all(bind=engine, tables=[Project.__table__, ProjectMessage.__table__])
    except Exception as e:
        logger.warning("Projects table migration failed: %s", e)
```

Call `_migrate_add_projects_tables()` inside `init_db()` after `Base.metadata.create_all(bind=engine)`.

- [ ] **Step 4: Add project serialization helpers**

Create `src/projects.py`:

```python
import os
from datetime import datetime
from typing import Any

from fastapi import HTTPException

from core.database import Project, ProjectMessage, SessionLocal, utcnow_naive

_ALLOWED_METADATA_KEYS = {
    "tool",
    "operation",
    "path",
    "paths",
    "status",
    "exit_code",
    "diff",
    "summary",
    "approved",
    "pending_id",
    "command",
    "output",
}


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def canonical_folder(path: str) -> str:
    resolved = os.path.realpath(os.path.expanduser((path or "").strip()))
    if not resolved or not os.path.isdir(resolved):
        raise HTTPException(400, "Project folder must be an existing directory")
    if os.path.dirname(resolved) == resolved:
        raise HTTPException(400, "Filesystem roots cannot be Projects")
    return resolved


def scrub_project_metadata(metadata: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(metadata, dict):
        return {}
    return {k: v for k, v in metadata.items() if k in _ALLOWED_METADATA_KEYS}


def project_to_dict(project: Project) -> dict[str, Any]:
    return {
        "id": project.id,
        "name": project.name,
        "folder_path": os.path.realpath(project.folder_path),
        "folder_name": os.path.basename(os.path.realpath(project.folder_path)),
        "linked_paths": project.linked_paths or [],
        "model": project.model or "",
        "endpoint_url": project.endpoint_url or "",
        "endpoint_id": project.endpoint_id or "",
        "auto_approve": bool(project.auto_approve),
        "created_at": _iso(project.created_at),
        "updated_at": _iso(project.updated_at),
        "last_opened_at": _iso(project.last_opened_at),
    }


def project_message_to_dict(message: ProjectMessage) -> dict[str, Any]:
    return {
        "id": message.id,
        "project_id": message.project_id,
        "role": message.role,
        "content": message.content,
        "metadata": scrub_project_metadata(message.metadata),
        "created_at": _iso(message.created_at),
    }


def get_owned_project(db, project_id: str, owner: str | None) -> Project:
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.owner == owner, Project.archived == False)  # noqa: E712
        .first()
    )
    if not project:
        raise HTTPException(404, "Project not found")
    project.last_opened_at = utcnow_naive()
    return project
```

- [ ] **Step 5: Run tests and compile changed Python**

Run:

```bash
.venv/bin/python -m pytest tests/test_project_models.py -v
python3 -m py_compile core/database.py src/projects.py
git diff --check
```

Expected: all pass.

- [ ] **Step 6: Update progress tracker and commit**

Append one dated line to `context/progress-tracker.md`:

```markdown
- Added Projects persistence models and metadata scrubbing tests.
```

Run:

```bash
git add core/database.py src/projects.py tests/test_project_models.py context/progress-tracker.md
git commit -m "feat(projects): add project persistence models"
```

---

### Task 2: Project Sandbox

**Files:**
- Create: `src/project_sandbox.py`
- Test: `tests/test_project_sandbox.py`
- Modify after passing: `context/progress-tracker.md`

- [ ] **Step 1: Write failing sandbox tests**

Create `tests/test_project_sandbox.py`:

```python
from pathlib import Path

from src.project_sandbox import resolve_and_check


def test_allows_paths_inside_project(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    target = root / "app.py"
    target.write_text("print('hi')", encoding="utf-8")

    resolved, error = resolve_and_check("app.py", str(root), [], "read")
    assert error is None
    assert resolved == str(target.resolve())


def test_blocks_parent_escape(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    outside = tmp_path / "secret.txt"
    outside.write_text("secret", encoding="utf-8")

    resolved, error = resolve_and_check("../secret.txt", str(root), [], "read")
    assert resolved is None
    assert "outside the project sandbox" in error


def test_blocks_symlink_escape(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    outside = tmp_path / "secret.txt"
    outside.write_text("secret", encoding="utf-8")
    (root / "link.txt").symlink_to(outside)

    resolved, error = resolve_and_check("link.txt", str(root), [], "read")
    assert resolved is None
    assert "outside the project sandbox" in error


def test_linked_file_read_only(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    linked = tmp_path / "shared.txt"
    linked.write_text("shared", encoding="utf-8")
    links = [{"path": str(linked), "kind": "file", "mode": "ro"}]

    resolved, error = resolve_and_check(str(linked), str(root), links, "read")
    assert error is None
    assert resolved == str(linked.resolve())

    resolved, error = resolve_and_check(str(linked), str(root), links, "write")
    assert resolved is None
    assert "read-only linked path" in error


def test_linked_folder_read_write(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    shared = tmp_path / "shared"
    shared.mkdir()
    target = shared / "note.md"
    links = [{"path": str(shared), "kind": "folder", "mode": "rw"}]

    resolved, error = resolve_and_check(str(target), str(root), links, "write")
    assert error is None
    assert resolved == str(target.resolve())
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_project_sandbox.py -v`

Expected: FAIL because `src.project_sandbox` does not exist.

- [ ] **Step 3: Implement path resolution**

Create `src/project_sandbox.py`:

```python
import os
from typing import Literal

Mode = Literal["read", "write"]


def _is_under(path: str, root: str) -> bool:
    try:
        return os.path.commonpath([os.path.normcase(path), os.path.normcase(root)]) == os.path.normcase(root)
    except ValueError:
        return False


def _real(path: str) -> str:
    return os.path.realpath(os.path.expanduser(path))


def resolve_and_check(
    path: str,
    project_root: str,
    linked_paths: list[dict],
    mode: Mode,
) -> tuple[str | None, str | None]:
    raw = (path or "").strip()
    if not raw:
        return None, "Path is required"

    root = _real(project_root)
    candidate = raw if os.path.isabs(os.path.expanduser(raw)) else os.path.join(root, raw)
    try:
        resolved = _real(candidate)
    except OSError as exc:
        return None, f"Path '{raw}' could not be resolved: {exc}"

    if resolved == root or _is_under(resolved, root):
        return resolved, None

    for item in linked_paths or []:
        link_path = item.get("path")
        link_kind = item.get("kind")
        link_mode = item.get("mode", "ro")
        if not link_path:
            continue
        link_root = _real(str(link_path))
        allowed = resolved == link_root if link_kind == "file" else (resolved == link_root or _is_under(resolved, link_root))
        if not allowed:
            continue
        if mode == "write" and link_mode != "rw":
            return None, f"Path '{raw}' is a read-only linked path"
        return resolved, None

    return None, f"Path '{raw}' is outside the project sandbox. Ask the user to link it."
```

- [ ] **Step 4: Run tests and compile**

Run:

```bash
.venv/bin/python -m pytest tests/test_project_sandbox.py -v
python3 -m py_compile src/project_sandbox.py
git diff --check
```

Expected: all pass.

- [ ] **Step 5: Update progress tracker and commit**

Append:

```markdown
- Added project sandbox path resolution for project roots and linked paths.
```

Run:

```bash
git add src/project_sandbox.py tests/test_project_sandbox.py context/progress-tracker.md
git commit -m "feat(projects): add project sandbox"
```

---

### Task 3: Project Routes And Native Bridge

**Files:**
- Create: `routes/project_routes.py`
- Modify: `app.py`
- Modify: `desktop_main.py`
- Modify: `src/projects.py`
- Test: `tests/test_project_routes.py`
- Modify after passing: `context/progress-tracker.md`

- [ ] **Step 1: Write failing route tests**

Create `tests/test_project_routes.py`:

```python
import os

from fastapi.testclient import TestClient

from app import app


def _login_as(client: TestClient, username: str):
    client.cookies.set("session_token", f"test-token-{username}")


def test_projects_require_desktop_flag(monkeypatch, temp_db, tmp_path):
    monkeypatch.delenv("ODYSSEUS_DESKTOP_APP", raising=False)
    client = TestClient(app)
    _login_as(client, "alice")

    res = client.get("/api/projects")
    assert res.status_code == 503
    assert res.json()["detail"]["error"] == "projects_requires_desktop_app"


def test_create_list_and_owner_scope_project(monkeypatch, temp_db, tmp_path):
    monkeypatch.setenv("ODYSSEUS_DESKTOP_APP", "1")
    root_a = tmp_path / "repo-a"
    root_b = tmp_path / "repo-b"
    root_a.mkdir()
    root_b.mkdir()

    alice = TestClient(app)
    bob = TestClient(app)
    _login_as(alice, "alice")
    _login_as(bob, "bob")

    created = alice.post("/api/projects", json={"folder_path": str(root_a)}).json()
    assert created["name"] == "repo-a"
    assert created["folder_path"] == os.path.realpath(root_a)

    assert alice.get("/api/projects").json()[0]["id"] == created["id"]
    assert bob.get(f"/api/projects/{created['id']}").status_code == 404

    bob_created = bob.post("/api/projects", json={"folder_path": str(root_b), "name": "mine"}).json()
    assert bob_created["name"] == "mine"
    assert alice.get(f"/api/projects/{bob_created['id']}").status_code == 404


def test_linked_path_modes(monkeypatch, temp_db, tmp_path):
    monkeypatch.setenv("ODYSSEUS_DESKTOP_APP", "1")
    root = tmp_path / "repo"
    root.mkdir()
    shared = tmp_path / "shared.md"
    shared.write_text("shared", encoding="utf-8")

    client = TestClient(app)
    _login_as(client, "alice")
    project = client.post("/api/projects", json={"folder_path": str(root)}).json()

    res = client.post(
        f"/api/projects/{project['id']}/linked",
        json={"path": str(shared), "kind": "file", "mode": "ro"},
    )
    assert res.status_code == 200
    assert res.json()["linked_paths"][0]["mode"] == "ro"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_project_routes.py -v`

Expected: FAIL because project routes are not included.

- [ ] **Step 3: Add desktop bridge**

In `desktop_main.py`, set desktop mode near the existing session TTL setup:

```python
os.environ.setdefault("ODYSSEUS_DESKTOP_APP", "1")
```

Add:

```python
class NativeBridge:
    def pick_folder(self):
        import webview
        paths = webview.windows[0].create_file_dialog(webview.FOLDER_DIALOG)
        if not paths:
            return {"cancelled": True, "path": ""}
        return {"cancelled": False, "path": os.path.realpath(paths[0])}

    def pick_file(self):
        import webview
        paths = webview.windows[0].create_file_dialog(webview.OPEN_DIALOG)
        if not paths:
            return {"cancelled": True, "path": ""}
        return {"cancelled": False, "path": os.path.realpath(paths[0])}

    def reveal_in_finder(self, path: str):
        import subprocess
        resolved = os.path.realpath(os.path.expanduser(path or ""))
        if resolved:
            subprocess.run(["open", "-R", resolved], check=False)
        return {"ok": True}
```

Pass it to `webview.create_window`:

```python
window = webview.create_window(
    "Odysseus", html=_LOADING_HTML, width=980, height=640,
    min_size=(900, 600), text_select=False, js_api=NativeBridge(),
)
```

- [ ] **Step 4: Implement route helpers**

Create `routes/project_routes.py`:

```python
import os
import uuid

from fastapi import APIRouter, HTTPException, Request

from core.database import Project, ProjectMessage, SessionLocal, utcnow_naive
from src.auth_helpers import get_current_user
from src.projects import canonical_folder, get_owned_project, project_message_to_dict, project_to_dict


def _desktop_required():
    if os.environ.get("ODYSSEUS_DESKTOP_APP") != "1":
        raise HTTPException(status_code=503, detail={"error": "projects_requires_desktop_app"})


def _owner(request: Request) -> str | None:
    return get_current_user(request)


def _scan_tree(root: str, limit: int = 2000) -> dict:
    rows = []
    root_real = os.path.realpath(root)
    for dirpath, dirnames, filenames in os.walk(root_real):
        dirnames[:] = [d for d in sorted(dirnames) if d not in {".git", "node_modules", ".venv", "__pycache__"}]
        rel_dir = os.path.relpath(dirpath, root_real)
        for name in sorted(dirnames) + sorted(filenames):
            full = os.path.join(dirpath, name)
            try:
                stat = os.stat(full)
            except OSError:
                continue
            rel = name if rel_dir == "." else os.path.join(rel_dir, name)
            rows.append({"path": rel, "name": name, "kind": "folder" if os.path.isdir(full) else "file", "size": stat.st_size})
            if len(rows) >= limit:
                return {"root": root_real, "entries": rows, "truncated": True}
    return {"root": root_real, "entries": rows, "truncated": False}


def setup_project_routes() -> APIRouter:
    router = APIRouter(prefix="/api/projects", tags=["projects"])

    @router.get("")
    def list_projects(request: Request):
        _desktop_required()
        owner = _owner(request)
        with SessionLocal() as db:
            rows = (
                db.query(Project)
                .filter(Project.owner == owner, Project.archived == False)  # noqa: E712
                .order_by(Project.last_opened_at.desc().nullslast(), Project.updated_at.desc())
                .all()
            )
            return [project_to_dict(p) for p in rows]

    @router.post("")
    async def create_project(request: Request):
        _desktop_required()
        owner = _owner(request)
        payload = await request.json()
        folder = canonical_folder(str(payload.get("folder_path", "")))
        name = (payload.get("name") or os.path.basename(folder) or "Project").strip()[:120]
        project = Project(
            id="project-" + uuid.uuid4().hex[:12],
            owner=owner,
            name=name,
            folder_path=folder,
            linked_paths=[],
            model=str(payload.get("model") or ""),
            endpoint_url=str(payload.get("endpoint_url") or ""),
            endpoint_id=str(payload.get("endpoint_id") or ""),
            headers={},
            auto_approve=False,
            last_opened_at=utcnow_naive(),
        )
        with SessionLocal() as db:
            db.add(project)
            db.commit()
            db.refresh(project)
            data = project_to_dict(project)
        data["tree"] = _scan_tree(folder)
        return data

    @router.get("/{project_id}")
    def get_project(project_id: str, request: Request):
        _desktop_required()
        with SessionLocal() as db:
            project = get_owned_project(db, project_id, _owner(request))
            db.commit()
            data = project_to_dict(project)
            data["tree"] = _scan_tree(project.folder_path)
            data["messages"] = [
                project_message_to_dict(m)
                for m in db.query(ProjectMessage).filter(ProjectMessage.project_id == project.id).order_by(ProjectMessage.created_at).all()
            ]
            return data

    @router.get("/{project_id}/tree")
    def project_tree(project_id: str, request: Request):
        _desktop_required()
        with SessionLocal() as db:
            project = get_owned_project(db, project_id, _owner(request))
            return _scan_tree(project.folder_path)

    @router.post("/{project_id}/linked")
    async def add_linked_path(project_id: str, request: Request):
        _desktop_required()
        payload = await request.json()
        path = canonical_folder(payload["path"]) if payload.get("kind") == "folder" else os.path.realpath(os.path.expanduser(str(payload.get("path", ""))))
        if payload.get("kind") == "file" and not os.path.isfile(path):
            raise HTTPException(400, "Linked file must exist")
        mode = payload.get("mode")
        if mode not in {"ro", "rw"}:
            raise HTTPException(400, "mode must be ro or rw")
        kind = payload.get("kind")
        if kind not in {"file", "folder"}:
            raise HTTPException(400, "kind must be file or folder")
        with SessionLocal() as db:
            project = get_owned_project(db, project_id, _owner(request))
            links = list(project.linked_paths or [])
            links.append({"path": path, "kind": kind, "mode": mode})
            project.linked_paths = links
            db.commit()
            db.refresh(project)
            return project_to_dict(project)

    return router
```

- [ ] **Step 5: Include routes in `app.py`**

Add near the other route setup:

```python
from routes.project_routes import setup_project_routes
app.include_router(setup_project_routes())
```

- [ ] **Step 6: Run tests and compile**

Run:

```bash
.venv/bin/python -m pytest tests/test_project_routes.py -v
python3 -m py_compile routes/project_routes.py desktop_main.py app.py src/projects.py
git diff --check
```

Expected: all pass.

- [ ] **Step 7: Update progress tracker and commit**

Append:

```markdown
- Added desktop-gated Projects routes and native folder/file bridge.
```

Run:

```bash
git add routes/project_routes.py app.py desktop_main.py src/projects.py tests/test_project_routes.py context/progress-tracker.md
git commit -m "feat(projects): add routes and native bridge"
```

---

### Task 4: Pending Approvals And Shell Classification

**Files:**
- Create: `src/project_approval.py`
- Modify: `src/tool_execution.py`
- Test: `tests/test_project_approval.py`
- Test: `tests/test_shell_classifier.py`
- Modify after passing: `context/progress-tracker.md`

- [ ] **Step 1: Write failing approval and classifier tests**

Create `tests/test_shell_classifier.py`:

```python
import pytest

from src.project_approval import classify_shell_command


@pytest.mark.parametrize("cmd", ["ls", "git status", "npm test", "cat app.py", "echo hi > note.txt"])
def test_static_shell_commands(cmd):
    result = classify_shell_command(cmd)
    assert result.static is True
    assert result.reason == ""


@pytest.mark.parametrize("cmd", ["eval $X", "cat `pwd`", "echo $(whoami)", "source .env", ". .env", "exec bash", "env TOKEN=$(cat x) npm test"])
def test_non_static_shell_commands(cmd):
    result = classify_shell_command(cmd)
    assert result.static is False
    assert result.reason
```

Create `tests/test_project_approval.py`:

```python
import time

from src.project_approval import create_pending, get_pending, resolve_pending


def test_pending_approval_lifecycle():
    pending = create_pending(
        project_id="p1",
        owner="alice",
        operation={"tool": "write_file", "path": "app.py", "summary": "Write app.py"},
        ttl_seconds=60,
    )
    loaded = get_pending(pending["pending_id"], owner="alice", project_id="p1")
    assert loaded["operation"]["path"] == "app.py"

    resolved = resolve_pending(pending["pending_id"], owner="alice", project_id="p1", decision="approve")
    assert resolved["decision"] == "approve"
    assert get_pending(pending["pending_id"], owner="alice", project_id="p1") is None


def test_pending_approval_owner_scoped():
    pending = create_pending("p1", "alice", {"tool": "bash"}, ttl_seconds=60)
    assert get_pending(pending["pending_id"], owner="bob", project_id="p1") is None


def test_pending_approval_expiry():
    pending = create_pending("p1", "alice", {"tool": "bash"}, ttl_seconds=-1)
    time.sleep(0.01)
    assert get_pending(pending["pending_id"], owner="alice", project_id="p1") is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_project_approval.py tests/test_shell_classifier.py -v`

Expected: FAIL because `src.project_approval` does not exist.

- [ ] **Step 3: Implement approval registry and classifier**

Create `src/project_approval.py`:

```python
from __future__ import annotations

import shlex
import time
import uuid
from dataclasses import dataclass
from typing import Any

_PENDING: dict[str, dict[str, Any]] = {}

_NON_STATIC_WORDS = {"eval", "source", ".", "exec"}
_NON_STATIC_MARKERS = ("`", "$(", "${")


@dataclass(frozen=True)
class ShellClassification:
    static: bool
    reason: str = ""
    tokens: tuple[str, ...] = ()


def classify_shell_command(command: str) -> ShellClassification:
    raw = command or ""
    if any(marker in raw for marker in _NON_STATIC_MARKERS):
        return ShellClassification(False, "command contains shell expansion")
    try:
        tokens = tuple(shlex.split(raw, posix=True))
    except ValueError as exc:
        return ShellClassification(False, f"command could not be parsed: {exc}")
    if any(token in _NON_STATIC_WORDS for token in tokens):
        return ShellClassification(False, "command uses dynamic shell control")
    return ShellClassification(True, "", tokens)


def _purge_expired(now: float | None = None) -> None:
    current = time.time() if now is None else now
    for pending_id, row in list(_PENDING.items()):
        if row["expires_at"] <= current:
            _PENDING.pop(pending_id, None)


def create_pending(project_id: str, owner: str | None, operation: dict[str, Any], ttl_seconds: int = 600) -> dict[str, Any]:
    _purge_expired()
    pending_id = "pending-" + uuid.uuid4().hex[:12]
    row = {
        "pending_id": pending_id,
        "project_id": project_id,
        "owner": owner,
        "operation": operation,
        "created_at": time.time(),
        "expires_at": time.time() + ttl_seconds,
    }
    _PENDING[pending_id] = row
    return dict(row)


def get_pending(pending_id: str, owner: str | None, project_id: str) -> dict[str, Any] | None:
    _purge_expired()
    row = _PENDING.get(pending_id)
    if not row or row["owner"] != owner or row["project_id"] != project_id:
        return None
    return dict(row)


def resolve_pending(pending_id: str, owner: str | None, project_id: str, decision: str) -> dict[str, Any]:
    if decision not in {"approve", "reject"}:
        raise ValueError("decision must be approve or reject")
    row = get_pending(pending_id, owner, project_id)
    if not row:
        raise KeyError(pending_id)
    _PENDING.pop(pending_id, None)
    row["decision"] = decision
    return row
```

- [ ] **Step 4: Add project policy shape to `src/tool_execution.py`**

Add a lightweight dataclass near the active workspace helpers:

```python
from dataclasses import dataclass


@dataclass
class ProjectPolicy:
    project_id: str
    owner: str | None
    project_root: str
    linked_paths: list[dict]
    auto_approve: bool = False
```

Extend `execute_tool_block` and `execute_tool` signatures with `project_policy: Optional[ProjectPolicy] = None`, pass it from `execute_tool_block` into `execute_tool`, and pass it into `_direct_fallback` through `ctx`:

```python
ctx = {
    "progress_cb": progress_cb,
    "subproc_env": _subproc_env,
    "project_policy": project_policy,
}
```

Do not enforce approvals in this task; this task only adds the typed parameter without changing behavior.

- [ ] **Step 5: Run tests and compile**

Run:

```bash
.venv/bin/python -m pytest tests/test_project_approval.py tests/test_shell_classifier.py -v
python3 -m py_compile src/project_approval.py src/tool_execution.py
git diff --check
```

Expected: all pass.

- [ ] **Step 6: Update progress tracker and commit**

Append:

```markdown
- Added project pending-approval registry and shell static classifier.
```

Run:

```bash
git add src/project_approval.py src/tool_execution.py tests/test_project_approval.py tests/test_shell_classifier.py context/progress-tracker.md
git commit -m "feat(projects): add approval primitives"
```

---

### Task 5: Agent Execution Policy

**Files:**
- Modify: `src/tool_execution.py`
- Modify: `src/agent_loop.py`
- Modify: `routes/project_routes.py`
- Modify: `src/projects.py`
- Test: `tests/test_project_agent_policy.py`
- Modify after passing: `context/progress-tracker.md`

- [ ] **Step 1: Write failing policy tests**

Create `tests/test_project_agent_policy.py`:

```python
import json

import pytest

from src.tool_execution import ProjectPolicy, execute_tool_block
from src.tool_parsing import ToolBlock


@pytest.mark.asyncio
async def test_project_read_uses_project_workspace(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    (root / "app.py").write_text("print('hi')", encoding="utf-8")
    policy = ProjectPolicy(project_id="p1", owner="alice", project_root=str(root), linked_paths=[], auto_approve=True)

    desc, result = await execute_tool_block(ToolBlock("read_file", "app.py"), owner="alice", project_policy=policy)

    assert result["exit_code"] == 0
    assert "print('hi')" in result["output"]


@pytest.mark.asyncio
async def test_project_write_requires_pending_when_auto_approve_off(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    policy = ProjectPolicy(project_id="p1", owner="alice", project_root=str(root), linked_paths=[], auto_approve=False)

    desc, result = await execute_tool_block(ToolBlock("write_file", "app.py\nprint('hi')"), owner="alice", project_policy=policy)

    assert result["pending"] is True
    assert result["operation"]["tool"] == "write_file"
    assert not (root / "app.py").exists()


@pytest.mark.asyncio
async def test_project_static_bash_auto_approve_runs_in_project_home(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    policy = ProjectPolicy(project_id="p1", owner="alice", project_root=str(root), linked_paths=[], auto_approve=True)

    desc, result = await execute_tool_block(ToolBlock("bash", "pwd"), owner="alice", project_policy=policy)

    assert result["exit_code"] == 0
    assert str(root) in result["output"]


@pytest.mark.asyncio
async def test_project_non_static_bash_forces_pending_even_auto_approve(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    policy = ProjectPolicy(project_id="p1", owner="alice", project_root=str(root), linked_paths=[], auto_approve=True)

    desc, result = await execute_tool_block(ToolBlock("bash", "echo $(pwd)"), owner="alice", project_policy=policy)

    assert result["pending"] is True
    assert result["operation"]["tool"] == "bash"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_project_agent_policy.py -v`

Expected: FAIL because project policy is not enforced.

- [ ] **Step 3: Enforce project policy in `src/tool_execution.py`**

In `execute_tool_block`, when `project_policy` is set, pass `workspace=project_policy.project_root` into the active workspace context. Add helper functions:

```python
def _project_mutating_tool(tool: str) -> bool:
    return tool in {"write_file", "edit_file", "bash", "python"}


def _project_pending_result(project_policy: ProjectPolicy, tool: str, content: str, reason: str = "") -> dict:
    from src.project_approval import create_pending
    operation = {
        "tool": tool,
        "content": content,
        "summary": f"{tool}: {content.split(chr(10))[0][:120]}",
        "command": content if tool in {"bash", "python"} else "",
        "reason": reason,
    }
    pending = create_pending(project_policy.project_id, project_policy.owner, operation)
    return {
        "pending": True,
        "pending_id": pending["pending_id"],
        "operation": operation,
        "output": f"Pending approval for {operation['summary']}",
        "exit_code": 0,
    }
```

Before executing mutating tools:

```python
if project_policy and _project_mutating_tool(tool):
    if tool == "bash":
        from src.project_approval import classify_shell_command
        cls = classify_shell_command(content)
        if not cls.static:
            return f"{tool}: pending approval", _project_pending_result(project_policy, tool, content, cls.reason)
    if not project_policy.auto_approve:
        return f"{tool}: pending approval", _project_pending_result(project_policy, tool, content)
```

Set project shell environment before calling shell tools:

```python
if project_policy:
    home = os.path.join(project_policy.project_root, ".odysseus-home")
    os.makedirs(home, exist_ok=True)
    _subproc_env = dict(os.environ)
    _subproc_env["HOME"] = home
```

- [ ] **Step 4: Add project stream routes**

In `routes/project_routes.py`, add:

```python
@router.post("/{project_id}/messages")
async def post_project_message(project_id: str, request: Request):
    _desktop_required()
    from src.agent_loop import stream_agent_loop
    from src import agent_runs
    from src.tool_execution import ProjectPolicy
    payload = await request.json()
    content = str(payload.get("content") or "").strip()
    if not content:
        raise HTTPException(400, "content is required")
    owner = _owner(request)
    with SessionLocal() as db:
        project = get_owned_project(db, project_id, owner)
        msg = ProjectMessage(id="pm-" + uuid.uuid4().hex[:12], project_id=project.id, owner=owner, role="user", content=content, metadata={})
        db.add(msg)
        db.commit()
        messages = [{"role": "user", "content": content}]
        policy = ProjectPolicy(project.id, owner, project.folder_path, project.linked_paths or [], bool(project.auto_approve))
        run = agent_runs.start(project.id, stream_agent_loop(
            project.endpoint_url,
            project.model,
            messages,
            headers=project.headers or {},
            session_id=project.id,
            owner=owner,
            workspace=project.folder_path,
            project_policy=policy,
        ))
        return {"status": "started", "project_id": project.id}
```

Add `GET /{project_id}/stream` that returns `StreamingResponse(agent_runs.subscribe(project.id), media_type="text/event-stream")`, and `POST /{project_id}/stop` that calls `agent_runs.stop(project.id)`.

- [ ] **Step 5: Update `src/agent_loop.py` signature**

Add `project_policy: Optional[ProjectPolicy] = None` to `stream_agent_loop`, import `ProjectPolicy` under `TYPE_CHECKING` or from `src.tool_execution`, append a short system message when present:

```python
if project_policy:
    messages.insert(0, {
        "role": "system",
        "content": (
            "Project workspace mode is active. Use file and shell tools only inside "
            f"{project_policy.project_root}. Ask the user to link outside paths instead "
            "of trying to bypass the sandbox. Mutating operations may require approval."
        ),
    })
```

Pass `project_policy=project_policy` to `execute_tool_block`.

- [ ] **Step 6: Run tests and compile**

Run:

```bash
.venv/bin/python -m pytest tests/test_project_agent_policy.py tests/test_project_approval.py tests/test_shell_classifier.py -v
python3 -m py_compile src/tool_execution.py src/agent_loop.py routes/project_routes.py src/projects.py
git diff --check
```

Expected: all pass.

- [ ] **Step 7: Update progress tracker and commit**

Append:

```markdown
- Wired project policies into the agent loop and tool execution.
```

Run:

```bash
git add src/tool_execution.py src/agent_loop.py routes/project_routes.py src/projects.py tests/test_project_agent_policy.py context/progress-tracker.md
git commit -m "feat(projects): enforce project agent policy"
```

---

### Task 6: Sidebar-Native Projects UI

**Files:**
- Create: `static/js/projects.js`
- Modify: `static/index.html`
- Modify: `static/app.js`
- Modify: `static/style.css`
- Test: `tests/js/projects-ui.test.mjs`
- Modify after passing: `context/progress-tracker.md`

- [ ] **Step 1: Write failing JS smoke test**

Create `tests/js/projects-ui.test.mjs`:

```javascript
import assert from 'node:assert/strict';
import { isDesktopBridgeAvailable, summarizeDiffStats } from '../../static/js/projects.js';

assert.equal(isDesktopBridgeAvailable({ pywebview: { api: { pick_folder() {} } } }), true);
assert.equal(isDesktopBridgeAvailable({}), false);
assert.deepEqual(
  summarizeDiffStats([{ diff: { added: 3, removed: 1, file: 'app.py' } }, { diff: { added: 2, removed: 0, file: 'style.css' } }]),
  { files: 2, added: 5, removed: 1 }
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/js/projects-ui.test.mjs`

Expected: FAIL because `static/js/projects.js` does not exist.

- [ ] **Step 3: Add Projects shell to `static/index.html`**

Add a rail button after `#rail-chats`:

```html
<button class="icon-rail-btn" id="rail-projects" title="Projects" style="display:none"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v6"/><path d="M9 14h6"/></svg></button>
```

Add a sibling to `#chat-container`:

```html
<section class="projects-view hidden" id="projects-view" aria-label="Projects">
  <aside class="projects-sidebar">
    <div class="projects-header">
      <span>Projects</span>
      <button type="button" id="projects-new-btn" class="section-header-btn" aria-label="New Project">+</button>
    </div>
    <div id="projects-list" class="projects-list"></div>
    <div class="projects-files-header">Files</div>
    <div id="projects-tree" class="projects-tree"></div>
  </aside>
  <main class="projects-chat">
    <header class="projects-chat-header">
      <span id="projects-title">Projects</span>
      <button type="button" id="projects-reveal-btn" class="confirm-btn confirm-btn-secondary">Reveal</button>
      <label class="projects-auto-approve"><input type="checkbox" id="projects-auto-approve"> Auto-approve</label>
    </header>
    <div id="projects-history" class="chat-history"></div>
    <form id="projects-form" class="chat-input-bar">
      <textarea id="projects-input" rows="1" placeholder="Ask the project agent..."></textarea>
      <button type="submit" class="send-btn" aria-label="Send">Send</button>
    </form>
  </main>
  <aside class="projects-changes" id="projects-changes">
    <header>Changes</header>
    <div id="projects-changes-body" class="projects-changes-body"></div>
  </aside>
</section>
```

- [ ] **Step 4: Implement `static/js/projects.js`**

Create:

```javascript
const API_BASE = window.location.origin;

export function isDesktopBridgeAvailable(win = window) {
  return !!(win.pywebview && win.pywebview.api && typeof win.pywebview.api.pick_folder === 'function');
}

export function summarizeDiffStats(events) {
  return (events || []).reduce((acc, ev) => {
    if (!ev || !ev.diff) return acc;
    acc.files += 1;
    acc.added += Number(ev.diff.added || 0);
    acc.removed += Number(ev.diff.removed || 0);
    return acc;
  }, { files: 0, added: 0, removed: 0 });
}

function esc(text) {
  return String(text == null ? '' : text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

export function initProjectsUI() {
  const view = document.getElementById('projects-view');
  const rail = document.getElementById('rail-projects');
  if (!view || !rail) return;
  if (!isDesktopBridgeAvailable(window)) {
    rail.style.display = 'none';
    return;
  }
  rail.style.display = '';
  rail.addEventListener('click', () => openProjectsView());
  document.getElementById('projects-new-btn')?.addEventListener('click', createProjectFromPicker);
  document.getElementById('projects-form')?.addEventListener('submit', sendProjectPrompt);
  loadProjects();
}

export function openProjectsView() {
  document.getElementById('chat-container')?.classList.add('hidden');
  document.getElementById('projects-view')?.classList.remove('hidden');
  document.getElementById('rail-projects')?.classList.add('active-section');
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'same-origin', ...options });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

async function loadProjects() {
  const list = document.getElementById('projects-list');
  if (!list) return;
  const projects = await api('/api/projects').catch(() => []);
  list.innerHTML = projects.map(p => `<button type="button" class="projects-row" data-project-id="${esc(p.id)}"><span>${esc(p.name)}</span><small>${esc(p.folder_name)}</small></button>`).join('') || '<div class="projects-empty">No projects</div>';
  list.querySelectorAll('[data-project-id]').forEach(btn => btn.addEventListener('click', () => openProject(btn.dataset.projectId)));
}

async function createProjectFromPicker() {
  const picked = await window.pywebview.api.pick_folder();
  if (!picked || picked.cancelled) return;
  const project = await api('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder_path: picked.path }),
  });
  await loadProjects();
  await renderProject(project);
}

async function openProject(id) {
  await renderProject(await api(`/api/projects/${encodeURIComponent(id)}`));
}

async function renderProject(project) {
  window.__odysseusActiveProject = project;
  document.getElementById('projects-title').textContent = project.name;
  document.getElementById('projects-tree').innerHTML = (project.tree?.entries || []).map(e => `<div class="projects-file-row" title="${esc(e.path)}">${esc(e.kind === 'folder' ? e.name + '/' : e.name)}</div>`).join('');
  document.getElementById('projects-history').innerHTML = (project.messages || []).map(m => `<div class="message ${esc(m.role)}"><div class="message-content">${esc(m.content)}</div></div>`).join('');
  renderChanges([]);
  openProjectsView();
}

async function sendProjectPrompt(event) {
  event.preventDefault();
  const project = window.__odysseusActiveProject;
  const input = document.getElementById('projects-input');
  const content = input.value.trim();
  if (!project || !content) return;
  input.value = '';
  await api(`/api/projects/${encodeURIComponent(project.id)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  subscribeProject(project.id);
}

function subscribeProject(projectId) {
  const es = new EventSource(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/stream`, { withCredentials: true });
  const events = [];
  es.onmessage = (event) => {
    if (event.data === '[DONE]') {
      es.close();
      return;
    }
    const data = JSON.parse(event.data);
    if (data.type === 'tool_output') {
      events.push(data);
      renderChanges(events);
    }
  };
}

function renderChanges(events) {
  const body = document.getElementById('projects-changes-body');
  if (!body) return;
  const stats = summarizeDiffStats(events);
  body.innerHTML = stats.files
    ? `<div class="projects-change-summary">${stats.files} files +${stats.added} -${stats.removed}</div>`
    : '<div class="projects-empty">No changes yet</div>';
}

export default { initProjectsUI, openProjectsView };
```

- [ ] **Step 5: Wire app initialization**

In `static/app.js`, import:

```javascript
import { initProjectsUI } from './js/projects.js';
```

Call near other UI initializers:

```javascript
initProjectsUI();
```

- [ ] **Step 6: Add minimal CSS**

Add to `static/style.css`:

```css
.projects-view {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(360px, 1fr) minmax(260px, 340px);
  gap: 0;
  height: 100%;
  min-width: 0;
  background: var(--bg);
  color: var(--fg);
}
.projects-view.hidden { display: none !important; }
.projects-sidebar,
.projects-changes {
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
  background: var(--panel);
  min-width: 0;
  overflow: auto;
}
.projects-chat {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.projects-header,
.projects-chat-header,
.projects-changes header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid var(--border);
}
.projects-row,
.projects-file-row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border: 0;
  background: transparent;
  color: var(--fg);
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.projects-row:hover,
.projects-file-row:hover {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.projects-empty,
.projects-change-summary {
  padding: 12px;
  color: color-mix(in srgb, var(--fg) 65%, transparent);
}
@media (max-width: 760px) {
  .projects-view {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(420px, 1fr) auto;
  }
}
```

- [ ] **Step 7: Run checks**

Run:

```bash
node tests/js/projects-ui.test.mjs
node --check static/js/projects.js
node --check static/app.js
git diff --check
```

Expected: all pass.

- [ ] **Step 8: Update progress tracker and commit**

Append:

```markdown
- Added sidebar-native Projects UI shell and desktop bridge detection.
```

Run:

```bash
git add static/index.html static/app.js static/js/projects.js static/style.css tests/js/projects-ui.test.mjs context/progress-tracker.md
git commit -m "feat(projects): add sidebar projects UI"
```

---

### Task 7: Approval UI, Message Persistence, And Threat Model

**Files:**
- Modify: `routes/project_routes.py`
- Modify: `static/js/projects.js`
- Modify: `static/style.css`
- Modify: `THREAT_MODEL.md`
- Test: `tests/test_project_message_persistence.py`
- Test: `tests/js/projects-approval-ui.test.mjs`
- Modify after passing: `context/progress-tracker.md`

- [ ] **Step 1: Write failing persistence and UI tests**

Create `tests/test_project_message_persistence.py`:

```python
from core.database import Project, ProjectMessage, SessionLocal
from src.projects import scrub_project_metadata


def test_project_tool_metadata_scrubbed_before_save(temp_db, tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    with SessionLocal() as db:
        project = Project(id="p1", owner="alice", name="repo", folder_path=str(root), linked_paths=[])
        db.add(project)
        msg = ProjectMessage(
            id="m1",
            project_id="p1",
            owner="alice",
            role="tool",
            content="Edited app.py",
            metadata=scrub_project_metadata({"path": "app.py", "raw_content": "secret", "status": "done"}),
        )
        db.add(msg)
        db.commit()
        saved = db.query(ProjectMessage).one()
        assert saved.metadata == {"path": "app.py", "status": "done"}
```

Create `tests/js/projects-approval-ui.test.mjs`:

```javascript
import assert from 'node:assert/strict';
import { renderApprovalCardHtml } from '../../static/js/projects.js';

const html = renderApprovalCardHtml({
  pending_id: 'pending-1',
  operation: { tool: 'write_file', summary: 'write app.py', path: 'app.py' },
});

assert.match(html, /Approve/);
assert.match(html, /Reject/);
assert.match(html, /write app\.py/);
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
.venv/bin/python -m pytest tests/test_project_message_persistence.py -v
node tests/js/projects-approval-ui.test.mjs
```

Expected: JS test fails because `renderApprovalCardHtml` is missing.

- [ ] **Step 3: Persist project events from streams**

In `routes/project_routes.py`, add a helper:

```python
def save_project_message(project_id: str, owner: str | None, role: str, content: str, metadata: dict | None = None):
    from src.projects import scrub_project_metadata
    with SessionLocal() as db:
        db.add(ProjectMessage(
            id="pm-" + uuid.uuid4().hex[:12],
            project_id=project_id,
            owner=owner,
            role=role,
            content=content,
            metadata=scrub_project_metadata(metadata),
        ))
        db.commit()
```

Wrap the project stream generator so each `tool_output` event with `diff`, `pending`, or `exit_code` gets saved as a `ProjectMessage(role="tool", ...)`, and final assistant text gets saved as `ProjectMessage(role="assistant", ...)`. Reuse `scrub_project_metadata` before saving metadata.

- [ ] **Step 4: Add approval route**

In `routes/project_routes.py`, add an approval route that executes an approved operation by reconstructing a `ToolBlock` and a temporary `ProjectPolicy(auto_approve=True)` so the operation is checked and run exactly once:

```python
@router.post("/{project_id}/approve/{pending_id}")
async def approve_project_operation(project_id: str, pending_id: str, request: Request):
    _desktop_required()
    from src.project_approval import resolve_pending
    from src.tool_execution import ProjectPolicy, execute_tool_block
    from src.tool_parsing import ToolBlock
    payload = await request.json()
    decision = "approve" if payload.get("decision") == "approve" else "reject"
    owner = _owner(request)
    with SessionLocal() as db:
        project = get_owned_project(db, project_id, owner)
        policy = ProjectPolicy(project.id, owner, project.folder_path, project.linked_paths or [], True)
    try:
        resolved = resolve_pending(pending_id, owner, project_id, decision)
    except KeyError:
        raise HTTPException(404, "Pending operation not found")
    operation = resolved["operation"]
    if decision == "reject":
        save_project_message(project_id, owner, "tool", f"rejected: {operation.get('summary', 'operation')}", resolved)
        return {"status": "reject", "pending_id": pending_id}
    block = ToolBlock(operation["tool"], operation.get("content") or operation.get("command") or "")
    desc, result = await execute_tool_block(block, owner=owner, project_policy=policy)
    save_project_message(project_id, owner, "tool", desc, {**resolved, **result})
    return {"status": "approve", "pending_id": pending_id, "result": result}
```

- [ ] **Step 5: Add approval card HTML**

In `static/js/projects.js`:

```javascript
export function renderApprovalCardHtml(event) {
  const op = event.operation || {};
  return `
    <div class="projects-approval-card" data-pending-id="${esc(event.pending_id)}">
      <div class="projects-approval-title">${esc(op.summary || op.tool || 'Pending operation')}</div>
      <div class="projects-approval-path">${esc(op.path || op.command || '')}</div>
      <div class="projects-approval-actions">
        <button type="button" data-project-approval="approve">Approve</button>
        <button type="button" data-project-approval="reject">Reject</button>
        <button type="button" data-project-approval="approve-continue">Approve & continue</button>
      </div>
    </div>`;
}
```

In the SSE handler, when an event has `pending === true` or `type === "pending_approval"`, append this HTML to `#projects-history`.

- [ ] **Step 6: Add approval CSS**

Add:

```css
.projects-approval-card {
  margin: 10px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--panel));
  border-radius: 6px;
}
.projects-approval-title { font-weight: 600; margin-bottom: 6px; }
.projects-approval-path { font-size: 12px; opacity: 0.75; word-break: break-all; }
.projects-approval-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}
```

- [ ] **Step 7: Update threat model**

Append to `THREAT_MODEL.md`:

```markdown
## Projects Workspace Agent

Projects is macOS desktop-only and binds the built-in Odysseus agent to a user-selected folder. File paths are resolved with `realpath` before access, and the agent can reach only the project folder plus user-linked paths. Linked paths are user-created and can be read-only or read/write.

Mutating file operations and shell commands require approval by default. Non-static shell commands always require approval. Shell commands run in the project folder with a project-local `HOME`, but v1 does not block network egress from shell commands. A malicious project can still contain scripts the user approves the agent to run.
```

- [ ] **Step 8: Run checks**

Run:

```bash
.venv/bin/python -m pytest tests/test_project_message_persistence.py tests/test_project_approval.py -v
node tests/js/projects-approval-ui.test.mjs
node --check static/js/projects.js
python3 -m py_compile routes/project_routes.py src/projects.py
git diff --check
```

Expected: all pass.

- [ ] **Step 9: Update progress tracker and commit**

Append:

```markdown
- Added Projects approval UI, project message persistence, and threat model notes.
```

Run:

```bash
git add routes/project_routes.py static/js/projects.js static/style.css THREAT_MODEL.md tests/test_project_message_persistence.py tests/js/projects-approval-ui.test.mjs context/progress-tracker.md
git commit -m "feat(projects): add approval UI and persistence"
```

---

### Task 8: End-To-End Verification And UI Polish

**Files:**
- Modify: `static/js/projects.js`
- Modify: `static/style.css`
- Modify: `routes/project_routes.py`
- Test: `tests/test_project_agent_policy.py`
- Test: `tests/test_project_routes.py`
- Modify after passing: `context/progress-tracker.md`

- [ ] **Step 1: Add final regression tests**

Extend `tests/test_project_routes.py` with:

```python
def test_project_chat_does_not_create_normal_chat_session(monkeypatch, temp_db, tmp_path):
    monkeypatch.setenv("ODYSSEUS_DESKTOP_APP", "1")
    root = tmp_path / "repo"
    root.mkdir()
    client = TestClient(app)
    _login_as(client, "alice")
    project = client.post("/api/projects", json={"folder_path": str(root)}).json()
    before = client.get("/api/sessions").json()

    res = client.post(f"/api/projects/{project['id']}/messages", json={"content": "hello"})
    assert res.status_code in {200, 400}

    after = client.get("/api/sessions").json()
    assert after == before
```

Expected behavior: if no model is configured for the project, the route may return `400`; it still must not create a normal chat session.

- [ ] **Step 2: Run focused backend tests**

Run:

```bash
.venv/bin/python -m pytest \
  tests/test_project_models.py \
  tests/test_project_sandbox.py \
  tests/test_project_routes.py \
  tests/test_project_approval.py \
  tests/test_project_agent_policy.py \
  tests/test_project_message_persistence.py \
  -v
```

Expected: all pass.

- [ ] **Step 3: Run frontend checks**

Run:

```bash
node tests/js/projects-ui.test.mjs
node tests/js/projects-approval-ui.test.mjs
node --check static/js/projects.js
node --check static/app.js
git diff --check
```

Expected: all pass.

- [ ] **Step 4: Run app and inspect desktop/mobile layouts**

Run:

```bash
python -m uvicorn app:app --host 127.0.0.1 --port 7000
```

Open the app in the browser for layout checks. In plain browser mode, verify `#rail-projects` is hidden. In a desktop bridge-stub session, verify:

```javascript
window.pywebview = { api: { pick_folder: async () => ({ cancelled: false, path: "/tmp" }) } };
```

Then reload and verify the Projects rail appears, the Projects view opens, the sidebar list/file tree/main chat/changes pane do not overlap at desktop width, and the surfaces stack below `760px`.

- [ ] **Step 5: Run broad safety checks**

Run:

```bash
python3 -m py_compile core/database.py src/projects.py src/project_sandbox.py src/project_approval.py src/tool_execution.py src/agent_loop.py routes/project_routes.py desktop_main.py app.py
git diff --check
```

Expected: all pass.

- [ ] **Step 6: Update progress tracker and commit**

Append:

```markdown
- Completed Projects end-to-end verification and UI layout checks.
```

Run:

```bash
git add tests/test_project_routes.py static/js/projects.js static/style.css routes/project_routes.py context/progress-tracker.md
git commit -m "test(projects): verify projects workflow"
```

---

## Execution Notes

- Work in an isolated worktree before implementing this plan.
- Do not modify existing Chats storage or session listing semantics beyond read-only reuse.
- Do not add external Codex/Claude process hosting in v1.
- Do not store full file snapshots or raw hidden file contents in `ProjectMessage.metadata`.
- Do not make shell network egress claims stronger than the implemented behavior.
- Keep `.superpowers/` visual companion files untracked.

## Self-Review

- Spec coverage: persistence, native bridge, sidebar UI, file tree, changes pane, approval cards, sandbox, linked paths, project messages, owner scoping, browser hiding, threat model, and tests are covered.
- Scope check: external Codex/Claude hosting, browser-mode Projects, project templates, multi-window Projects, and network-egress sandboxing remain v2.
- Type consistency: plan uses `Project`, `ProjectMessage`, `ProjectPolicy`, `project_policy`, `linked_paths`, `auto_approve`, and `pending_id` consistently across tasks.
