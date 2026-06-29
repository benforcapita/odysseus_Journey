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
