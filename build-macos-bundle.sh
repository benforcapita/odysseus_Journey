#!/bin/bash
# Build a self-contained macOS .app for Odysseus (no Docker, no repo venv).
#
#   ./build-macos-bundle.sh
#
# Produces:
#   dist/Odysseus.app   — portable PyInstaller bundle (embeds Python + deps).
#   dist/Odysseus.dmg   — drag-to-Applications disk image.
#
# Requires outbound network (to pip-install PyInstaller + optional deps on
# first run). After that the build is fully local. User data lives in
# ~/.odysseus/data (SQLite, logs, Chroma, fastembed cache) — the .app itself
# is read-only and safe to move to /Applications.
#
# Optional features (markitdown / PyMuPDF / faster-whisper / ddgs / pystray)
# are installed if missing and bundled automatically.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

# Use .venv — it already has full chromadb + fastembed + onnxruntime + the
# auth/calendar/crypto stack. `venv` only has chromadb-client (degraded RAG).
VENV="${ODYSSEUS_VENV:-.venv}"
PY="$REPO_DIR/$VENV/bin/python"
PIP="$REPO_DIR/$VENV/bin/pip"
DIST="$REPO_DIR/dist"
BUILD="$REPO_DIR/build"

echo "▶ Using venv: $VENV ($($PY --version 2>&1))"

if [ ! -x "$PY" ]; then
  echo "✗ $VENV not found. Run: python3 -m venv $VENV && $VENV/bin/pip install -r requirements.txt"
  exit 1
fi

# ── 1. Install build + optional deps (network needed, idempotent). ──
echo "▶ Ensuring PyInstaller + optional deps are installed (network needed)…"
"$PIP" install --quiet --upgrade pip
"$PIP" install --quiet pyinstaller
# Native desktop window: pywebview renders the UI in a real WKWebView window
# on macOS (no browser dependency, UI lives inside the .app). Pulls pyobjc.
"$PIP" install --quiet pywebview 2>&1 | tail -3 || echo "  (pywebview install failed — window UI needs it)"
# Optional deps the app imports lazily; bundling them = full feature surface.
"$PIP" install --quiet \
  "markitdown[docx,pptx,xlsx,xls]==0.1.6" \
  PyMuPDF \
  faster-whisper \
  ddgs \
  pystray 2>&1 | tail -3 || echo "  (some optional deps failed — app degrades gracefully)"
echo "  pyinstaller: $("$PY" -m PyInstaller --version 2>&1)"

# ── 2. Icon (.icns) — convert the PWA's icon-512.png to a macOS .icns. ──
ICON="$BUILD/odysseus.icns"
mkdir -p "$BUILD"
# Source: the PWA's own 512x512 icon (static/icon-512.png) so the Mac app
# icon matches the installed-PWA icon the user already sees. Already square,
# so skip the center-crop and convert straight to .icns. Always regen so a
# source-icon change propagates on the next build.
PWA_ICON="$REPO_DIR/static/icon-512.png"
rm -f "$ICON"
# Build a proper multi-resolution .icns via an .iconset + iconutil. Direct
# `sips -s format icns` is unreliable across macOS versions; iconutil is the
# canonical, always-works path. Source is the PWA's 512x512 icon (matches the
# installed-PWA icon), upscaled to 1024 for the @2x slots.
SRC_ICON=""
if [ -f "$PWA_ICON" ]; then
  SRC_ICON="$PWA_ICON"
elif [ -f "$REPO_DIR/docs/odysseus.jpg" ]; then
  echo "▶ PWA icon not found — falling back to docs/odysseus.jpg"
  _tmp="$(mktemp -d)"
  sips -c 720 720 "$REPO_DIR/docs/odysseus.jpg" --out "$_tmp/sq.png" >/dev/null 2>&1 || cp "$REPO_DIR/docs/odysseus.jpg" "$_tmp/sq.png"
  sips -z 512 512 "$_tmp/sq.png" --out "$_tmp/icon.png" >/dev/null 2>&1
  SRC_ICON="$_tmp/icon.png"
