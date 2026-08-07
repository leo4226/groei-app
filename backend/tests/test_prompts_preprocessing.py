"""Tests for #809: prompt ensemble + preprocessing (crop) + quality checks."""
import numpy as np
import pytest
from PIL import Image

from scripts.precompute_embeddings import (
    COMMON_TEMPLATES,
    LATIN_TEMPLATES,
    build_prompts,
)
from services.bioclip_id import (
    _BLUR_LAPLACIAN_THRESHOLD,
    center_crop,
    image_quality_report,
)


# ── Prompt ensemble ─────────────────────────────────────────────────────────

def test_build_prompts_latin_only():
    prompts = build_prompts("Monstera deliciosa")
    assert len(prompts) == len(LATIN_TEMPLATES)
    assert all("Monstera deliciosa" in p for p in prompts)
    assert "a photo of Monstera deliciosa, a plant" in prompts


def test_build_prompts_with_common_name_appends_common_templates():
    prompts = build_prompts("Monstera deliciosa", "Swiss cheese plant")
    assert len(prompts) == len(LATIN_TEMPLATES) + len(COMMON_TEMPLATES)
    assert any("Swiss cheese plant" in p for p in prompts)
    # Latin templates remain present.
    assert any("Monstera deliciosa" in p for p in prompts)


def test_build_prompts_empty_common_is_ignored():
    prompts_plain = build_prompts("Rosa spp.")
    prompts_empty = build_prompts("Rosa spp.", "")
    assert prompts_plain == prompts_empty


def test_build_prompts_latin_variants_are_distinct():
    prompts = build_prompts("Athyrium filix-femina")
    assert len(set(prompts)) == len(prompts)


# ── Center crop ─────────────────────────────────────────────────────────────

def _solid_image(w=400, h=300, color=(120, 90, 60)):
    img = Image.new("RGB", (w, h), color)
    # Paint a distinguishable center dot so crop direction is verifiable.
    px = img.load()
    for x in range(w // 2 - 10, w // 2 + 10):
        for y in range(h // 2 - 10, h // 2 + 10):
            px[x, y] = (255, 0, 0)
    return img


def test_center_crop_reduces_size_and_keeps_center():
    img = _solid_image(400, 300)
    cropped = center_crop(img, fraction=0.85)
    assert cropped.size == (340, 255)  # int(400*0.85), int(300*0.85)
    # Center pixel survives (the red dot region).
    assert cropped.getpixel((170, 127)) == (255, 0, 0)


def test_center_crop_centered():
    img = _solid_image(400, 300)
    cropped = center_crop(img, fraction=0.5)
    assert cropped.size == (200, 150)
    # The crop is centered: content from the middle of the source.
    assert cropped.getpixel((100, 75)) == (255, 0, 0)


def test_center_crop_tiny_image_is_noop():
    img = _solid_image(200, 100)  # min side 100 < 256 threshold
    cropped = center_crop(img, fraction=0.85)
    assert cropped.size == (200, 100)


def test_center_crop_fraction_one_is_noop():
    img = _solid_image(400, 300)
    assert center_crop(img, fraction=1.0).size == (400, 300)


def test_center_crop_returns_pil_image():
    img = _solid_image(500, 500)
    assert isinstance(center_crop(img), Image.Image)


# ── Quality report ──────────────────────────────────────────────────────────

def test_quality_report_sharp_image_not_blurry():
    rng = np.random.default_rng(42)
    arr = (rng.integers(0, 256, (300, 300, 3))).astype("uint8")
    img = Image.fromarray(arr, "RGB")
    report = image_quality_report(img)
    assert report["low_resolution"] is False
    assert report["blurry"] is False
    assert report["laplacian_variance"] > _BLUR_LAPLACIAN_THRESHOLD


def test_quality_report_flat_image_blurry():
    img = Image.new("RGB", (300, 300), (128, 128, 128))
    report = image_quality_report(img)
    assert report["blurry"] is True
    assert report["laplacian_variance"] < _BLUR_LAPLACIAN_THRESHOLD


def test_quality_report_lighting_flags():
    dark = Image.new("RGB", (300, 300), (5, 5, 5))
    bright = Image.new("RGB", (300, 300), (250, 250, 250))
    assert image_quality_report(dark)["too_dark"] is True
    assert image_quality_report(bright)["too_bright"] is True


def test_quality_report_low_resolution():
    img = Image.new("RGB", (100, 100), (128, 128, 128))
    assert image_quality_report(img)["low_resolution"] is True


def test_quality_report_shape_fields():
    img = _solid_image(640, 480)
    report = image_quality_report(img)
    assert report["width"] == 640
    assert report["height"] == 480
    assert "mean_luma" in report
