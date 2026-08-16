"""Owner-scoped, desktop-gated routes for the Projects surface.

Projects are a macOS-desktop-only folder-scoped agent workspace. Every route
here is gated on ``ODYSSEUS_DESKTOP_APP=1`` and scoped to the calling user via
``get_current_user``; cross-owner access returns 404 rather than 403 so an
unknown id reveals nothing about other tenants.

The router is constructed by :func:`setup_project_routes` and included by
``app.py``. Heavy work (agent streaming, approvals, shell classification) is
added in later tasks; this module covers persistence, the file-tree scan, and
linked-path management.
"""
import json
import os
import subprocess
import uuid

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from core.database import Project, ProjectMessage, SessionLocal, utcnow_naive
from src.auth_helpers import get_current_user
from src.projects import (
    canonical_folder,
    get_owned_project,
    project_message_to_dict,
    project_to_dict,
)

_TREE_IGNORED_DIRS = {".git", "node_modules", ".venv", "__pycache__"}
_TREE_ENTRY_LIMIT = 2000


def _desktop_required() -> None:
    """503 when not running inside the desktop app.

    Browsers cannot expose real filesystem paths or run shells, so Projects
    is intentionally unavailable there. The structured error lets the
    frontend render a single, accurate empty state.
    """
    if os.environ.get("ODYSSEUS_DESKTOP_APP") != "1":
        raise HTTPException(
            status_code=503,
            detail={"error": "projects_requires_desktop_app"},
        )


def _scan_tree(root: str, limit: int = _TREE_ENTRY_LIMIT) -> dict:
    """Shallow-ish walk of a project root: paths + sizes only, no contents.

    Capped at ``limit`` entries; ignored dirs (.git, node_modules, .venv,
    __pycache__) are pruned in-place. Sizes come from os.stat and are best
    effort — unstatable entries are skipped rather than crashing the scan.
    """
    rows: list[dict] = []
    root_real = os.path.realpath(root)
    for dirpath, dirnames, filenames in os.walk(root_real):
        dirnames[:] = [d for d in sorted(dirnames) if d not in _TREE_IGNORED_DIRS]
        rel_dir = os.path.relpath(dirpath, root_real)
        for name in sorted(dirnames) + sorted(filenames):
            full = os.path.join(dirpath, name)
            try:
                stat = os.stat(full)
            except OSError:
                continue
            rel = name if rel_dir == "." else os.path.join(rel_dir, name)
            rows.append(
                {
                    "path": rel,
                    "name": name,
                    "kind": "folder" if os.path.isdir(full) else "file",
                    "size": stat.st_size,
                }
            )
            if len(rows) >= limit:
                return {"root": root_real, "entries": rows, "truncated": True}
    return {"root": root_real, "entries": rows, "truncated": False}


def save_project_message(
    project_id: str,
    owner: str | None,
    role: str,
    content: str,
    metadata: dict | None = None,
) -> None:
    """Persist a project conversation message with scrubbed metadata.

    Invariant 3: metadata is run through scrub_project_metadata so only the
    operation record (paths, sizes, unified diffs, statuses, approval
    decisions, pending_id) is stored — never raw file snapshots or raw tool
    inputs/outputs. ``content`` is a short description, not the raw output.
    """
    from src.projects import scrub_project_metadata
    db = SessionLocal()
    try:
        db.add(ProjectMessage(
            id="pm-" + uuid.uuid4().hex[:12],
            project_id=project_id,
            owner=owner,
            role=role,
            content=content,
            meta_data=scrub_project_metadata(metadata),
        ))
        db.commit()
    finally:
        db.close()


