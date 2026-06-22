#!/bin/bash
# Compatibility wrapper. The old launcher app depended on this repo's venv and
# was not standalone; keep one macOS build path.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$REPO_DIR/build-macos-bundle.sh" "$@"
