"""Council of High Intelligence routes.

Serves the council member roster (the 18 persona files from the
`/council` skill) so the browser-side Council tool can present a
member+model picker and inject persona instructions into each seat's
prompt. Persona files live outside the repo (typically
`~/.codex/skills/council/agents/`); they contain no secrets — only
persona prose and metadata — so reading them is safe. No raw tool
inputs are stored.
"""
import os
import re
import logging
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, Request

from src.auth_helpers import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/council", tags=["council"])

# Candidate locations for the council agents directory, in priority order.
# `ODYSSEUS_COUNCIL_AGENTS_DIR` env var wins if set.
def _candidate_agent_dirs() -> List[Path]:
    env = os.environ.get("ODYSSEUS_COUNCIL_AGENTS_DIR")
    candidates: List[Path] = []
    if env:
        candidates.append(Path(env).expanduser())
    home = Path.home()
    candidates.append(home / ".codex" / "skills" / "council" / "agents")
    # Repo-local fallbacks (for bundled installs / worktrees)
    candidates.append(Path("data/skills/council/agents"))
    candidates.append(Path("agents"))
    return candidates


def _find_agents_dir() -> Path | None:
    for d in _candidate_agent_dirs():
        try:
            if d.is_dir():
                return d
        except OSError:
            continue
    return None


_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)$", re.DOTALL)


def _parse_scalar(value: str) -> Any:
    v = value.strip()
    if len(v) >= 2 and v[0] in "\"'" and v[-1] == v[0]:
        return v[1:-1]
    if v.lower() in ("true", "false"):
        return v.lower() == "true"
    return v


def _parse_inline_list(value: str) -> List[str]:
    v = value.strip()
    if v.startswith("[") and v.endswith("]"):
        v = v[1:-1]
    items = []
    for part in re.split(r",(?![^\[\]]*\])", v):
        p = part.strip()
        if not p:
            continue
        # strip surrounding quotes
        if len(p) >= 2 and p[0] in "\"'" and p[-1] == p[0]:
            p = p[1:-1]
        items.append(p)
    return items


def _parse_frontmatter(text: str) -> Dict[str, Any]:
    """Minimal YAML-subset parser for the flat + one-nested-block frontmatter
    the council persona files use. Avoids a hard `yaml` dependency at import
    time (the route degrades gracefully if persona files are missing)."""
    fm: Dict[str, Any] = {}
    current_nest: str | None = None
    for raw in text.splitlines():
        if not raw.strip():
            continue
        # Indented line under a nested key (e.g. `  figure: Socrates`)
        if current_nest and raw[:1].isspace() and ":" in raw:
            key, _, val = raw.strip().partition(":")
            key = key.strip()
            val = val.strip()
            if val.startswith("["):
                fm[current_nest][key] = _parse_inline_list(val)
            elif val == "":
                # Deeper nest (not used by council personas) — flatten as empty dict
                fm[current_nest][key] = {}
            else:
                fm[current_nest][key] = _parse_scalar(val)
            continue
        # Dedent → close the nested block
        if current_nest and not raw[:1].isspace():
            current_nest = None
        key, _, val = raw.partition(":")
        key = key.strip()
        if not key or key == "---":
            continue
        val = val.strip()
        if val == "":
            # Beginning of a nested block
            current_nest = key
            fm[key] = {}
            continue
        if val.startswith("["):
            fm[key] = _parse_inline_list(val)
        else:
            fm[key] = _parse_scalar(val)
    return fm


