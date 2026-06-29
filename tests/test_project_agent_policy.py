import pytest

from src.tool_execution import ProjectPolicy, execute_tool_block
from src.agent_tools import ToolBlock  # noqa: E402  (import first to avoid circular)


@pytest.mark.asyncio
async def test_project_read_uses_project_workspace(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    (root / "app.py").write_text("print('hi')", encoding="utf-8")
    policy = ProjectPolicy(
        project_id="p1",
        owner="alice",
        project_root=str(root),
        linked_paths=[],
        auto_approve=True,
    )

    desc, result = await execute_tool_block(
        ToolBlock("read_file", "app.py"), owner="alice", project_policy=policy
    )

    assert result["exit_code"] == 0
    assert "print('hi')" in result["output"]


@pytest.mark.asyncio
async def test_project_write_requires_pending_when_auto_approve_off(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    policy = ProjectPolicy(
        project_id="p1",
        owner="alice",
        project_root=str(root),
        linked_paths=[],
        auto_approve=False,
    )

    desc, result = await execute_tool_block(
        ToolBlock("write_file", "app.py\nprint('hi')"),
        owner="alice",
        project_policy=policy,
    )

    assert result["pending"] is True
    assert result["operation"]["tool"] == "write_file"
    assert not (root / "app.py").exists()


@pytest.mark.asyncio
async def test_project_static_bash_auto_approve_runs_in_project_home(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    policy = ProjectPolicy(
        project_id="p1",
        owner="alice",
        project_root=str(root),
        linked_paths=[],
        auto_approve=True,
    )

    desc, result = await execute_tool_block(
        ToolBlock("bash", "pwd"), owner="alice", project_policy=policy
    )

    assert result["exit_code"] == 0
    assert str(root) in result["output"]


@pytest.mark.asyncio
async def test_project_non_static_bash_forces_pending_even_auto_approve(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    policy = ProjectPolicy(
        project_id="p1",
        owner="alice",
        project_root=str(root),
        linked_paths=[],
        auto_approve=True,
    )

    desc, result = await execute_tool_block(
        ToolBlock("bash", "echo $(pwd)"), owner="alice", project_policy=policy
    )

    assert result["pending"] is True
    assert result["operation"]["tool"] == "bash"
