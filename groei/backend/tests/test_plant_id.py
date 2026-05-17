"""Unit tests for the Pl@ntNet identification service."""
import pytest
from services.plant_id import IdCandidate, PlantIdQuotaExceeded, PlantIdServiceError


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
