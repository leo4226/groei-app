"""Resolve a garden's GPS to its Dutch ecological *streek*.

The 25 streken and their (soft) boundaries come from streektuinen.nl, georeferenced
into WGS84 by scripts/build_streken_geojson.py → data/streken.geojson. This module
does a pure-Python point-in-polygon at runtime — no shapely/GEOS in the request
path, so the backend image stays slim.

Because the source map is stylised, borders are soft: a garden near a boundary may
resolve to the neighbour, and a garden just off the coast may resolve to None. Both
are handled upstream by the "Kies je streek" manual override — this resolver only
provides the *default*. See docs/plans/2026-07-18-streek-biodiversity.md.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_GEOJSON = Path(__file__).parent.parent / "data" / "streken.geojson"


@lru_cache(maxsize=1)
def _features() -> list[dict]:
    data = json.loads(_GEOJSON.read_text(encoding="utf-8"))
    return data.get("features", [])


def _point_in_ring(lon: float, lat: float, ring: list[list[float]]) -> bool:
    """Ray-casting point-in-polygon for a single [ [lon,lat], ... ] ring."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _point_in_geometry(lon: float, lat: float, geom: dict) -> bool:
    t = geom.get("type")
    if t == "Polygon":
        rings = geom["coordinates"]
        # outer ring minus holes (our streken have no holes, but honour them)
        if not rings or not _point_in_ring(lon, lat, rings[0]):
            return False
        return not any(_point_in_ring(lon, lat, h) for h in rings[1:])
    if t == "MultiPolygon":
        for poly in geom["coordinates"]:
            if poly and _point_in_ring(lon, lat, poly[0]) and not any(
                _point_in_ring(lon, lat, h) for h in poly[1:]
            ):
                return True
    return False


def streek_for(lat: float | None, lon: float | None) -> dict | None:
    """Return {'slug', 'name'} for the streek containing (lat, lon), or None.

    None means the point falls outside all 25 polygons (outside NL, or in the
    soft-border gap) — the caller offers the manual picker in that case."""
    if lat is None or lon is None:
        return None
    for f in _features():
        if _point_in_geometry(lon, lat, f["geometry"]):
            p = f["properties"]
            return {"slug": p["slug"], "name": p["name"]}
    return None


def all_streken() -> list[dict]:
    """All 25 streken as [{'slug', 'name'}] sorted by name — for the picker."""
    items = [
        {"slug": f["properties"]["slug"], "name": f["properties"]["name"]}
        for f in _features()
    ]
    return sorted(items, key=lambda s: s["name"].lower())
