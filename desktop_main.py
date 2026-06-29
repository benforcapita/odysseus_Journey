"""macOS desktop entrypoint — renders the Odysseus UI in a native WKWebView
window, with the FastAPI server running in-process.

Single-instance: an flock on ~/.odysseus/data/.app.lock guarantees only one
Odysseus process runs at a time, so repeated `open` calls (or impatient
double-clicks while the server is warming up) don't spawn a fleet of windows.
The first instance opens a loading window immediately so the user sees
feedback right away, then navigates to the server URL once it's ready.
"""
import multiprocessing
import os
import socket
import sys
import threading
import time
import traceback

# Desktop app: keep users logged in for 90 days (override the 7-day server
# default). Must be set before core.auth is imported by the server thread.
os.environ.setdefault("ODYSSEUS_SESSION_TTL", str(60 * 60 * 24 * 90))
# Desktop app is a loopback-only personal app by default; server/docker
# deployments still default to AUTH_ENABLED=true in app.py.
os.environ.setdefault("AUTH_ENABLED", "false")
# Desktop app: enable desktop-only surfaces (e.g. Projects, which needs a
# real filesystem path and shell access the browser cannot provide).
os.environ.setdefault("ODYSSEUS_DESKTOP_APP", "1")

# PyInstaller + multiprocessing.spawn (macOS default) re-executes the frozen
# exe for worker processes. freeze_support at the very top routes those
# re-executions to the worker instead of re-running this main.
if __name__ == "__main__":
    multiprocessing.freeze_support()

HOST = os.environ.get("APP_BIND", "127.0.0.1")
PORT = int(os.environ.get("APP_PORT", "7000"))
URL = f"http://{HOST}:{PORT}"
STARTUP_TIMEOUT = 180  # first run downloads the fastembed ONNX model — allow 3 min

_DATA_DIR = os.path.join(os.path.expanduser("~"), ".odysseus", "data")
_LOCK_FILE = os.path.join(_DATA_DIR, ".app.lock")
_LOCK_FD = None

_SESSIONS_FILE = os.path.join(_DATA_DIR, "sessions.json")


