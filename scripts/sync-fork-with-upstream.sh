#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/sync-fork-with-upstream.sh [branch] [upstream_remote] [fork_remote]

Fetch a branch from the main repository, fast-forward the local branch, and
push it to the fork.

Defaults:
  branch           current branch, or ODYSSEUS_SYNC_BRANCH
  upstream_remote  upstream, or ODYSSEUS_UPSTREAM_REMOTE
  fork_remote      origin, or ODYSSEUS_FORK_REMOTE

Example:
  scripts/sync-fork-with-upstream.sh main upstream origin
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: $repo_root is not a git work tree." >&2
  exit 1
fi

upstream_remote="${2:-${ODYSSEUS_UPSTREAM_REMOTE:-upstream}}"
fork_remote="${3:-${ODYSSEUS_FORK_REMOTE:-origin}}"

git remote get-url "$upstream_remote" >/dev/null
git remote get-url "$fork_remote" >/dev/null

branch="${1:-${ODYSSEUS_SYNC_BRANCH:-$(git symbolic-ref --short HEAD)}}"
if [[ -z "$branch" ]]; then
  echo "Error: could not determine branch. Pass one explicitly." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: Working tree is not clean. Commit or stash changes before syncing." >&2
  exit 1
fi

echo "Fetching $upstream_remote/$branch..."
git fetch "$upstream_remote" "$branch"

echo "Checking out $branch..."
git checkout "$branch"

echo "Fast-forwarding $branch from $upstream_remote/$branch..."
git merge --ff-only "$upstream_remote/$branch"

echo "Pushing $branch to $fork_remote..."
git push "$fork_remote" "$branch:$branch"

echo "Done. $fork_remote/$branch is synced with $upstream_remote/$branch."
