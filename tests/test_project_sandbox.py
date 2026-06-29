from src.project_sandbox import resolve_and_check


def test_allows_paths_inside_project(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    target = root / "app.py"
    target.write_text("print('hi')", encoding="utf-8")

    resolved, error = resolve_and_check("app.py", str(root), [], "read")
    assert error is None
    assert resolved == str(target.resolve())


def test_blocks_parent_escape(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    outside = tmp_path / "secret.txt"
    outside.write_text("secret", encoding="utf-8")

    resolved, error = resolve_and_check("../secret.txt", str(root), [], "read")
    assert resolved is None
    assert "outside the project sandbox" in error


def test_blocks_symlink_escape(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    outside = tmp_path / "secret.txt"
    outside.write_text("secret", encoding="utf-8")
    (root / "link.txt").symlink_to(outside)

    resolved, error = resolve_and_check("link.txt", str(root), [], "read")
    assert resolved is None
    assert "outside the project sandbox" in error


def test_linked_file_read_only(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    linked = tmp_path / "shared.txt"
    linked.write_text("shared", encoding="utf-8")
    links = [{"path": str(linked), "kind": "file", "mode": "ro"}]

    resolved, error = resolve_and_check(str(linked), str(root), links, "read")
    assert error is None
    assert resolved == str(linked.resolve())

    resolved, error = resolve_and_check(str(linked), str(root), links, "write")
    assert resolved is None
    assert "read-only linked path" in error


def test_linked_folder_read_write(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    shared = tmp_path / "shared"
    shared.mkdir()
    target = shared / "note.md"
    links = [{"path": str(shared), "kind": "folder", "mode": "rw"}]

    resolved, error = resolve_and_check(str(target), str(root), links, "write")
    assert error is None
    assert resolved == str(target.resolve())
