# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for a self-contained macOS .app bundle (onedir).

Build with:
    .venv/bin/python -m PyInstaller Odysseus-mac.spec --noconfirm

Produces dist/Odysseus.app — a portable onedir bundle embedding the Python
interpreter, all installed deps, static assets, MCP servers, and config
scaffolding. User data (SQLite, logs, Chroma, fastembed cache) lives in
~/.odysseus/data via src/runtime_paths.py (frozen-aware), so the .app is
read-only and movable to /Applications.

onedir (not onefile): the EXE stays small and binaries/datas lay out as real
files under Odysseus.app/Contents/MacOS/. Faster startup, no temp extraction,
and the pattern PyInstaller supports going forward (onefile+.app is deprecated
and becomes a hard error in v7).
"""
import os
from PyInstaller.utils.hooks import (
    collect_submodules,
    collect_data_files,
    collect_dynamic_libs,
)

block_cipher = None

# --- Hidden imports: PyInstaller can't see dynamic/plugin imports, so name them. ---
hiddenimports = []
# Heavy / plugin-heavy packages — pull every submodule so nothing is missed
# at runtime when frozen.
for pkg in (
    "chromadb",
    "onnxruntime",
    "fastembed",
    "mcp",
    "caldav",
    "icalendar",
    "cryptography",
    "bcrypt",
    "qrcode",
    "pyotp",
    "croniter",
    "markdown",
    "nh3",
    "dateutil",
    "dotenv",
    "uvicorn",
    "pydantic",
    "pydantic_settings",
    "sqlalchemy",
    "fastapi",
    "starlette",
    "httpx",
    "httpcore",
    "anyio",
    "h11",
    "huggingface_hub",
    "tokenizers",
    "numpy",
    "bs4",
    "pypdf",
    "charset_normalizer",
    # Desktop window (native WKWebView on macOS).
    "webview",
    "webview.platforms",
    "objc",
    "Foundation",
    "AppKit",
    "Cocoa",
    "WebKit",
    "Quartz",
    "CoreFoundation",
    "CoreGraphics",
):
    try:
        hiddenimports += collect_submodules(pkg)
    except Exception:
        hiddenimports.append(pkg)

# Specifically-named modules the dynamic collectors sometimes miss.
hiddenimports += [
    "uvicorn.logging",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
    "sqlite3",
    "bcrypt._bcrypt",
    "onnxruntime.capi._pybind_state",
]

# --- Package data / binaries ---
datas = []
datas += collect_data_files("chromadb")
datas += collect_data_files("fastembed")
datas += collect_data_files("onnxruntime")
datas += collect_data_files("huggingface_hub")
datas += collect_data_files("tokenizers", include_py_files=False)
datas += collect_data_files("nh3")
datas += collect_data_files("markdown_it_py", include_py_files=False)
datas += collect_dynamic_libs("onnxruntime")
datas += collect_dynamic_libs("tokenizers")
datas += collect_dynamic_libs("bcrypt")
# pywebview + pyobjc: bundle frameworks metadata, bridgesupport, dylibs.
for _pkg in ("webview", "objc", "Cocoa", "WebKit", "AppKit", "Foundation",
             "Quartz", "CoreFoundation", "CoreGraphics"):
    try:
        datas += collect_data_files(_pkg)
        datas += collect_dynamic_libs(_pkg)
    except Exception:
        pass

# --- App data: static assets, scripts, MCP servers, config scaffold, hwfit data. ---
ROOT = os.path.abspath(SPECPATH)  # noqa: F821  (SPECPATH is provided by PyInstaller)


def _add_tree(rel, dest=None):
    src = os.path.join(ROOT, rel)
    if os.path.isdir(src):
        datas.append((src, dest or rel))


_add_tree("static")
_add_tree("scripts")
_add_tree("mcp_servers")
_add_tree("config")
_add_tree("services/hwfit/data", "services/hwfit/data")
# Tools Hub manifests (src/tools_platform/manifests/*.json) — PyInstaller only
# grabs .py modules, so the JSON catalog must be bundled explicitly or the
# Tools Hub ships empty in the .app.
_add_tree("src/tools_platform/manifests", "src/tools_platform/manifests")
# Codex + Claude skill integration bundles (referenced via get_app_root()).
_add_tree("integrations", "integrations")
for f in (".env.example", "THREAT_MODEL.md"):
    p = os.path.join(ROOT, f)
    if os.path.isfile(p):
        datas.append((p, "."))

# --- Optional deps (lazy-loaded by the app). Only bundled if installed. ---
for opt in ("markitdown", "fitz", "faster_whisper", "ddgs", "pystray", "PIL"):
    try:
        hiddenimports += collect_submodules(opt)
        datas += collect_data_files(opt)
    except Exception:
        pass

_ICON = os.path.join(ROOT, "build", "odysseus.icns") if os.path.exists(
    os.path.join(ROOT, "build", "odysseus.icns")
) else None

a = Analysis(
    ["desktop_main.py"],
    pathex=[ROOT],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter_test", "test", "tests"],
    noarchive=False,
    optimize=0,
    cipher=block_cipher,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# --- onedir: tiny EXE + COLLECT lays the payload out as real files. ---
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Odysseus",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=_ICON,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="Odysseus",
)

app = BUNDLE(
    coll,
    name="Odysseus.app",
    icon=_ICON,
    bundle_identifier="com.odysseus.app",
    info_plist={
        "CFBundleName": "Odysseus",
        "CFBundleDisplayName": "Odysseus",
        "CFBundleShortVersionString": "1.0.0",
        "CFBundleVersion": "1.0.0",
        "CFBundlePackageType": "APPL",
        "LSMinimumSystemVersion": "11.0",
        "NSHighResolutionCapable": True,
        "LSUIElement": False,
        "NSMicrophoneUsageDescription": "Odysseus uses the microphone for local speech-to-text (optional).",
        "NSCameraUsageDescription": "Odysseus uses the camera for native browser tools (optional).",
        "LSEnvironment": {
            "APP_BIND": "127.0.0.1",
            "APP_PORT": "7000",
        },
    },
)
