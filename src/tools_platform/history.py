"""Run lifecycle, owner scoping, and expiration for the Tools Platform."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, List

from sqlalchemy.orm import Session

from core.database import ToolRun


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def create_run(
    db: Session,
    *,
    tool_id: str,
    owner: str,
    operation: str = "",
    settings: dict | None = None,
) -> ToolRun:
    run = ToolRun(
        id=str(uuid.uuid4()),
        tool_id=tool_id,
        owner=owner,
        operation=operation,
        status="running",
        settings=settings or {},
    )
    db.add(run)
    db.flush()
    return run


def complete_run(
    db: Session,
    run_id: str,
    *,
    status: str = "completed",
    output_metadata: dict | None = None,
    error: str | None = None,
    saved: bool = False,
) -> ToolRun | None:
    run = db.get(ToolRun, run_id)
    if run is None:
        return None
    run.status = status
    if output_metadata is not None:
        run.output_metadata = output_metadata
    if error is not None:
        run.error = error
    if saved:
        run.saved = True
    db.flush()
    return run


def get_user_runs(
    db: Session,
    *,
    owner: str,
    limit: int = 50,
) -> List[ToolRun]:
    return (
        db.query(ToolRun)
        .filter(ToolRun.owner == owner)
        .order_by(ToolRun.created_at.desc())
        .limit(limit)
        .all()
    )


def expire_temporary_runs(db: Session, *, ttl_hours: int = 24) -> int:
    cutoff = _utcnow() - timedelta(hours=ttl_hours)
    deleted = (
        db.query(ToolRun)
        .filter(
            ToolRun.saved == False,  # noqa: E712
            ToolRun.created_at < cutoff,
        )
        .delete(synchronize_session="fetch")
    )
    db.flush()
    return deleted
