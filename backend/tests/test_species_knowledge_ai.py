"""The AI species-knowledge fallback must not 500 when the LLM returns null/empty
content (DeepSeek V4 Flash reasoning can consume the whole token budget)."""
import asyncio

from services.species_knowledge import _fetch_ai_species


def _patch(monkeypatch, payload):
    async def fake_post(*a, **kw):
        class R:
            status_code = 200
            def json(self):
                return payload
        return R()
    monkeypatch.setattr("services.species_knowledge.LLM_API_KEY", "test-key")
    monkeypatch.setattr("httpx.AsyncClient.post", fake_post)


def test_null_content_returns_none(monkeypatch):
    _patch(monkeypatch, {"choices": [{"message": {"content": None}}]})
    assert asyncio.run(_fetch_ai_species("Ficus lyrata")) is None


def test_empty_content_returns_none(monkeypatch):
    _patch(monkeypatch, {"choices": [{"message": {"content": "   "}}]})
    assert asyncio.run(_fetch_ai_species("Ficus lyrata")) is None


def test_valid_content_parses(monkeypatch):
    _patch(monkeypatch, {"choices": [{"message": {"content":
        '{"common_name":"Fiddle-leaf fig","family":"Moraceae","light_label":"partial"}'}}]})
    out = asyncio.run(_fetch_ai_species("Ficus lyrata"))
    assert out and out["common_name"] == "Fiddle-leaf fig"
