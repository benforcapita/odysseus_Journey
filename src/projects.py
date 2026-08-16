import os
from datetime import datetime
from typing import Any

from fastapi import HTTPException

from core.database import Project, ProjectMessage, utcnow_naive

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
}


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def canonical_folder(path: str) -> str:
    raw_path = (path or "").strip()
    if not raw_path:
        raise HTTPException(400, "Project folder must be an existing directory")
    resolved = os.path.realpath(os.path.expanduser(raw_path))
    if not resolved or not os.path.isdir(resolved):
        raise HTTPException(400, "Project folder must be an existing directory")
    if os.path.dirname(resolved) == resolved:
        raise HTTPException(400, "Filesystem roots cannot be Projects")
    return resolved


def scrub_project_metadata(metadata: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(metadata, dict):
        return {}
    return {key: value for key, value in metadata.items() if key in _ALLOWED_METADATA_KEYS}


def current_git_branch(folder_path: str) -> str:
    path = os.path.realpath(folder_path)
    while True:
        git_path = os.path.join(path, ".git")
        head_path = os.path.join(git_path, "HEAD")
        if os.path.isfile(git_path):
            try:
                target = open(git_path, encoding="utf-8").read().strip()
            except OSError:
                target = ""
            if target.startswith("gitdir:"):
                head_path = os.path.join(os.path.realpath(target[7:].strip()), "HEAD")
        if os.path.isfile(head_path):
            try:
                head = open(head_path, encoding="utf-8").read().strip()
            except OSError:
                return ""
            return head.removeprefix("ref: refs/heads/") if head.startswith("ref: refs/heads/") else head[:12]
        parent = os.path.dirname(path)
        if parent == path:
            return ""
        path = parent


def project_to_dict(project: Project) -> dict[str, Any]:
    folder_path = os.path.realpath(project.folder_path)
    return {
        "id": project.id,
        "name": project.name,
        "folder_path": folder_path,
        "folder_name": os.path.basename(folder_path),
        "git_branch": current_git_branch(folder_path),
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
        "metadata": scrub_project_metadata(message.meta_data),
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
