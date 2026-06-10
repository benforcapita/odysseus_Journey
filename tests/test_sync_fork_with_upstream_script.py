import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "sync-fork-with-upstream.sh"


def test_sync_script_fetches_upstream_and_pushes_fork(tmp_path):
    log_path = tmp_path / "git.log"
    git_bin = tmp_path / "git"
    git_bin.write_text(
        f"""#!/usr/bin/env bash
printf '%s\\n' "$*" >> {log_path}
case "$1 $2" in
  "symbolic-ref --short") echo main ;;
  "status --porcelain") exit 0 ;;
  "rev-parse --is-inside-work-tree") echo true ;;
  *) exit 0 ;;
esac
""",
        encoding="utf-8",
    )
    git_bin.chmod(0o755)

    env = os.environ.copy()
    env["PATH"] = f"{tmp_path}:{env['PATH']}"

    result = subprocess.run(
        ["bash", str(SCRIPT)],
        cwd=ROOT,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert log_path.read_text(encoding="utf-8").splitlines() == [
        "rev-parse --is-inside-work-tree",
        "remote get-url upstream",
        "remote get-url origin",
        "symbolic-ref --short HEAD",
        "status --porcelain",
        "fetch upstream main",
        "checkout main",
        "merge --ff-only upstream/main",
        "push origin main:main",
    ]


def test_sync_script_refuses_dirty_worktree(tmp_path):
    log_path = tmp_path / "git.log"
    git_bin = tmp_path / "git"
    git_bin.write_text(
        f"""#!/usr/bin/env bash
printf '%s\\n' "$*" >> {log_path}
case "$1 $2" in
  "symbolic-ref --short") echo main ;;
  "status --porcelain") echo " M app.py" ;;
  "rev-parse --is-inside-work-tree") echo true ;;
  *) exit 0 ;;
esac
""",
        encoding="utf-8",
    )
    git_bin.chmod(0o755)

    env = os.environ.copy()
    env["PATH"] = f"{tmp_path}:{env['PATH']}"

    result = subprocess.run(
        ["bash", str(SCRIPT)],
        cwd=ROOT,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )

    assert result.returncode == 1
    assert "Working tree is not clean" in result.stderr
    assert "fetch upstream main" not in log_path.read_text(encoding="utf-8")
