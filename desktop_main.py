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
        min_size=(900, 600), text_select=False,
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
        target = f"{URL}?desktop_token={token}" if token else URL
        while time.time() < deadline:
            if _server_http_ready():
                try:
                    window.load_url(target)
                except Exception:
                    pass
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
