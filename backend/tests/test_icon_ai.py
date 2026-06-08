import json
import pytest
from unittest.mock import AsyncMock, patch

from services.icon_ai import generate_icon_variants


class _Resp:
    def __init__(self, content): self._c = content
    def raise_for_status(self): pass
    def json(self):
        return {"choices": [{"message": {"content": self._c}}], "usage": {}}


@pytest.mark.asyncio
async def test_parses_potted_and_bare_from_llm_json():
    payload = json.dumps({
        "potted_svg": '<svg viewBox="0 0 100 100"></svg>',
        "bare_svg": '<svg viewBox="0 0 100 100"></svg>',
        "cat": "flower",
    })
    with patch("services.icon_ai.httpx.AsyncClient") as cli:
        inst = cli.return_value.__aenter__.return_value
        inst.post = AsyncMock(return_value=_Resp("```json\n" + payload + "\n```"))
        out = await generate_icon_variants(name="Roos", sci="Rosa")
    assert out["cat"] == "flower"
    assert out["potted_svg"].startswith("<svg")
    assert out["bare_svg"].startswith("<svg")