fi
if [ -n "$SRC_ICON" ] && command -v iconutil >/dev/null 2>&1 && command -v sips >/dev/null 2>&1; then
  echo "▶ Generating icon from $SRC_ICON"
  ICONSET="$(mktemp -d)/Odysseus.iconset"
  mkdir -p "$ICONSET"
  sips -z 16 16     "$SRC_ICON" --out "$ICONSET/icon_16x16.png"        >/dev/null 2>&1
  sips -z 32 32     "$SRC_ICON" --out "$ICONSET/icon_16x16@2x.png"     >/dev/null 2>&1
  sips -z 32 32     "$SRC_ICON" --out "$ICONSET/icon_32x32.png"        >/dev/null 2>&1
  sips -z 64 64     "$SRC_ICON" --out "$ICONSET/icon_32x32@2x.png"     >/dev/null 2>&1
  sips -z 128 128   "$SRC_ICON" --out "$ICONSET/icon_128x128.png"      >/dev/null 2>&1
  sips -z 256 256   "$SRC_ICON" --out "$ICONSET/icon_128x128@2x.png"   >/dev/null 2>&1
  sips -z 256 256   "$SRC_ICON" --out "$ICONSET/icon_256x256.png"      >/dev/null 2>&1
  sips -z 512 512   "$SRC_ICON" --out "$ICONSET/icon_256x256@2x.png"  >/dev/null 2>&1
  sips -z 512 512   "$SRC_ICON" --out "$ICONSET/icon_512x512.png"      >/dev/null 2>&1
  sips -z 1024 1024 "$SRC_ICON" --out "$ICONSET/icon_512x512@2x.png"   >/dev/null 2>&1
  iconutil -c icns "$ICONSET" -o "$ICON" >/dev/null 2>&1 || echo "  (iconutil failed — continuing without icon)"
  rm -rf "$(dirname "$ICONSET")"
else
  echo "  (icon tools unavailable — continuing without icon)"
fi

# ── 3. Pre-flight: app imports cleanly. ──
echo "▶ Pre-flight import check"
"$PY" -c "from app import app; print('  routes:', len(app.routes))" 2>&1 | tail -2
"$PY" -c "import webview, importlib.metadata as m; print('  pywebview:', m.version('pywebview'))" 2>&1 | tail -2 || echo "  (pywebview import check failed — build will continue, may break later)"

# ── 4. PyInstaller build. ──
echo "▶ Building .app bundle (this takes a few minutes)…"
rm -rf "$DIST/Odysseus.app" "$DIST/Odysseus" "$BUILD/Odysseus"
"$PY" -m PyInstaller Odysseus-mac.spec --noconfirm --workpath "$BUILD" --distpath "$DIST" 2>&1 | tail -40

if [ ! -d "$DIST/Odysseus.app" ]; then
  echo "✗ Build failed — dist/Odysseus.app not produced"
  exit 1
fi

# ── 5. Ad-hoc sign (local-only; Gatekeeper one-time right-click-open). ──
if command -v codesign >/dev/null 2>&1; then
  echo "▶ Ad-hoc signing"
  codesign --force --deep --sign - "$DIST/Odysseus.app" >/dev/null 2>&1 || echo "  (codesign failed — continuing)"
fi

echo "▶ Bundle size: $(du -sh "$DIST/Odysseus.app" | cut -f1)"

# ── 6. .dmg (drag-to-Applications). ──
if command -v hdiutil >/dev/null 2>&1; then
  echo "▶ Packaging dist/Odysseus.dmg"
  STAGE="$(mktemp -d)/dmg"
  mkdir -p "$STAGE"
  cp -R "$DIST/Odysseus.app" "$STAGE/"
  ln -s /Applications "$STAGE/Applications"
  rm -f "$DIST/Odysseus.dmg"
  hdiutil create -volname "Odysseus" -srcfolder "$STAGE" -ov -format UDZO "$DIST/Odysseus.dmg" >/dev/null
  rm -rf "$STAGE"
fi

echo ""
echo "✓ Done:"
echo "  $DIST/Odysseus.app"
echo "  $DIST/Odysseus.dmg"
echo ""
echo "Run:      open '$DIST/Odysseus.app'"
echo "Install:  open '$DIST/Odysseus.dmg'  (drag Odysseus to Applications)"
echo "Data:     ~/.odysseus/data  (SQLite, logs, Chroma, fastembed cache)"
echo ""
echo "UI:        native WKWebView window (no browser needed)"
echo "First run downloads the fastembed ONNX embedding model (~50MB) to"
echo "~/.odysseus/data/fastembed_cache — needs network the first time only."