def _valid_session_token() -> "str | None":
    """Return any non-expired session token from ~/.odysseus/data/sessions.json.

    The macOS .app loads the UI as http://127.0.0.1:PORT/?desktop_token=<token>
    so the server re-establishes the session cookie on every launch, even if
    WKWebView's cookie store didn't persist across relaunches. Once you've
    logged in once on this machine, the desktop app stays logged in.
    """
    try:
        import json, time
        with open(_SESSIONS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        now = time.time()
        for tok, info in data.items():
            if isinstance(info, dict) and info.get("expiry", 0) > now:
                return tok
    except Exception:
        return None
    return None


def _port_open(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=1):
            return True
    except OSError:
        return False


def _acquire_single_instance_lock() -> bool:
    """Return True if we're the primary instance, False if another is running."""
    global _LOCK_FD
    os.makedirs(_DATA_DIR, exist_ok=True)
    import fcntl
    _LOCK_FD = open(_LOCK_FILE, "w")
    try:
        fcntl.flock(_LOCK_FD, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return True
    except OSError:
        # Another instance holds the lock — it owns the window. We exit silently.
        return False


def _start_server_thread() -> threading.Thread:
    def run():
        try:
            import uvicorn
            from app import app
            uvicorn.run(app, host=HOST, port=PORT, log_level="warning")
        except Exception:
            traceback.print_exc()
            os._exit(1)

    t = threading.Thread(target=run, daemon=True)
    t.start()
    return t


class NativeBridge:
    """JS API exposed to the webview frontend via `window.pywebview.api`."""

    def pick_folder(self):
        import webview
        paths = webview.windows[0].create_file_dialog(webview.FOLDER_DIALOG)
        if not paths:
            return {"cancelled": True, "path": ""}
        return {"cancelled": False, "path": os.path.realpath(paths[0])}

    def pick_file(self):
        import webview
        paths = webview.windows[0].create_file_dialog(webview.OPEN_DIALOG)
        if not paths:
            return {"cancelled": True, "path": ""}
        return {"cancelled": False, "path": os.path.realpath(paths[0])}

    def reveal_in_finder(self, path: str):
        resolved = os.path.realpath(os.path.expanduser(path or ""))
        if resolved:
            import subprocess
            subprocess.run(["open", "-R", resolved], check=False)
        return {"ok": True}


_LOADING_HTML = """<!doctype html><html><head><meta charset='utf-8'>
<title>Odysseus</title>
<style>
html,body{margin:0;height:100%;background:#1a1c23;color:#d1d4e0;
font-family:-apple-system,system-ui,sans-serif;display:flex;
flex-direction:column;align-items:center;justify-content:center;gap:18px}
.sail{font-size:46px;animation:bob 2s ease-in-out infinite}
h1{font-size:17px;font-weight:600;margin:0;color:#e06c75}
p{font-size:13px;color:#8b91a3;margin:0}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
</style></head><body>
<div class='sail'>⛵</div>
<h1>Odysseus is starting</h1>
<p>Warming up the background service — first run downloads the embedding model.</p>
</body></html>"""


def _error_html(msg: str) -> str:
    import html
    return f"""<!doctype html><html><head><meta charset='utf-8'>
<title>Odysseus — startup failed</title>
<style>
body{{font-family:-apple-system,system-ui,sans-serif;background:#1a1c23;color:#d1d4e0;
margin:0;padding:48px;line-height:1.5}}
h1{{color:#e06c75;font-size:22px;margin:0 0 12px}}
pre{{background:#22242c;padding:16px;border-radius:8px;overflow:auto;
white-space:pre-wrap;word-break:break-word;font-size:13px;color:#aab2c8}}
</style></head><body>
<h1>Odysseus couldn't start</h1>
<p>The background service didn't come up within {STARTUP_TIMEOUT}s.</p>
<pre>{html.escape(msg)}</pre>
<p>Logs: <code>~/.odysseus/data/logs</code></p>
</body></html>"""


# JS shim that finishes what pywebview's finish.js is supposed to do: populate
# window.pywebview.api.<method> and dispatch pywebviewready. pywebview injects
# api.js (which sets window.pywebview = {api: {}}) at document-start reliably,
# but finish.js is run via evaluateJavaScript from a Python thread that can
# deadlock on window._expose_lock when a navigation (loading page -> server
# page, then sessions.js setting location.hash) interrupts the pending
# completionHandler. When that happens, api.js has already run but _createApi
# never does, so window.pywebview.api stays {} and the Projects rail (which
# waits for window.pywebview.api.pick_folder) never appears. This helper
# detects that state and finishes the job manually, bypassing the lock.
_BRIDGE_SHIM_JS = """
(function(){
  if (!window.pywebview || typeof window.pywebview._createApi !== 'function') return 'pending';
  if (typeof (window.pywebview.api || {}).pick_folder === 'function') return 'already';
  window.pywebview._createApi([
    {func: 'pick_folder', params: []},
    {func: 'pick_file', params: []},
    {func: 'reveal_in_finder', params: ['path']}
  ]);
  try { window.dispatchEvent(new CustomEvent('pywebviewready')); } catch(e){}
  try { document.dispatchEvent(new CustomEvent('pywebviewready')); } catch(e){}
  return 'injected';
})()
"""

def _eval_js_safe(window, script, timeout_s=2.0):
    """Run window.evaluate_js without hanging forever if the webview is
    mid-navigation. evaluate_js blocks on a semaphore until the JS
    completionHandler fires; on cocoa that can stall during navigations.
    Run it in a worker thread with a hard timeout so a stalled call can't
    pin the bridge-injection loop."""
    result = [None]
    err = [None]
    def worker():
        try:
            result[0] = window.evaluate_js(script)
        except Exception as e:
            err[0] = e
    t = threading.Thread(target=worker, daemon=True)
    t.start()
    t.join(timeout_s)
    if t.is_alive():
        return None  # stalled; abandon this attempt, retry later
    if err[0]:
        return None
    return result[0]

def _ensure_native_bridge(window) -> None:
    """After load_url, poll the webview and manually finish pywebview's bridge
    injection if finish.js got stuck. Idempotent: if pywebview's own finish.js
    already populated the api, the shim returns 'already' and does nothing."""
    deadline = time.time() + 30.0
    last = None
    while time.time() < deadline:
        last = _eval_js_safe(window, _BRIDGE_SHIM_JS)
        if last in ('already', 'injected'):
            return
        time.sleep(0.5)
    # Last attempt already made inside the loop; nothing more to do.


def main() -> None:
    if not _acquire_single_instance_lock():
        # Another Odysseus is already running and owns the window. Don't open
        # a second one — just exit. (macOS will activate the existing app if
        # the user clicked the Dock icon; `open` from Terminal is a no-op here.)
        sys.exit(0)

    _start_server_thread()

    import webview
    window = webview.create_window(
        "Odysseus", html=_LOADING_HTML, width=980, height=640,
        min_size=(900, 600), text_select=False, js_api=NativeBridge(),
    )

    def _server_http_ready() -> bool:
        """True only once the server actually returns HTTP 200.

        _port_open returns True as soon as uvicorn accepts the TCP socket,
        which happens BEFORE the FastAPI lifespan finishes — navigating the
        window at that point shows a "page not found" flash. Polling
        /api/health (which uvicorn won't serve until lifespan completes)
        guarantees the UI route is live before we load it.
        """
        import urllib.request, urllib.error
        try:
            with urllib.request.urlopen(f"{URL}/api/health", timeout=2) as r:
                return r.status == 200
        except Exception:
            return False

    def _navigate_when_ready() -> None:
        deadline = time.time() + STARTUP_TIMEOUT
        token = _valid_session_token()
        target = f"{URL}?desktop=1&desktop_token={token}" if token else f"{URL}?desktop=1"
        while time.time() < deadline:
            if _server_http_ready():
                try:
                    window.load_url(target)
                except Exception:
                    pass
                # pywebview's finish.js bridge injection can deadlock if a
                # navigation interrupts it (see _ensure_native_bridge). Patch
                # it up from the Python side so the Projects rail shows up.
                threading.Thread(target=_ensure_native_bridge, args=(window,), daemon=True).start()
                return
            time.sleep(0.5)
        try:
            window.load_html(_error_html(f"Server did not respond on {HOST}:{PORT}"))
        except Exception:
            pass

    threading.Thread(target=_navigate_when_ready, daemon=True).start()

    webview.start()
    # Window closed -> tear everything down.
    os._exit(0)


if __name__ == "__main__":
    main()
