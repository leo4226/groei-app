"""Georeference sanity check: unambiguous interior cities resolve to their streek.

These pin the georeferenced boundaries (data/streken.geojson) so a bad rebuild is
caught in CI. Only *interior* cities are asserted — boundary/tip cities (Utrecht,
Nijmegen, Groningen, Maastricht) sit on soft borders of the stylised source map
and are intentionally left to the manual "Kies je streek" override, so pinning
them here would encode noise rather than a guarantee.
"""
from services.streek import streek_for, all_streken

# (city, lat, lon, expected streek slug) — geographically unambiguous interiors.
INTERIOR_ANCHORS = [
    ("Amsterdam", 52.379, 4.900, "hollands-en-utrechts-laagveengebied"),
    ("Eindhoven", 51.441, 5.470, "brabantse-zand-en-leemstreek"),
    ("Enschede", 52.221, 6.894, "twente"),
    ("Assen", 52.996, 6.564, "drents-plateau-en-friese-wouden"),
    ("Leeuwarden", 53.201, 5.799, "friese-en-groningse-zeeklei"),
    ("Middelburg", 51.499, 3.614, "zuidwestelijke-zeekleipolders"),
    ("Apeldoorn", 52.211, 5.970, "centrale-stuwwallen"),
]


def test_interior_cities_resolve_to_expected_streek():
    for name, lat, lon, expected in INTERIOR_ANCHORS:
        got = streek_for(lat, lon)
        assert got is not None, f"{name} resolved to None"
        assert got["slug"] == expected, f"{name}: expected {expected}, got {got['slug']}"


def test_outside_nl_resolves_to_none():
    # Brussels and mid-North-Sea are outside all 25 polygons.
    assert streek_for(50.85, 4.35) is None
    assert streek_for(54.5, 3.0) is None


def test_all_streken_lists_25_sorted():
    items = all_streken()
    assert len(items) == 25
    assert all({"slug", "name"} <= set(i) for i in items)
    names = [i["name"] for i in items]
    assert names == sorted(names, key=str.lower)
