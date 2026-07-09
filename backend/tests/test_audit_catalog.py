"""Unit tests for the pure catalog-audit aggregation (no DB)."""
from scripts.audit_catalog import summarize, _has_text, _has_care


def _row(**kw):
    base = dict(genus="Rosa", family="Rosaceae", native_to_nl=None, invasive_nl=None,
                common_name_nl=None, common_name_en=None, latin_name="Rosa canina",
                images_count=0, care_thresholds=None)
    base.update(kw)
    return base


def test_has_text_rejects_blank_and_latin_echo():
    assert _has_text("Hondsroos", "Rosa canina")
    assert not _has_text(None)
    assert not _has_text("  ")
    assert not _has_text("rosa canina", "Rosa canina")  # echoed Latin name doesn't count


def test_has_care_rejects_empty_json():
    assert _has_care('{"water": 3}')
    assert not _has_care(None)
    assert not _has_care("")
    assert not _has_care("{}")


def test_region_counts_split_true_false_none():
    rows = [_row(native_to_nl=True), _row(native_to_nl=False),
            _row(native_to_nl=None), _row(native_to_nl=True, invasive_nl=True)]
    s = summarize(rows)
    assert s["total"] == 4
    assert s["native_nl"] == 2
    assert s["non_native"] == 1
    assert s["unknown_region"] == 1
    assert s["invasive_nl"] == 1


def test_localisation_and_readiness_counts():
    rows = [
        _row(common_name_nl="Hondsroos", common_name_en="Dog rose", images_count=3, care_thresholds='{"x":1}'),
        _row(common_name_nl=None, images_count=0, care_thresholds=None),
        _row(common_name_nl="Rosa canina", latin_name="Rosa canina"),  # Latin echo → not counted
    ]
    s = summarize(rows)
    assert s["has_nl_name"] == 1
    assert s["has_en_name"] == 1
    assert s["with_images"] == 1
    assert s["with_care"] == 1


def test_genus_bloat_detection():
    rows = [_row(genus="Sedum") for _ in range(50)] + [_row(genus="Monstera") for _ in range(3)]
    s = summarize(rows, bloat_threshold=40)
    assert dict(s["bloated_genera"]) == {"Sedum": 50}
    assert s["bloat_rows"] == 50
    assert s["distinct_genera"] == 2
    assert s["top_genera"][0] == ("Sedum", 50)
