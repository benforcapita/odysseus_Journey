"""Tools API — registry listing, search, run lifecycle, and persistence."""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from core.database import SessionLocal, ToolRun, Document, DocumentVersion
from src.auth_helpers import get_current_user
from src.tools_platform.history import (
    complete_run,
    create_run,
    get_user_runs,
)
from src.tools_platform.manifest import ToolRegistry

router = APIRouter(prefix="/api/tools", tags=["tools"])

# Lazy-loaded registry singleton
_registry: Optional[ToolRegistry] = None


def _get_registry() -> ToolRegistry:
    global _registry
    if _registry is None:
        _registry = ToolRegistry.load_default()
    return _registry


def _get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── request models ────────────────────────────────────────────────────

class CreateRunRequest(BaseModel):
    tool_id: str
    operation: str = ""
    settings: dict = {}


class CompleteRunRequest(BaseModel):
    status: str = "completed"
    output_metadata: Optional[dict] = None
    error: Optional[str] = None
    saved: bool = False


class PersistArtifactRequest(BaseModel):
    artifact: dict


# ── registry endpoints ────────────────────────────────────────────────

@router.get("")
def list_tools(q: Optional[str] = None):
    registry = _get_registry()
    if q:
        tools = registry.search(q)
    else:
        tools = registry.list_tools()
    return [t.model_dump() for t in tools]


# NOTE: /runs routes must be registered before /{tool_id}
# to avoid "runs" being captured as a tool_id parameter.

@router.post("/runs", status_code=201)
def start_run(body: CreateRunRequest, request: Request, db=Depends(_get_db)):
    owner = get_current_user(request) or "default"
    run = create_run(
        db,
        tool_id=body.tool_id,
        owner=owner,
        operation=body.operation,
        settings=body.settings,
    )
    db.commit()
    return {
        "id": run.id,
        "tool_id": run.tool_id,
        "owner": run.owner,
        "operation": run.operation,
        "status": run.status,
        "settings": run.settings,
        "created_at": run.created_at.isoformat() if run.created_at else None,
    }


@router.get("/runs")
def list_runs(request: Request, db=Depends(_get_db), limit: int = 50):
    owner = get_current_user(request) or "default"
    runs = get_user_runs(db, owner=owner, limit=limit)
    return [
        {
            "id": r.id,
            "tool_id": r.tool_id,
            "owner": r.owner,
            "operation": r.operation,
            "status": r.status,
            "settings": r.settings,
            "output_metadata": r.output_metadata,
            "error": r.error,
            "saved": r.saved,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in runs
    ]


@router.patch("/runs/{run_id}")
def finish_run(run_id: str, body: CompleteRunRequest, request: Request, db=Depends(_get_db)):
    owner = get_current_user(request) or "default"
    run = db.get(ToolRun, run_id)
    if run is None or run.owner != owner:
        raise HTTPException(status_code=404, detail="Run not found")
    result = complete_run(
        db,
        run_id,
        status=body.status,
        output_metadata=body.output_metadata,
        error=body.error,
        saved=body.saved,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Run not found")
    db.commit()
    return {
        "id": result.id,
        "tool_id": result.tool_id,
        "owner": result.owner,
        "status": result.status,
        "output_metadata": result.output_metadata,
        "error": result.error,
        "saved": result.saved,
    }


@router.post("/runs/{run_id}/persist")
def persist_artifact(run_id: str, body: PersistArtifactRequest, request: Request, db=Depends(_get_db)):
    """Persist a text artifact to the Library and mark the run as saved."""
    owner = get_current_user(request) or "default"
    run = db.get(ToolRun, run_id)
    if run is None or run.owner != owner:
        raise HTTPException(status_code=404, detail="Run not found")

    artifact = body.artifact
    doc_id = str(uuid.uuid4())
    ver_id = str(uuid.uuid4())

    doc = Document(
        id=doc_id,
        session_id=None,
        title=artifact.get("name", "untitled"),
        language="plaintext",
        current_content=artifact.get("text", ""),
        version_count=1,
        is_active=True,
        owner=owner,
    )
    db.add(doc)

    ver = DocumentVersion(
        id=ver_id,
        document_id=doc_id,
        version_number=1,
        content=artifact.get("text", ""),
        summary="Created by " + (run.tool_id or "tool"),
        source="tool",
    )
    db.add(ver)

    run.saved = True
    db.commit()

    return {"id": doc.id, "title": doc.title}


@router.get("/{tool_id}")
def get_tool(tool_id: str):
    registry = _get_registry()
    tool = registry.get(tool_id)
    if tool is None:
        raise HTTPException(status_code=404, detail="Tool not found")
    return tool.model_dump()
