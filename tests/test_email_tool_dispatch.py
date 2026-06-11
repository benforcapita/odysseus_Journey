import json

import pytest

from src.agent_tools import ToolBlock
from src.tool_execution import execute_tool_block


@pytest.mark.asyncio
async def test_bare_email_tool_routes_to_email_mcp(monkeypatch):
    calls = []

    class FakeMcpManager:
        async def call_tool(self, name, args):
            calls.append((name, args))
            return {"output": "ok", "exit_code": 0}

    monkeypatch.setattr("src.tool_execution.get_mcp_manager", lambda: FakeMcpManager())
    monkeypatch.setattr("src.tool_execution._owner_is_admin", lambda owner: True)

    arguments = {
        "folder": "INBOX",
        "max_results": 1,
        "unread_only": False,
        "account": "gmail",
    }
    description, result = await execute_tool_block(
        ToolBlock("list_emails", json.dumps(arguments)),
        owner="admin",
    )

    assert description == "mcp: mcp__email__list_emails"
    assert result["exit_code"] == 0
    assert calls == [("mcp__email__list_emails", arguments)]