async def persist_project_stream(project_id: str, owner: str | None, gen):
    """Forward an SSE generator to the client while persisting its events.

    Tool-output events become ``role="tool"`` ProjectMessages (metadata
    scrubbed), and accumulated assistant deltas become one
    ``role="assistant"`` message when the stream ends. The raw SSE chunk is
    yielded unchanged so the browser-facing stream is byte-identical.
    """
    assistant_parts: list[str] = []
    async for chunk in gen:
        try:
            for line in str(chunk).splitlines():
                if not line.startswith("data: "):
                    continue
                payload = line[len("data: "):]
                if payload == "[DONE]":
                    continue
                data = json.loads(payload)
                if not isinstance(data, dict):
                    continue
                if data.get("type") == "tool_output":
                    tool = str(data.get("tool") or "tool")
                    status = data.get("status") or ("ok" if data.get("exit_code") in (None, 0) else "failed")
                    save_project_message(project_id, owner, "tool", f"{tool}: {status}", data)
                elif data.get("type") == "pending_approval" or data.get("pending") is True:
                    op = data.get("operation") or {}
                    save_project_message(
                        project_id, owner, "tool",
                        f"pending: {op.get('summary') or op.get('tool') or 'operation'}",
                        data,
                    )
                elif data.get("type") == "delta" and isinstance(data.get("delta"), str):
                    assistant_parts.append(data["delta"])
        except Exception:
            # Persistence must never break the live stream.
            pass
        yield chunk
    text = "".join(assistant_parts).strip()
    if text:
        save_project_message(project_id, owner, "assistant", text)


