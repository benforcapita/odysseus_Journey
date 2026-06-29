from pathlib import Path


def test_desktop_window_uses_loading_html_not_url():
    source = Path("desktop_main.py").read_text(encoding="utf-8")

    assert "html=_LOADING_HTML" in source
    assert '"Odysseus", _LOADING_HTML' not in source


def test_desktop_main_enables_projects_and_exposes_native_bridge():
    """The Projects surface is mac-app-first: desktop_main.py must set the
    desktop flag (so /api/projects/* routes are available) and expose a
    NativeBridge (pick_folder/pick_file/reveal_in_finder) on the webview
    window so the UI can obtain real filesystem paths the browser cannot."""
    source = Path("desktop_main.py").read_text(encoding="utf-8")

    # Desktop flag enables the Projects routes (they 503 without it).
    assert 'os.environ.setdefault("ODYSSEUS_DESKTOP_APP", "1")' in source
    assert 'os.environ.setdefault("AUTH_ENABLED", "false")' in source

    # Native bridge methods the Projects UI calls.
    assert "class NativeBridge:" in source
    assert "def pick_folder(self):" in source
    assert "def pick_file(self):" in source
    assert "def reveal_in_finder(self, path: str):" in source

    # The bridge is handed to the webview window so window.pywebview.api exists.
    assert "js_api=NativeBridge()" in source

    # Native launches are marked even when no saved session token exists; the
    # frontend uses this to show desktop-only UI and unregister stale PWA cache.
    assert 'f"{URL}?desktop=1"' in source
