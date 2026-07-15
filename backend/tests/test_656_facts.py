"""Tests for #656: reasoning-model fact generation."""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

# ── unit: _extract_fact_json_from_reasoning ──

def test_extract_fact_json_from_reasoning_finds_last_match():
    from species_service import _extract_fact_json_from_reasoning

    reasoning = (
        'Some reasoning...\n'
        '{"fact_nl": "eerste", "fact_en": "first"}'
        'more text\n'
        '{"fact_nl": "tweede", "fact_en": "second"}'
    )
    result = _extract_fact_json_from_reasoning(reasoning)
    parsed = json.loads(result)
    assert parsed == {"fact_nl": "tweede", "fact_en": "second"}


def test_extract_fact_json_from_reasoning_raises_when_no_match():
    from species_service import _extract_fact_json_from_reasoning

    with pytest.raises(ValueError, match="No usable fact JSON"):
        _extract_fact_json_from_reasoning("just some text, no JSON here")


# ── null-content fallback ──

@pytest.mark.asyncio
async def test_generate_fact_falls_back_to_reasoning_when_content_null(monkeypatch):
    import species_service

    monkeypatch.setattr(species_service, "LLM_API_KEY", "test-key")
    monkeypatch.setattr(species_service, "LLM_CHAT_URL", "http://test")
    monkeypatch.setattr(species_service, "LLM_MODEL", "test-model")

    reasoning = (
        'Some thinking...\n'
        '{"fact_nl": "Bamboe NL", "fact_en": "Bamboo EN"}'
    )

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "choices": [{
            "message": {
                "content": None,
                "reasoning": reasoning,
            }
        }]
    }
    mock_resp.raise_for_status = MagicMock()

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_resp)

    with patch("httpx.AsyncClient", return_value=mock_client):
        from species_service import generate_fact_for_species
        result = await generate_fact_for_species("Bamboo", "Fargesia nitida")

    assert result == {"fact_nl": "Bamboe NL", "fact_en": "Bamboo EN"}
