"""Tests for per-user tool-run lifecycle, scoping, and expiration."""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from core.database import Base, ToolRun
from src.tools_platform.history import (
    create_run,
    complete_run,
    get_user_runs,
    expire_temporary_runs,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@pytest.fixture
def db_session() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    with Session(engine) as session:
        yield session


def test_create_and_complete_run(db_session: Session):
    run = create_run(
        db_session,
        tool_id="json-formatter",
        owner="alice",
        operation="pretty-print",
        settings={"indent": 2},
    )
    assert run.id is not None
    assert run.tool_id == "json-formatter"
    assert run.owner == "alice"
    assert run.status == "running"

    complete_run(db_session, run.id, status="completed", output_metadata={"kind": "text"})
    db_session.refresh(run)
    assert run.status == "completed"
    assert run.output_metadata == {"kind": "text"}


def test_owner_isolation(db_session: Session):
    r1 = create_run(db_session, tool_id="qr-generator", owner="alice")
    r2 = create_run(db_session, tool_id="qr-generator", owner="bob")
    complete_run(db_session, r1.id)
    complete_run(db_session, r2.id)

    alice_runs = get_user_runs(db_session, owner="alice")
    assert len(alice_runs) == 1
    assert alice_runs[0].owner == "alice"

    bob_runs = get_user_runs(db_session, owner="bob")
    assert len(bob_runs) == 1
    assert bob_runs[0].owner == "bob"


def test_expire_temporary_runs(db_session: Session):
    r1 = create_run(db_session, tool_id="json-formatter", owner="alice")
    r2 = create_run(db_session, tool_id="qr-generator", owner="alice")

    # Mark r2 as saved (should not expire)
    r2.saved = True

    # Set r1's created_at to 25 hours ago
    old_time = _utcnow() - timedelta(hours=25)
    r1.created_at = old_time

    db_session.flush()

    expire_temporary_runs(db_session, ttl_hours=24)

    # r1 should be deleted
    assert db_session.get(ToolRun, r1.id) is None
    # r2 should survive (saved)
    assert db_session.get(ToolRun, r2.id) is not None


def test_no_raw_input_in_history(db_session: Session):
    """ToolRun must never store source text, image bytes, PDFs, or other raw inputs."""
    run = create_run(db_session, tool_id="pii-redactor", owner="alice")
    # Verify the model has no column for raw input
    columns = {c.name for c in ToolRun.__table__.columns}
    assert "input_body" not in columns
    assert "input_data" not in columns
    assert "raw_input" not in columns
