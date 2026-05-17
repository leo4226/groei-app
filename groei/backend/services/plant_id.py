"""Pl@ntNet API client for plant identification.

Wraps the free Pl@ntNet identify endpoint. Pure (stateless, no DB),
reads PLANTNET_API_KEY from env at import.
"""
from dataclasses import dataclass


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
