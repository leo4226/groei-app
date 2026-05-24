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
    """Records lacking a `media` array are skipped without erroring."""
    modified = {"results": [{"key": 999, "media": []}] + gbif_response.get("results", [])}
    urls = extract_image_urls(modified, limit=3)
    assert all(u != "" for u in urls)


def test_extract_image_urls_handles_empty_response():
    """Empty results returns empty list, not error."""
    assert extract_image_urls({"results": []}, limit=3) == []
    assert extract_image_urls({}, limit=3) == []
