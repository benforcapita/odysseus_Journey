from pathlib import Path


def test_desktop_window_uses_loading_html_not_url():
    source = Path("desktop_main.py").read_text(encoding="utf-8")

    assert "html=_LOADING_HTML" in source
    assert '"Odysseus", _LOADING_HTML' not in source
