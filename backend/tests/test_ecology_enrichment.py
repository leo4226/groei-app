"""Tests for the ecology enrichment pipeline."""


def test_from_llm_parses_sun_preference(monkeypatch):
    """_from_llm must parse and validate sun_preference."""
    import asyncio
    from services.ecology_enrichment import _from_llm

    async def fake_post(*a, **kw):
        class R:
            status_code = 200
            def raise_for_status(self): pass
            def json(self):
                return {"choices": [{"message": {"content":
                    '{"native_to_nl": true, "invasive_nl": false, '
                    '"flowering_months": [4,5,6], "pollinator_value": 2, '
                    '"sun_preference": "partial_sun"}'
                }}]}
        return R()

    monkeypatch.setattr("httpx.AsyncClient.post", fake_post)
    result = asyncio.run(_from_llm("Ajuga reptans"))
    assert result.get("sun_preference") == "partial_sun"


def test_from_llm_rejects_invalid_sun_preference(monkeypatch):
    """Invalid sun_preference values must be dropped silently."""
    import asyncio
    from services.ecology_enrichment import _from_llm

    async def fake_post(*a, **kw):
        class R:
            status_code = 200
            def raise_for_status(self): pass
            def json(self):
                return {"choices": [{"message": {"content":
                    '{"native_to_nl": true, "sun_preference": "dappled"}'
                }}]}
        return R()

    monkeypatch.setattr("httpx.AsyncClient.post", fake_post)
    result = asyncio.run(_from_llm("Ajuga reptans"))
    assert "sun_preference" not in result
