import os
from typing import Literal

Mode = Literal["read", "write"]


def _real(path: str) -> str:
    return os.path.realpath(os.path.expanduser(path))


def _is_under(path: str, root: str) -> bool:
    try:
        normalized_path = os.path.normcase(path)
        normalized_root = os.path.normcase(root)
        return os.path.commonpath([normalized_path, normalized_root]) == normalized_root
    except ValueError:
        return False


def _outside_error(raw: str) -> str:
    return f"Path '{raw}' is outside the project sandbox. Ask the user to link it."


def resolve_and_check(
    path: str,
    project_root: str,
    linked_paths: list[dict],
    mode: Mode,
) -> tuple[str | None, str | None]:
    """Resolve a project path and enforce project-root or linked-path access."""
    raw = (path or "").strip()
    if not raw:
        return None, "Path is required"

    root = _real(project_root)
    expanded = os.path.expanduser(raw)
    candidate = expanded if os.path.isabs(expanded) else os.path.join(root, expanded)
    resolved = _real(candidate)

    if resolved == root or _is_under(resolved, root):
        return resolved, None

    for item in linked_paths or []:
        link_path = item.get("path")
        if not link_path:
            continue

        link_root = _real(str(link_path))
        link_kind = item.get("kind")
        if link_kind == "file":
            allowed = resolved == link_root
        else:
            allowed = resolved == link_root or _is_under(resolved, link_root)

        if not allowed:
            continue

        if mode == "write" and item.get("mode", "ro") != "rw":
            return None, f"Path '{raw}' is a read-only linked path"
        return resolved, None

    return None, _outside_error(raw)
