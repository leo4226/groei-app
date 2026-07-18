"""Scientific-name normalisation for Bloeibogen → plant_species join."""
from scripts.resolve_bloeibogen import sci_key


def test_sci_key_genus_species_only():
    # cultivars / authorities collapse to genus + species so they still match
    assert sci_key("Lavandula angustifolia 'Hidcote'") == "lavandula angustifolia"
    assert sci_key("Acer campestre") == "acer campestre"
    assert sci_key("Ribes rubrum L.") == "ribes rubrum"


def test_sci_key_case_and_accents():
    assert sci_key("SALIX Cáprea") == "salix caprea"


def test_sci_key_handles_empty():
    assert sci_key("") == ""
    assert sci_key("Monstera") == "monstera"  # genus only is fine
