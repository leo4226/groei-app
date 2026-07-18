"""Georeference streektuinen's stylised streken map into WGS84 GeoJSON.

streektuinen.nl has no GeoJSON and no postcode lookup — the only machine-readable
boundary is the inline SVG map on /streken/ (25 <g id="{slug}"> polygons). The
25 streken are a custom grouping (soil / physical-geographic regions), so that
SVG *is* the authoritative definition of their boundaries.

This script parses the committed SVG (data/streken_map.svg), flattens each
region's paths into polygons, and applies a **bounding-box affine** transform:
the SVG's drawn bounding box maps to the Netherlands' geographic bounding box
(north-up, independent x/y scale). This is deterministic and reproducible; it is
NOT survey-grade — the source map is stylised, so streek borders are soft. That
is acceptable by design: gardens near a border are handled by the "Kies je
streek" manual override (see docs/plans/2026-07-18-streek-biodiversity.md), and
the accompanying city-assertion test (tests/test_streek_geojson.py) pins the
unambiguous interior cities.

Output: backend/data/streken.geojson — consumed at runtime by
services/streek.py (pure-Python point-in-polygon, no geo deps in the request
path). Re-run if streektuinen redraws the map.

Usage:
  python -m scripts.build_streken_geojson
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from svgpathtools import parse_path

DATA = Path(__file__).parent.parent / "data"
SVG = DATA / "streken_map.svg"
OUT = DATA / "streken.geojson"

# Netherlands geographic bounding box (approx land extremes incl. the Wadden
# islands): the drawn SVG bounding box is mapped onto this. Tunable control box.
LON_W, LON_E = 3.36, 7.23
LAT_S, LAT_N = 50.74, 53.57

# Map-polygon slug → display name (endonyms; EN == NL for these proper nouns).
NAMES = {
    "achterhoek": "Achterhoek",
    "brabantse-maasstreek": "Brabantse Maasstreek",
    "brabantse-zand-en-leemstreek": "Brabantse zand- en leemstreek",
    "centrale-stuwwallen": "Centrale stuwwallen",
    "de-peel": "De Peel",
    "drents-plateau-en-friese-wouden": "Drents Plateau en Friese Wouden",
    "friese-en-groningse-zeeklei": "Friese en Groningse zeeklei",
    "friese-meren-tot-weerribben": "Friese Meren tot Weerribben",
    "gelderse-poort": "Gelderse Poort en Pannerden",
    "hollands-en-utrechts-laagveengebied": "Hollands en Utrechts laagveengebied",
    "ijsseldal": "IJsseldal",
    "ijsselmeerpolders-en-zuiderzeedijken": "IJsselmeerpolders en Zuiderzeedijken",
    "kalkrijke-hollandse-duinstreek": "Kalkrijke Hollandse duinstreek",
    "laaglandrivieren": "Laaglandrivieren",
    "limburgs-heuvelland": "Limburgs heuvelland",
    "limburgse-maasstreek": "Limburgse Maasstreek",
    "reestdal": "Reestdal",
    "regge-en-sallandse-heuvelrug": "Regge en Sallandse Heuvelrug",
    "rijk-van-nijmegen": "Rijk van Nijmegen",
    "twente": "Twente",
    "vechtdal": "Vechtdal",
    "wadden-en-noordelijke-duinstreek": "Wadden en noordelijke duinstreek",
    "west-friesland": "West-Friesland",
    "zeeuwse-zandgronden": "Zuidwestelijke duingronden",
    "zuidwestelijke-zeekleipolders": "Zuidwestelijke zeekleipolders",
}


def parse_regions(svg_text: str) -> list[tuple[str, list[str]]]:
    """Extract [(slug, [path_d, ...]), ...] for each region <g>."""
    groups = re.findall(
        r'<g id="([a-z-]+)" class="open-region-popup"[^>]*>(.*?)</g>',
        svg_text, re.S,
    )
    out = []
    for slug, inner in groups:
        ds = re.findall(r'<path[^>]*\sd="([^"]+)"', inner)
        out.append((slug, ds))
    return out


def flatten(path_d: str, step: float = 2.0) -> list[tuple[float, float]]:
    """Sample an SVG path into a polyline (flattening beziers)."""
    path = parse_path(path_d)
    length = path.length(error=1e-3)
    if length < 2:
        return []
    n = max(8, int(length / step))
    pts = []
    for i in range(n + 1):
        p = path.point(i / n)
        pts.append((p.real, p.imag))
    return pts


def main() -> int:
    svg_text = SVG.read_text(encoding="utf-8")
    regions = parse_regions(svg_text)
    if len(regions) != 25:
        print(f"Expected 25 regions, found {len(regions)}", file=sys.stderr)
        return 1

    # Flatten all paths, tracking the global bounding box.
    flat: list[tuple[str, list[list[tuple[float, float]]]]] = []
    minx = miny = 1e18
    maxx = maxy = -1e18
    for slug, ds in regions:
        rings = []
        for d in ds:
            ring = flatten(d)
            if len(ring) < 3:
                continue
            rings.append(ring)
            for x, y in ring:
                minx, maxx = min(minx, x), max(maxx, x)
                miny, maxy = min(miny, y), max(maxy, y)
        flat.append((slug, rings))

    def to_lonlat(x: float, y: float) -> list[float]:
        lon = LON_W + (x - minx) / (maxx - minx) * (LON_E - LON_W)
        lat = LAT_N - (y - miny) / (maxy - miny) * (LAT_N - LAT_S)  # SVG y is south
        return [round(lon, 5), round(lat, 5)]

    features = []
    for slug, rings in flat:
        polys = []
        for ring in rings:
            coords = [to_lonlat(x, y) for x, y in ring]
            if coords[0] != coords[-1]:
                coords.append(coords[0])  # close ring (GeoJSON requirement)
            polys.append([coords])
        geometry = (
            {"type": "Polygon", "coordinates": polys[0]}
            if len(polys) == 1
            else {"type": "MultiPolygon", "coordinates": polys}
        )
        features.append({
            "type": "Feature",
            "properties": {"slug": slug, "name": NAMES.get(slug, slug)},
            "geometry": geometry,
        })

    fc = {
        "type": "FeatureCollection",
        "metadata": {
            "source": "streektuinen.nl /streken/ SVG map",
            "transform": "bbox affine (north-up, independent x/y scale)",
            "control_box": {"lon_w": LON_W, "lon_e": LON_E, "lat_s": LAT_S, "lat_n": LAT_N},
            "note": (
                "Stylised source → soft borders by design; boundary gardens use "
                "the 'Kies je streek' manual override. Boundaries © streektuinen.nl."
            ),
        },
        "features": features,
    }
    OUT.write_text(json.dumps(fc, ensure_ascii=False) + "\n", encoding="utf-8")
    npoints = sum(len(r) for _, rings in flat for r in rings)
    print(f"Wrote {OUT} — {len(features)} streken, {npoints} vertices.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