def _load_member(path: Path) -> Dict[str, Any] | None:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as e:
        logger.warning("council: cannot read %s: %s", path, e)
        return None
    m = _FRONTMATTER_RE.match(text)
    if not m:
        return None
    fm_raw, body = m.group(1), m.group(2)
    fm = _parse_frontmatter(fm_raw)
    council = fm.get("council") if isinstance(fm.get("council"), dict) else {}
    name = str(fm.get("name", path.stem.replace("council-", "")))
    member_id = name.replace("council-", "").strip().lower()
    return {
        "id": member_id,
        "name": member_id,
        "figure": str(council.get("figure", member_id)),
        "domain": str(council.get("domain", "")),
        "polarity": str(council.get("polarity", "")),
        "color": str(council.get("color", fm.get("color", "gray"))),
        "model_hint": str(fm.get("model", "")),
        "provider_affinity": council.get("provider_affinity", []) if isinstance(council.get("provider_affinity"), list) else [],
        "triads": council.get("triads", []) if isinstance(council.get("triads"), list) else [],
        "profiles": council.get("profiles", []) if isinstance(council.get("profiles"), list) else [],
        "polarity_pairs": council.get("polarity_pairs", []) if isinstance(council.get("polarity_pairs"), list) else [],
        "description": str(fm.get("description", "")),
        "persona": body.strip(),
    }


# Static triad/profile tables mirror the /council SKILL.md so the UI can offer
# preset panels even if the skill file itself isn't installed.
TRIADS: Dict[str, List[str]] = {
    "architecture": ["aristotle", "ada", "feynman"],
    "strategy": ["sun-tzu", "machiavelli", "aurelius"],
    "ethics": ["aurelius", "socrates", "lao-tzu"],
    "debugging": ["feynman", "socrates", "ada"],
    "innovation": ["ada", "lao-tzu", "aristotle"],
    "conflict": ["socrates", "machiavelli", "aurelius"],
    "complexity": ["lao-tzu", "aristotle", "ada"],
    "risk": ["sun-tzu", "aurelius", "feynman"],
    "shipping": ["torvalds", "musashi", "feynman"],
    "product": ["torvalds", "machiavelli", "watts"],
    "founder": ["musashi", "sun-tzu", "torvalds"],
    "ai": ["karpathy", "sutskever", "ada"],
    "ai-product": ["karpathy", "torvalds", "machiavelli"],
    "ai-safety": ["sutskever", "aurelius", "socrates"],
    "decision": ["kahneman", "munger", "aurelius"],
    "systems": ["meadows", "lao-tzu", "aristotle"],
    "uncertainty": ["taleb", "sun-tzu", "sutskever"],
    "design": ["rams", "torvalds", "watts"],
    "economics": ["munger", "machiavelli", "sun-tzu"],
    "bias": ["kahneman", "socrates", "watts"],
}

PROFILES: Dict[str, List[str]] = {
    "classic": ["aristotle", "socrates", "sun-tzu", "ada", "aurelius", "machiavelli",
                "lao-tzu", "feynman", "torvalds", "musashi", "watts", "karpathy",
                "sutskever", "kahneman", "meadows", "munger", "taleb", "rams"],
    "exploration-orthogonal": ["socrates", "feynman", "sun-tzu", "machiavelli", "ada",
                               "lao-tzu", "aurelius", "torvalds", "karpathy", "sutskever",
                               "kahneman", "meadows"],
    "execution-lean": ["torvalds", "feynman", "sun-tzu", "aurelius", "ada"],
}


def setup_council_routes():
    @router.get("/members")
    def list_members(request: Request):
        """Return the council roster with persona bodies + preset tables.

        Owner scope: this is static persona data with no secrets, so it is
        not user-scoped. Auth is still required (the route inherits the
        app's auth middleware) — only logged-in users can read it.
        """
        _ = get_current_user(request)  # asserts auth
        agents_dir = _find_agents_dir()
        members: List[Dict[str, Any]] = []
        if agents_dir:
            for p in sorted(agents_dir.glob("council-*.md")):
                member = _load_member(p)
                if member:
                    members.append(member)
        members.sort(key=lambda m: m["id"])
        return {
            "available": agents_dir is not None,
            "members": members,
            "triads": TRIADS,
            "profiles": PROFILES,
        }

    return router
