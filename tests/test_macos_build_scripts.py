from pathlib import Path


def test_legacy_macos_app_script_delegates_to_standalone_builder():
    script = Path("build-macos-app.sh").read_text(encoding="utf-8")

    assert "build-macos-bundle.sh" in script
    assert "venv/bin/uvicorn" not in script
    assert "INSTALL_DIR=\"__INSTALL_DIR__\"" not in script


def test_macos_bundle_build_falls_back_to_direct_icns_conversion():
    script = Path("build-macos-bundle.sh").read_text(encoding="utf-8")

    assert "iconutil -c icns" in script
    assert "sips -s format icns" in script
    assert "continuing without icon" not in script
