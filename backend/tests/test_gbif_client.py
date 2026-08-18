"""Unit tests for the shared GBIF client (services/gbif_client.py, #941).

`resolve_latin_name` is exercised with a mocked `fetch_json` so no test ever
touches the real GBIF API. The three outcomes the catalog sync depends on are
covered: resolved (True), unresolved (False), network error (None).
"""
import httpx
import pytest

from services import gbif_client as gbif


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _OkClient:
    """Tiny httpx.AsyncClient stand-in that returns a canned payload."""

    def __init__(self, payload):
        self._payload = payload

    async def get(self, url, params=None):
        return _FakeResponse(self._payload)


@pytest.fixture
def payload(monkeypatch):
    """Fake gbif.fetch_json to return a canned payload; records the call."""

    def _install(result, seen):
        async def _fake(client, url, params=None):
            seen["url"] = url
            seen["params"] = params or {}
            if isinstance(result, Exception):
                raise result
            return result

        monkeypatch.setattr(gbif, "fetch_json", _fake)

    seen = {}
    return lambda result: (_install(result, seen), seen)[1]


@pytest.mark.asyncio
async def test_resolves_matching_canonical_name(payload):
    seen = payload({"results": [
        {"canonicalName": "Rosa canina var. dumalis"},
        {"canonicalName": "Rosa canina"},
    ]})
    assert await gbif.resolve_latin_name(None, "Rosa canina") is True
    assert seen["url"] == gbif.GBIF_SPECIES_SEARCH
    assert seen["params"]["status"] == "ACCEPTED"
    assert seen["params"]["higherTaxonKey"] == gbif.TRACHEOPHYTA_KEY


@pytest.mark.asyncio
async def test_resolves_genus_only_name(payload):
    """Genus-only rows exist legitimately in the catalog ('Monstera')."""
    payload({"results": [{"canonicalName": "Monstera"}]})
    assert await gbif.resolve_latin_name(None, "Monstera") is True


@pytest.mark.asyncio
async def test_resolves_ascii_x_hybrid_marker(payload):
    """GBIF writes '×', the catalog sometimes 'x' — both must match."""
    payload({"results": [{"canonicalName": "Monstera × deliciosa"}]})
    assert await gbif.resolve_latin_name(None, "Monstera x deliciosa") is True


@pytest.mark.asyncio
async def test_misspelled_name_is_unresolved(payload):
    payload({"results": [{"canonicalName": "Rosa canina"}]})
    assert await gbif.resolve_latin_name(None, "Rosa caninna") is False


@pytest.mark.asyncio
async def test_empty_results_are_unresolved(payload):
    payload({"results": []})
    assert await gbif.resolve_latin_name(None, "Totally Madeup Plant") is False


@pytest.mark.asyncio
async def test_network_error_returns_none(payload):
    payload(httpx.ConnectError("boom", request=None))
    assert await gbif.resolve_latin_name(None, "Rosa canina") is None


@pytest.mark.asyncio
async def test_blank_name_is_unresolved_without_a_call(payload):
    seen = payload({"results": []})
    assert await gbif.resolve_latin_name(None, "") is False
    assert await gbif.resolve_latin_name(None, None) is False
    assert "url" not in seen  # fetch_json never called


@pytest.mark.asyncio
async def test_fetch_json_returns_payload(monkeypatch):
    monkeypatch.setattr(gbif, "_MIN_INTERVAL", 0)
    payload = {"results": [{"canonicalName": "Rosa canina"}]}
    result = await gbif.fetch_json(
        _OkClient(payload), gbif.GBIF_SPECIES_SEARCH, {"q": "Rosa canina"}
    )
    assert result == payload


def test_normalize_latin_name():
    assert gbif.normalize_latin_name("  Rosa   canina ") == "rosa canina"
    assert gbif.normalize_latin_name("Monstera × deliciosa") == "monstera x deliciosa"
    assert gbif.normalize_latin_name(None) == ""
    assert gbif.normalize_latin_name("") == ""
