"""Manifest validation, loading, and search for the Native Tools Platform."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from pydantic import BaseModel, ValidationError

# ── Capability allowlist ──────────────────────────────────────────────
ALLOWED_CAPABILITIES = frozenset({
    "file-read",
    "file-write",
    "network",
    "ai-transmission",
    "camera",
    "microphone",
    "clipboard-read",
    "clipboard-write",
    "overwrite",
})


class ManifestError(Exception):
    """A manifest or registry-level validation error."""


# ── Pydantic models ───────────────────────────────────────────────────

class OperationSchema(BaseModel):
    id: str
    label: str
    description: str = ""


class ToolManifest(BaseModel):
    id: str
    version: int
    name: str
    category: str
    description: str
    keywords: List[str] = []
    icon: str = "tool"
    entrypoint: str
    execution_modes: List[str] = ["browser"]
    capabilities: List[str] = []
    risk: str = "low"
    requires_confirmation: bool = False
    accepted_artifacts: List[str] = []
    produced_artifacts: List[str] = []
    default_persistence: str = "none"
    output_routing: str = "download"
    agent_available: bool = False
    agent_discovery_text: str = ""
    invocation_schema: Dict[str, Any] = {}
    operations: List[OperationSchema] = []


# ── Registry ──────────────────────────────────────────────────────────

class ToolRegistry:
    """Loads, validates, and searches manifests from a directory."""

    def __init__(self, tools: List[ToolManifest]) -> None:
        self._tools: Dict[str, ToolManifest] = {}
        for tool in tools:
            if tool.id in self._tools:
                raise ManifestError(f"Duplicate tool id: {tool.id}")
            self._tools[tool.id] = tool

    @classmethod
    def load(cls, directory: Path) -> "ToolRegistry":
        if not directory.is_dir():
            raise ManifestError(f"Manifest directory not found: {directory}")
        manifests: List[ToolManifest] = []
        seen_ids: set = set()
        for file_path in sorted(directory.glob("*.json")):
            try:
                data = json.loads(file_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                raise ManifestError(
                    f"Invalid JSON in {file_path.name}: {exc}"
                ) from exc

            # Validate capabilities before Pydantic parsing
            caps = data.get("capabilities", [])
            for cap in caps:
                if cap not in ALLOWED_CAPABILITIES:
                    raise ManifestError(
                        f"Unknown capability '{cap}' in {file_path.name}. "
                        f"Allowed: {sorted(ALLOWED_CAPABILITIES)}"
                    )

            try:
                tool = ToolManifest(**data)
            except ValidationError as exc:
                raise ManifestError(
                    f"Invalid manifest {file_path.name}: {exc}"
                ) from exc

            if tool.id in seen_ids:
                raise ManifestError(f"Duplicate tool id: {tool.id}")
            seen_ids.add(tool.id)
            manifests.append(tool)

        return cls(manifests)

    @classmethod
    def load_default(cls) -> "ToolRegistry":
        """Load manifests from the bundled catalog directory."""
        manifests_dir = Path(__file__).resolve().parent / "manifests"
        return cls.load(manifests_dir)

    def list_tools(self) -> List[ToolManifest]:
        return list(self._tools.values())

    def get(self, tool_id: str) -> ToolManifest | None:
        return self._tools.get(tool_id)

    def search(self, query: str) -> List[ToolManifest]:
        q = query.lower()
        results: List[ToolManifest] = []
        for tool in self._tools.values():
            score = 0
            if q in tool.id.lower():
                score += 10
            if q in tool.name.lower():
                score += 8
            if q in tool.description.lower():
                score += 4
            if q in tool.category.lower():
                score += 3
            for kw in tool.keywords:
                if q in kw.lower():
                    score += 5
                    break
            if score > 0:
                results.append((score, tool))
        results.sort(key=lambda x: x[0], reverse=True)
        return [t for _, t in results]
