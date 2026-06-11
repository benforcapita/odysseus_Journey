from pathlib import Path
import pytest
from src.tools_platform.manifest import ManifestError, ToolRegistry


def test_default_registry_loads_thirty_tools():
    registry = ToolRegistry.load_default()
    tools = registry.list_tools()
    assert len(tools) == 30
    ids = {t.id for t in tools}
    # Verify the original 5 and some of the new ones
    assert ids >= {
        "json-formatter", "image-resizer", "pdf-toolkit",
        "pii-redactor", "qr-generator",
        "base64", "url-encoder", "uuid-generator",
        "hash-generator", "password-generator",
    }
    # Search should find json tools
    search_results = {t.id for t in registry.search("json")}
    assert search_results >= {"json-formatter", "json-csv"}


def test_registry_rejects_invalid_capabilities(tmp_path: Path):
    (tmp_path / "bad.json").write_text(
        '{"id":"bad","version":1,"name":"Bad","category":"Data",'
        '"description":"bad","keywords":[],"entrypoint":"/bad.js",'
        '"execution_modes":["browser"],"capabilities":["root"],"operations":[]}',
        encoding="utf-8",
    )
    with pytest.raises(ManifestError, match="Unknown capability"):
        ToolRegistry.load(tmp_path)


def test_registry_rejects_duplicate_ids(tmp_path: Path):
    body = ('{"id":"same","version":1,"name":"Same","category":"Data",'
            '"description":"same","keywords":[],"entrypoint":"/same.js",'
            '"execution_modes":["browser"],"capabilities":[],"operations":[]}')
    (tmp_path / "a.json").write_text(body, encoding="utf-8")
    (tmp_path / "b.json").write_text(body, encoding="utf-8")
    with pytest.raises(ManifestError, match="Duplicate tool id"):
        ToolRegistry.load(tmp_path)
