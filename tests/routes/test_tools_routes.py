"""Tests for /api/tools endpoints — registry listing, search, runs, and completion."""

import os
import sys
import tempfile

import pytest

from core.database import Base
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker


@pytest.fixture
def db_path():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    yield path
    try:
        os.unlink(path)
    except OSError:
        pass


@pytest.fixture
def engine(db_path):
    eng = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=eng)
    return eng


@pytest.fixture
def client(engine):
    """Create FastAPI test client with a test DB session."""
    # Remove cached routes module so it picks up our patch
    sys.modules.pop("routes.tools_routes", None)

    TestSM = sessionmaker(bind=engine)

    import routes.tools_routes as mod
    # Set the SessionLocal BEFORE routes use it in Depends
    mod.SessionLocal = TestSM

    from fastapi import FastAPI
    app = FastAPI()

    @app.middleware("http")
    async def _fake_auth(request, call_next):
        request.state.current_user = request.headers.get("X-Test-Owner", "alice")
        response = await call_next(request)
        return response

    app.include_router(mod.router)

    from fastapi.testclient import TestClient
    with TestClient(app) as c:
        yield c


# ── tests ────────────────────────────────────────────────────────────

def test_list_tools_returns_five(client):
    resp = client.get("/api/tools")
    assert resp.status_code == 200
    data = resp.json()
    ids = {t["id"] for t in data}
    assert ids == {"json-formatter", "image-resizer", "pdf-toolkit", "pii-redactor", "qr-generator"}


def test_search_tools_by_query(client):
    resp = client.get("/api/tools?q=json")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert data[0]["id"] == "json-formatter"


def test_list_tools_never_returns_raw_manifest_internals(client):
    resp = client.get("/api/tools")
    for tool in resp.json():
        assert "capabilities" not in tool or isinstance(tool.get("capabilities"), list)


def test_get_tool_by_id(client):
    resp = client.get("/api/tools/json-formatter")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "json-formatter"
    assert data["name"] == "JSON Formatter"
    assert "operations" in data


def test_get_tool_not_found(client):
    resp = client.get("/api/tools/nonexistent")
    assert resp.status_code == 404


def test_create_run(client):
    payload = {"tool_id": "json-formatter", "operation": "pretty-print", "settings": {"indent": 4}}
    resp = client.post("/api/tools/runs", json=payload, headers={"X-Test-Owner": "alice"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["tool_id"] == "json-formatter"
    assert data["status"] == "running"
    assert data["owner"] == "alice"
    assert "id" in data


def test_complete_run(client):
    c = client.post("/api/tools/runs", json={"tool_id": "qr-generator"}, headers={"X-Test-Owner": "bob"})
    run = c.json()

    resp = client.patch(
        f"/api/tools/runs/{run['id']}",
        json={"status": "completed", "output_metadata": {"kind": "image"}},
        headers={"X-Test-Owner": "bob"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"


def test_complete_run_not_found(client):
    resp = client.patch("/api/tools/runs/nonexistent-id", json={"status": "completed"})
    assert resp.status_code == 404


def test_get_user_runs_owner_isolation(client):
    c1 = client.post("/api/tools/runs", json={"tool_id": "json-formatter"}, headers={"X-Test-Owner": "alice"})
    c2 = client.post("/api/tools/runs", json={"tool_id": "qr-generator"}, headers={"X-Test-Owner": "bob"})

    resp = client.get("/api/tools/runs", headers={"X-Test-Owner": "alice"})
    alice_run_ids = {r["id"] for r in resp.json()}
    assert c1.json()["id"] in alice_run_ids
    assert c2.json()["id"] not in alice_run_ids


def test_runs_never_expose_raw_input(client):
    resp = client.get("/api/tools/runs", headers={"X-Test-Owner": "alice"})
    for run in resp.json():
        assert "input_body" not in run
        assert "input_data" not in run
        assert "raw_input" not in run
