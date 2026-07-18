"""Name-normalisation for streek_species → plant_species resolution."""
from scripts.resolve_streek_species import norm, norm_variants


def test_norm_folds_case_accents_punctuation():
    assert norm("Gelderse roos") == "gelderseroos"
    assert norm("Sint-Janskruid") == "sintjanskruid"
    assert norm("Look-zonder-look") == "lookzonderlook"
    assert norm("Bléu") == "bleu"


def test_norm_variants_tolerates_plural():
    v = norm_variants("Klokjes")
    assert "klokjes" in v and "klokje" in v  # trailing 's' dropped
    v2 = norm_variants("Distels")
    assert "distels" in v2 and "distel" in v2


def test_norm_variants_keeps_short_words_intact():
    # too short to strip a suffix from — no bogus variant
    assert norm_variants("Es") == {"es"}
