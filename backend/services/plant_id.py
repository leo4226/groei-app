"""Pl@ntNet API client for plant identification.

Wraps the free Pl@ntNet identify endpoint. Pure (stateless, no DB),
reads PLANTNET_API_KEY from env at import.
"""
import os
from dataclasses import dataclass

import httpx


@dataclass
class IdCandidate:
    """A single species candidate returned by Pl@ntNet."""
    scientific_name: str
    scientific_authorship: str | None
    common_names: list[str]
    confidence: float                # 0.0 – 1.0
    genus: str | None
    family: str | None
    plantnet_image_url: str | None   # Often None — PlantNet's default endpoint omits images.


class PlantIdQuotaExceeded(Exception):
    """Raised when Pl@ntNet returns HTTP 429 (daily quota hit)."""


class PlantIdServiceError(Exception):
    """Raised when Pl@ntNet is unreachable or returns a non-2xx, non-429 status."""


_PLANTNET_URL = "https://my-api.plantnet.org/v2/identify/all"


async def _post_plantnet(
    image_bytes: bytes, organs: list[str], api_key: str, lang: str = "en"
) -> httpx.Response:
    """Single seam for the HTTP call — patchable in tests.

    Note: httpx 0.28 on Python 3.14 raises "Attempted to send a sync request
    with an AsyncClient instance" when files are passed as a list-of-tuples;
    the dict form below works. v1 only sends one image and one organ value,
    so dict-keyed form is sufficient. Multi-image / multi-organ would need
    a manually-constructed multipart body and is out of scope.
    """
    primary_organ = organs[0] if organs else "auto"
    async with httpx.AsyncClient(timeout=30.0) as client:
        return await client.post(
            _PLANTNET_URL,
            params={"api-key": api_key, "lang": lang},
            files={"images": ("plant.jpg", image_bytes, "image/jpeg")},
            data={"organs": primary_organ},
        )


def _extract_nested_name(obj) -> str | None:
    """genus and family are sub-objects keyed by scientificNameWithoutAuthor."""
    if isinstance(obj, dict):
        return obj.get("scientificNameWithoutAuthor")
    return None


def _parse_candidate(result: dict) -> IdCandidate:
    """Convert one Pl@ntNet result entry into an IdCandidate.

    PlantNet's default /identify/all endpoint does not include images in
    results, so plantnet_image_url is always None for v1.
    """
    species = result.get("species") or {}
    return IdCandidate(
        scientific_name=species.get("scientificNameWithoutAuthor", ""),
        scientific_authorship=species.get("scientificNameAuthorship") or None,
        common_names=species.get("commonNames") or [],
        confidence=float(result.get("score", 0.0)),
        genus=_extract_nested_name(species.get("genus")),
        family=_extract_nested_name(species.get("family")),
        plantnet_image_url=None,  # PlantNet default endpoint omits images
    )


async def identify(
    image_bytes: bytes,
    organs: list[str] | None = None,
    max_results: int = 5,
    lang: str = "en",
) -> list[IdCandidate]:
    """Identify a plant from one image via Pl@ntNet.

    `lang` controls the language of `commonNames` returned by PlantNet
    (supported: en, fr, de, es, it, pt, nl, ...). Unknown codes fall back to en.

    Raises:
        PlantIdQuotaExceeded: HTTP 429 from Pl@ntNet.
        PlantIdServiceError: any other non-2xx response, missing API key,
            or network failure.
    """
    api_key = os.environ.get("PLANTNET_API_KEY", "")
    if not api_key:
        raise PlantIdServiceError("PLANTNET_API_KEY not set")
    organs = organs or ["auto"]

    try:
        response = await _post_plantnet(image_bytes, organs, api_key, lang=lang)
    except httpx.RequestError as e:
        raise PlantIdServiceError(f"network error: {e}") from e

    if response.status_code == 429:
        raise PlantIdQuotaExceeded("Pl@ntNet daily quota exhausted")
    if response.status_code == 404:
        return []  # Plantnet returns 404 when no plant is recognised — not a service error
    if response.status_code >= 400:
        raise PlantIdServiceError(f"Pl@ntNet returned {response.status_code}")

    payload = response.json()
    results = payload.get("results") or []
    candidates = [_parse_candidate(r) for r in results]
    candidates.sort(key=lambda c: c.confidence, reverse=True)
    return candidates[:max_results]
