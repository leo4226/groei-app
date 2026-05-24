"""Unit tests for the GBIF eval set fetcher."""
import json
from pathlib import Path

import pytest

from scripts.fetch_eval_set import extract_image_urls

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "gbif_occurrence_response.json"


@pytest.fixture
def gbif_response():
    with FIXTURE_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def test_extract_image_urls_returns_at_most_n(gbif_response):
    """Returns at most `limit` URLs, in order of occurrence."""
    urls = extract_image_urls(gbif_response, limit=3)
    assert len(urls) <= 3
    assert all(isinstance(u, str) and u.startswith("http") for u in urls)


def test_extract_image_urls_skips_records_without_media(gbif_response):
    """Records lacking a `media` array are skipped without erroring; real records still produce URLs."""
    real_results = gbif_response.get("results", [])
    # Inject a no-media record at the head; real records follow
    modified = {"results": [{"key": 999999, "media": []}] + real_results}
    urls_with_dummy = extract_image_urls(modified, limit=3)
    # Should be identical to running without the dummy (the dummy contributes nothing)
    urls_without_dummy = extract_image_urls({"results": real_results}, limit=3)
    assert urls_with_dummy == urls_without_dummy
    assert len(urls_with_dummy) > 0  # the real fixture has real images
    assert all(u.startswith("http") for u in urls_with_dummy)


def test_extract_image_urls_handles_empty_response():
    """Empty results returns empty list, not error."""
    assert extract_image_urls({"results": []}, limit=3) == []
    assert extract_image_urls({}, limit=3) == []


def test_extract_image_urls_skips_non_still_image_media():
    """Audio/video media is rejected even when mediaType=StillImage filter is bypassed."""
    response = {
        "results": [
            {"key": 1, "media": [{"type": "Sound", "identifier": "https://example.com/audio.mp3"}]},
            {"key": 2, "media": [{"type": "MovingImage", "identifier": "https://example.com/video.mp4"}]},
            {"key": 3, "media": [{"type": "StillImage", "identifier": "https://example.com/photo.jpg"}]},
        ]
    }
    urls = extract_image_urls(response, limit=5)
    assert urls == ["https://example.com/photo.jpg"]
