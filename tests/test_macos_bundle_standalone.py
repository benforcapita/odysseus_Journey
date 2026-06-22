from pathlib import Path

import pytest


def test_macos_app_bundle_contains_pyinstaller_payload():
    app = Path("dist/Odysseus.app")
    if not app.exists():
        pytest.skip("macOS app bundle has not been built")

    executable = app / "Contents/MacOS/Odysseus"
    icon = app / "Contents/Resources/odysseus.icns"
    resources_payload = app / "Contents/Resources"
    internal_payload = app / "Contents/MacOS/_internal"

    assert executable.exists()
    assert executable.read_bytes()[:4] in (b"\xcf\xfa\xed\xfe", b"\xca\xfe\xba\xbe")
    assert icon.is_file()
    assert b"icns" in icon.read_bytes()[:8]
    if (resources_payload / "static/index.html").is_file():
        assert (resources_payload / "src").is_dir()
        assert not internal_payload.exists()
    else:
        assert (internal_payload / "static/index.html").is_file()
        assert (internal_payload / "src").is_dir()
    assert not Path("dist/Odysseus/_internal").exists()
