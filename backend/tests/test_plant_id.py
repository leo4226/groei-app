"""Unit tests for the Pl@ntNet identification service."""
import json
from pathlib import Path
from unittest.mock import patch, AsyncMock

import httpx
import pytest

from services.plant_id import IdCandidate, PlantIdQuotaExceeded, PlantIdServiceError, identify


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "plantnet_response.json"


@pytest.fixture
def plantnet_payload():
    """Real recorded PlantNet response."""
    with FIXTURE_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def test_id_candidate_dataclass_fields():
    """IdCandidate exposes the documented fields."""
    c = IdCandidate(
        scientific_name="Monstera deliciosa",
        scientific_authorship="Liebm.",
        common_names=["Swiss cheese plant"],
        confidence=0.89,
        genus="Monstera",
        family="Araceae",
        plantnet_image_url="https://bs.plantnet.org/image/o/abc.jpg",
    )
    assert c.scientific_name == "Monstera deliciosa"
    assert c.confidence == 0.89
    assert c.common_names == ["Swiss cheese plant"]


def test_id_candidate_accepts_none_image_url():
    """plantnet_image_url is commonly None (PlantNet doesn't return images by default)."""
    c = IdCandidate(
        scientific_name="Cortaderia selloana",
        scientific_authorship=None,
        common_names=["Pampas Grass"],
        confidence=0.95,
        genus="Cortaderia",
        family="Poaceae",
        plantnet_image_url=None,
    )
    assert c.plantnet_image_url is None


def test_exceptions_are_distinct():
    """Quota and service error are separate exception classes."""
    assert issubclass(PlantIdQuotaExceeded, Exception)
    assert issubclass(PlantIdServiceError, Exception)
    assert not issubclass(PlantIdQuotaExceeded, PlantIdServiceError)
    assert not issubclass(PlantIdServiceError, PlantIdQuotaExceeded)


@pytest.mark.asyncio
async def test_identify_parses_top_candidates(plantnet_payload):
    """identify() returns IdCandidate list ranked by confidence."""
    mock_response = httpx.Response(200, json=plantnet_payload)
    with patch.dict("os.environ", {"PLANTNET_API_KEY": "test-key"}):
        with patch("services.plant_id._post_plantnet", new=AsyncMock(return_value=mock_response)):
            candidates = await identify(b"fake-image-bytes")

    assert len(candidates) > 0
    # Sorted by confidence descending
    for prev, curr in zip(candidates, candidates[1:]):
        assert prev.confidence >= curr.confidence
    # First candidate has the expected shape
    top = candidates[0]
    assert isinstance(top.scientific_name, str) and len(top.scientific_name) > 0
    assert isinstance(top.confidence, float) and 0.0 <= top.confidence <= 1.0
    assert isinstance(top.common_names, list)
    # PlantNet's default endpoint omits images — should be None.
    assert top.plantnet_image_url is None


@pytest.mark.asyncio
async def test_identify_respects_max_results(plantnet_payload):
    """max_results truncates the candidate list."""
    mock_response = httpx.Response(200, json=plantnet_payload)
    with patch.dict("os.environ", {"PLANTNET_API_KEY": "test-key"}):
        with patch("services.plant_id._post_plantnet", new=AsyncMock(return_value=mock_response)):
            candidates = await identify(b"img", max_results=2)
    assert len(candidates) <= 2


@pytest.mark.asyncio
async def test_identify_raises_on_429():
    """HTTP 429 raises PlantIdQuotaExceeded."""
    mock_response = httpx.Response(429, json={"message": "Quota exceeded"})
    with patch.dict("os.environ", {"PLANTNET_API_KEY": "test-key"}):
        with patch("services.plant_id._post_plantnet", new=AsyncMock(return_value=mock_response)):
            with pytest.raises(PlantIdQuotaExceeded):
                await identify(b"img")


@pytest.mark.asyncio
async def test_identify_raises_on_5xx():
    """HTTP 5xx raises PlantIdServiceError."""
    mock_response = httpx.Response(503, text="Service Unavailable")
    with patch.dict("os.environ", {"PLANTNET_API_KEY": "test-key"}):
        with patch("services.plant_id._post_plantnet", new=AsyncMock(return_value=mock_response)):
            with pytest.raises(PlantIdServiceError):
                await identify(b"img")


@pytest.mark.asyncio
async def test_identify_raises_on_network_failure():
    """httpx RequestError surfaces as PlantIdServiceError."""
    async def boom(*a, **kw):
        raise httpx.ConnectError("network down")
    with patch.dict("os.environ", {"PLANTNET_API_KEY": "test-key"}):
        with patch("services.plant_id._post_plantnet", new=boom):
            with pytest.raises(PlantIdServiceError):
                await identify(b"img")


@pytest.mark.asyncio
async def test_identify_returns_empty_when_no_results():
    """Pl@ntNet returning empty results gives empty list, not None or raise."""
    mock_response = httpx.Response(200, json={"results": [], "remainingIdentificationRequests": 499})
    with patch.dict("os.environ", {"PLANTNET_API_KEY": "test-key"}):
        with patch("services.plant_id._post_plantnet", new=AsyncMock(return_value=mock_response)):
            candidates = await identify(b"img")
    assert candidates == []


@pytest.mark.asyncio
async def test_identify_raises_when_api_key_missing():
    """No PLANTNET_API_KEY in env → PlantIdServiceError before any HTTP call."""
    with patch.dict("os.environ", {}, clear=True):
        with pytest.raises(PlantIdServiceError):
            await identify(b"img")
