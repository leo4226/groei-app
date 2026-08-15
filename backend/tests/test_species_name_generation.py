"""`_generate_names` and the reasoning-model token budget.

The admin panel's "Backfill Dutch & English names" tool reported

    Ligustrum vulgare — Could not generate the name
    LLM returned empty content:

for ordinary, common plants. Nothing was wrong with the species: wilde
liguster is a hedge in half the streets in Amsterdam, and the model knows it
perfectly well. The request was wrong. `_generate_names` asked for
max_tokens=300, sized against the answer (~50 tokens of JSON), but LLM_MODEL is
DeepSeek V4 Pro — a reasoning model that spends max_tokens on reasoning *before*
writing `content`. The budget ran out mid-thought and the call came back empty.

These tests pin the two halves of the fix: a budget with room to think, and a
salvage path plus an error message that says what actually happened.
"""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import species_service


def _response(payload: dict) -> MagicMock:
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.json = MagicMock(return_value=payload)
    return resp


def _client_returning(payload: dict) -> MagicMock:
    client = MagicMock()
    client.post = AsyncMock(return_value=_response(payload))
    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(return_value=client)
    ctx.__aexit__ = AsyncMock(return_value=False)
    return ctx, client


NAMES_JSON = json.dumps({
    "slug": "ligustrum-vulgare",
    "latin_name": "Ligustrum vulgare",
    "common_name_nl": "Wilde liguster",
    "common_name_en": "Wild privet",
})


@pytest.mark.asyncio
async def test_asks_for_a_budget_a_reasoning_model_can_think_within():
    ctx, client = _client_returning({
        "choices": [{"message": {"content": NAMES_JSON}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 80, "completion_tokens": 40},
    })
    with patch("species_service.httpx.AsyncClient", return_value=ctx):
        result = await species_service._generate_names("Ligustrum vulgare")

    assert result["common_name_nl"] == "Wilde liguster"
    sent = client.post.call_args.kwargs["json"]
    # 300 was the answer's size. Reasoning is billed out of the same budget, so
    # the ceiling has to cover the thinking too — a call that answers in 50
    # tokens still only costs 50.
    assert sent["max_tokens"] >= 4000, (
        "a reasoning model needs headroom above the answer length"
    )


@pytest.mark.asyncio
async def test_recovers_the_answer_from_the_reasoning_block():
    """When the budget still runs out, the answer is usually already written."""
    ctx, _ = _client_returning({
        "choices": [{
            "message": {
                "content": None,
                "reasoning": (
                    "Ligustrum vulgare is the wild privet. In Dutch that is "
                    'wilde liguster. So: {"slug": "ligustrum-vulgare", '
                    '"common_name_nl": "Wilde liguster", '
                    '"common_name_en": "Wild privet"}'
                ),
            },
            "finish_reason": "length",
        }],
        "usage": {},
    })
    with patch("species_service.httpx.AsyncClient", return_value=ctx):
        result = await species_service._generate_names("Ligustrum vulgare")

    assert result["common_name_nl"] == "Wilde liguster"
    assert result["common_name_en"] == "Wild privet"


@pytest.mark.asyncio
async def test_empty_content_error_names_the_cause():
    """The old message sent us looking at the plant instead of the request."""
    ctx, _ = _client_returning({
        "choices": [{"message": {"content": ""}, "finish_reason": "length"}],
        "usage": {},
    })
    with patch("species_service.httpx.AsyncClient", return_value=ctx):
        with pytest.raises(json.JSONDecodeError) as excinfo:
            await species_service._generate_names("Ligustrum vulgare")

    message = str(excinfo.value)
    assert "finish_reason=length" in message
    assert "max_tokens" in message, "the error should point at the fix"


@pytest.mark.asyncio
async def test_empty_content_without_a_length_stop_does_not_blame_the_budget():
    ctx, _ = _client_returning({
        "choices": [{"message": {"content": ""}, "finish_reason": "content_filter"}],
        "usage": {},
    })
    with patch("species_service.httpx.AsyncClient", return_value=ctx):
        with pytest.raises(json.JSONDecodeError) as excinfo:
            await species_service._generate_names("Ligustrum vulgare")

    message = str(excinfo.value)
    assert "finish_reason=content_filter" in message
    assert "max_tokens" not in message


@pytest.mark.asyncio
async def test_strips_a_markdown_fence_around_the_json():
    ctx, _ = _client_returning({
        "choices": [{"message": {"content": f"```json\n{NAMES_JSON}\n```"},
                     "finish_reason": "stop"}],
        "usage": {},
    })
    with patch("species_service.httpx.AsyncClient", return_value=ctx):
        result = await species_service._generate_names("Ligustrum vulgare")

    assert result["latin_name"] == "Ligustrum vulgare"
