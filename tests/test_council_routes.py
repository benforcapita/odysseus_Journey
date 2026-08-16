"""Tests for the Council tool backend route (member roster + persona parsing)."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes.council_routes import setup_council_routes, _find_agents_dir, _load_member


def _app():
    a = FastAPI()
    a.include_router(setup_council_routes())
    return a


def test_members_endpoint_returns_roster_with_personas():
    client = TestClient(_app())
    r = client.get("/api/council/members")
    assert r.status_code == 200, r.text
    data = r.json()
    # Either the skill is installed (18 personas) or the route degrades to
    # an empty list — both are valid. If personas are present, validate shape.
    if data["members"]:
        for m in data["members"]:
            for k in ("id", "name", "figure", "domain", "color", "model_hint",
                      "provider_affinity", "triads", "profiles", "polarity_pairs",
                      "description", "persona"):
                assert k in m, (m.get("id"), k)
        # IDs are unique and lowercased
        ids = [m["id"] for m in data["members"]]
        assert len(ids) == len(set(ids))
        assert all(i == i.lower() for i in ids)
    # Preset tables are always present (static).
    assert "triads" in data and "profiles" in data
    assert data["triads"]["architecture"] == ["aristotle", "ada", "feynman"]
    assert len(data["profiles"]["classic"]) == 18


def test_load_member_parses_nested_frontmatter_lists():
    d = _find_agents_dir()
    if d is None:
        # Skill not installed in this environment — skip the persona-specific
        # assertions; the route still serves the static preset tables.
        return
    socrates = None
    for p in sorted(d.glob("council-*.md")):
        m = _load_member(p)
        if m and m["id"] == "socrates":
            socrates = m
            break
    assert socrates is not None, "socrates persona not found"
    assert socrates["figure"] == "Socrates"
    assert "ethics" in socrates["triads"]
    assert socrates["provider_affinity"] == ["anthropic"]
    assert len(socrates["persona"]) > 100