def setup_project_routes() -> APIRouter:
    router = APIRouter(prefix="/api/projects", tags=["projects"])

    @router.post("/pick-folder")
    def pick_folder(request: Request):
        _desktop_required()
        get_current_user(request)
        proc = subprocess.run(
            [
                "osascript",
                "-e",
                'POSIX path of (choose folder with prompt "Choose a project folder")',
            ],
            capture_output=True,
            text=True,
            check=False,
            timeout=120,
        )
        if proc.returncode != 0:
            return {"cancelled": True, "path": ""}
        path = proc.stdout.strip()
        return {"cancelled": False, "path": os.path.realpath(path)} if path else {"cancelled": True, "path": ""}

    @router.get("")
    def list_projects(request: Request):
        _desktop_required()
        owner = get_current_user(request)
        db = SessionLocal()
        try:
            rows = (
                db.query(Project)
                .filter(Project.owner == owner, Project.archived == False)  # noqa: E712
                .order_by(
                    Project.last_opened_at.desc().nullslast(),
                    Project.updated_at.desc(),
                )
                .all()
            )
            return [project_to_dict(p) for p in rows]
        finally:
            db.close()

    @router.post("")
    async def create_project(request: Request):
        _desktop_required()
        owner = get_current_user(request)
        payload = await request.json()
        folder = canonical_folder(str(payload.get("folder_path", "")))
        name = (
            payload.get("name")
            or os.path.basename(folder)
            or "Project"
        ).strip()[:120]
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
        db = SessionLocal()
        try:
            db.add(project)
            db.commit()
            db.refresh(project)
            data = project_to_dict(project)
        finally:
            db.close()
        data["tree"] = _scan_tree(folder)
        return data

    @router.get("/{project_id}")
    def get_project(project_id: str, request: Request):
        _desktop_required()
        db = SessionLocal()
        try:
            project = get_owned_project(db, project_id, get_current_user(request))
            db.commit()
            data = project_to_dict(project)
            data["tree"] = _scan_tree(project.folder_path)
            data["messages"] = [
                project_message_to_dict(m)
                for m in db.query(ProjectMessage)
                .filter(ProjectMessage.project_id == project.id)
                .order_by(ProjectMessage.created_at)
                .all()
            ]
            return data
        finally:
            db.close()

    @router.patch("/{project_id}")
    async def update_project(project_id: str, request: Request):
        _desktop_required()
        owner = get_current_user(request)
        payload = await request.json()
        db = SessionLocal()
        try:
            project = get_owned_project(db, project_id, owner)
            if "model" in payload:
                project.model = str(payload.get("model") or "")
            if "endpoint_url" in payload:
                project.endpoint_url = str(payload.get("endpoint_url") or "")
            if "endpoint_id" in payload:
                project.endpoint_id = str(payload.get("endpoint_id") or "")
            if "auto_approve" in payload:
                project.auto_approve = bool(payload.get("auto_approve"))
            db.commit()
            db.refresh(project)
            return project_to_dict(project)
        finally:
            db.close()

    @router.get("/{project_id}/tree")
    def project_tree(project_id: str, request: Request):
        _desktop_required()
        db = SessionLocal()
        try:
            project = get_owned_project(db, project_id, get_current_user(request))
            return _scan_tree(project.folder_path)
        finally:
            db.close()

    @router.post("/{project_id}/linked")
    async def add_linked_path(project_id: str, request: Request):
        _desktop_required()
        payload = await request.json()
        kind = payload.get("kind")
        mode = payload.get("mode")
        if kind not in {"file", "folder"}:
            raise HTTPException(400, "kind must be file or folder")
        if mode not in {"ro", "rw"}:
            raise HTTPException(400, "mode must be ro or rw")

        raw_path = str(payload.get("path", ""))
        if kind == "folder":
            path = canonical_folder(raw_path)
        else:
            path = os.path.realpath(os.path.expanduser(raw_path))
            if not os.path.isfile(path):
                raise HTTPException(400, "Linked file must exist")

        db = SessionLocal()
        try:
            project = get_owned_project(db, project_id, get_current_user(request))
            links = list(project.linked_paths or [])
            links.append({"path": path, "kind": kind, "mode": mode})
            project.linked_paths = links
            db.commit()
            db.refresh(project)
            return project_to_dict(project)
        finally:
            db.close()

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
        owner = get_current_user(request)
        db = SessionLocal()
        try:
            project = get_owned_project(db, project_id, owner)
            db.add(ProjectMessage(
                id="pm-" + uuid.uuid4().hex[:12],
                project_id=project.id,
                owner=owner,
                role="user",
                content=content,
                meta_data={},
            ))
            db.commit()
            messages = [{"role": "user", "content": content}]
            policy = ProjectPolicy(
                project.id,
                owner,
                project.folder_path,
                project.linked_paths or [],
                bool(project.auto_approve),
            )
            agent_runs.start(project.id, stream_agent_loop(
                project.endpoint_url,
                project.model,
                messages,
                headers=project.headers or {},
                session_id=project.id,
                owner=owner,
                workspace=project.folder_path,
                project_policy=policy,
            ))
        finally:
            db.close()
        return {"status": "started", "project_id": project_id}

    @router.get("/{project_id}/stream")
    async def project_stream(project_id: str, request: Request):
        _desktop_required()
        from src import agent_runs
        db = SessionLocal()
        try:
            # Owner-scope the stream: a 404 for non-owners reveals nothing.
            get_owned_project(db, project_id, get_current_user(request))
        finally:
            db.close()
        return StreamingResponse(
            persist_project_stream(project_id, get_current_user(request), agent_runs.subscribe(project_id)),
            media_type="text/event-stream",
        )

    @router.post("/{project_id}/stop")
    def stop_project(project_id: str, request: Request):
        _desktop_required()
        from src import agent_runs
        db = SessionLocal()
        try:
            get_owned_project(db, project_id, get_current_user(request))
        finally:
            db.close()
        stopped = agent_runs.stop(project_id)
        return {"stopped": bool(stopped), "project_id": project_id}

    @router.post("/{project_id}/approve/{pending_id}")
    async def approve_project_operation(project_id: str, pending_id: str, request: Request):
        _desktop_required()
        from src.project_approval import resolve_pending
        from src.tool_execution import ProjectPolicy, execute_tool_block, NO_TOOL_SECURITY_CONTEXT
        from src.agent_tools import ToolBlock
        payload = await request.json()
        decision = "approve" if payload.get("decision") == "approve" else "reject"
        owner = get_current_user(request)
        db = SessionLocal()
        try:
            project = get_owned_project(db, project_id, owner)
            policy = ProjectPolicy(
                project.id,
                owner,
                project.folder_path,
                project.linked_paths or [],
                auto_approve=True,
                bypass_pending=True,
            )
        finally:
            db.close()
        try:
            resolved = resolve_pending(pending_id, owner, project_id, decision)
        except KeyError:
            raise HTTPException(404, "Pending operation not found")
        operation = resolved.get("operation") or {}
        summary = operation.get("summary") or operation.get("tool") or "operation"
        if decision == "reject":
            save_project_message(project_id, owner, "tool", f"rejected: {summary}", resolved)
            return {"status": "reject", "pending_id": pending_id}
        block = ToolBlock(operation.get("tool", ""), operation.get("content") or operation.get("command") or "")
        desc, result = await execute_tool_block(block, owner=owner, project_policy=policy, security_context=NO_TOOL_SECURITY_CONTEXT)
        save_project_message(project_id, owner, "tool", desc, {**resolved, **result})
        return {"status": "approve", "pending_id": pending_id, "result": result}

    return router
