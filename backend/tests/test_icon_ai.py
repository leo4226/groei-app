import json
import httpx
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from services import icon_ai
from services.icon_ai import generate_icon_variants


class _Resp:
    def __init__(self, content): self._c = content
    def raise_for_status(self): pass
    def json(self):
        return {"choices": [{"message": {"content": self._c}}], "usage": {}}


@pytest.fixture(autouse=True)
def _configured_key(monkeypatch):
    monkeypatch.setattr(icon_ai, "LLM_API_KEY", "test-key")


def _blocking_client(cli, content):
    """Stub an AsyncClient whose stream is refused, so the blocking path runs.

    These two cases pin the *blocking* branch, which is now the fallback rather
    than the only route (#890). Streaming is covered end to end over a real
    transport in test_icon_ai_stream.py.
    """
    inst = cli.return_value.__aenter__.return_value
    # `client.stream()` is sync and returns the context manager, so an AsyncMock
    # here hands back a coroutine that `async with` cannot enter.
    inst.stream = MagicMock(side_effect=httpx.StreamError("no streaming here"))
    inst.post = AsyncMock(return_value=_Resp(content))


@pytest.mark.asyncio
async def test_parses_plant_fragment_from_llm_json():
    payload = json.dumps({
        "plant_svg": '<g><ellipse cx="50" cy="50" rx="9" ry="9" fill="#4A7C4E"/></g>',
        "cat": "flower",
    })
    with patch("services.icon_ai.httpx.AsyncClient") as cli:
        _blocking_client(cli, "```json\n" + payload + "\n```")
        out = await generate_icon_variants(name="Roos", sci="Rosa")
    assert out["cat"] == "flower"
    assert out["plant_svg"].startswith("<g>")


@pytest.mark.asyncio
async def test_null_content_raises_not_attributeerror():
    # Reasoning model can return content=null when the budget is exhausted; this
    # must raise a clear error (caught upstream -> procedural fallback), not an
    # AttributeError on None.strip().
    with patch("services.icon_ai.httpx.AsyncClient") as cli:
        _blocking_client(cli, None)
        with pytest.raises(ValueError):
            await generate_icon_variants(name="Roos", sci="Rosa")
