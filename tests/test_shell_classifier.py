import pytest

from src.project_approval import classify_shell_command


@pytest.mark.parametrize("cmd", ["ls", "git status", "npm test", "cat app.py", "echo hi > note.txt"])
def test_static_shell_commands(cmd):
    result = classify_shell_command(cmd)
    assert result.static is True
    assert result.reason == ""


@pytest.mark.parametrize("cmd", ["eval $X", "cat `pwd`", "echo $(whoami)", "source .env", ". .env", "exec bash", "env TOKEN=$(cat x) npm test"])
def test_non_static_shell_commands(cmd):
    result = classify_shell_command(cmd)
    assert result.static is False
    assert result.reason
