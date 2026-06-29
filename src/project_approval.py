"""Pending-approval registry and shell staticness classifier for Projects.

The approval flow generalizes the existing email-tool pending pattern: a
mutating operation (file write/delete, shell command) returns a pending record
instead of executing, the UI renders an approval card, and the user approves or
rejects. Non-static shell commands always route through approval regardless of
``auto_approve`` — the one case where the user always sees the command.

Pending records are in-memory (the agent loop is in-memory via ``agent_runs``);
server restart drops all pendings, and a reconnecting SSE client sees the run
as stopped. A 10-minute TTL bounds orphaned approvals.
"""
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
    """Classify a shell command as statically resolvable or dynamic.

    Static commands can be tokenized with shlex and contain no shell
    expansion, eval/source/exec, or other dynamic control. Non-static
    commands must always go through approval even when auto_approve is on.
    """
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


def create_pending(
    project_id: str,
    owner: str | None,
    operation: dict[str, Any],
    ttl_seconds: int = 600,
) -> dict[str, Any]:
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


def get_pending(
    pending_id: str, owner: str | None, project_id: str
) -> dict[str, Any] | None:
    _purge_expired()
    row = _PENDING.get(pending_id)
    if not row or row["owner"] != owner or row["project_id"] != project_id:
        return None
    return dict(row)


def resolve_pending(
    pending_id: str, owner: str | None, project_id: str, decision: str
) -> dict[str, Any]:
    if decision not in {"approve", "reject"}:
        raise ValueError("decision must be approve or reject")
    row = get_pending(pending_id, owner, project_id)
    if not row:
        raise KeyError(pending_id)
    _PENDING.pop(pending_id, None)
    row["decision"] = decision
    return row
