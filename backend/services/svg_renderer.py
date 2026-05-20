"""Renders canvas_data JSON into a complete garden map SVG."""

import json
from typing import Any

CANVAS_W = 680
CANVAS_H = 680

DEFS = """  <defs>
    <pattern id="deckp" width="6" height="6" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="6" y2="0" stroke="#8B6914" stroke-width="0.7" opacity="0.3"/>
    </pattern>
    <pattern id="soilp" width="7" height="7" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1" fill="#6B4C11" opacity="0.2"/>
      <circle cx="5.5" cy="5.5" r="0.7" fill="#6B4C11" opacity="0.15"/>
    </pattern>
    <pattern id="gravelp" width="5" height="5" patternUnits="userSpaceOnUse">
      <circle cx="1.5" cy="1.5" r="0.9" fill="#999" opacity="0.35"/>
      <circle cx="4" cy="4" r="0.7" fill="#999" opacity="0.22"/>
    </pattern>
  </defs>"""

ZONE_STYLES: dict[str, dict[str, Any]] = {
    "deck":      {"fill": "#C8A96A", "pattern": "deckp",   "pattern_opacity": 0.55, "stroke": "rgba(222,220,209,0.3)",  "stroke_width": 1,   "opacity": 1},
    "soil":      {"fill": "#9B7A3A", "pattern": "soilp",   "pattern_opacity": 1,    "stroke": "rgba(222,220,209,0.15)", "stroke_width": 0.5, "opacity": 0.4},
    "gravel":    {"fill": "#cccccc", "pattern": "gravelp", "pattern_opacity": 1,    "stroke": "rgba(222,220,209,0.15)", "stroke_width": 0.5, "opacity": 1},
    "lawn":      {"fill": "#7A9E5A", "pattern": None,       "pattern_opacity": 0,    "stroke": "rgba(222,220,209,0.2)",  "stroke_width": 0.8, "opacity": 0.4},
    "wall":      {"fill": "#262624", "pattern": None,       "pattern_opacity": 0,    "stroke": "rgba(222,220,209,0.4)",  "stroke_width": 1.5, "opacity": 1},
    "path":      {"fill": "#D4C9A8", "pattern": None,       "pattern_opacity": 0,    "stroke": "none",                   "stroke_width": 0,   "opacity": 0.6},
    "room":      {"fill": "#E8E0D0", "pattern": None,       "pattern_opacity": 0,    "stroke": "rgba(100,80,60,0.2)",    "stroke_width": 1,   "opacity": 0.5},
    "water":     {"fill": "#3B8BD4", "pattern": None,       "pattern_opacity": 0,    "stroke": "rgba(60,130,200,0.3)",   "stroke_width": 1,   "opacity": 0.4},
    "structure": {"fill": "#C8A060", "pattern": None,       "pattern_opacity": 0,    "stroke": "#8a6030",                "stroke_width": 1.2, "opacity": 1},
}


def _rect_zone(zone: dict, style: dict) -> str:
    x, y, w, h = zone["x"], zone["y"], zone["width"], zone["height"]
    stroke = style["stroke"]
    sw = style["stroke_width"]
    label = zone.get("label", "")
    lines = []

    # Base fill
    fill_attr = f'fill="{style["fill"]}" opacity="{style["opacity"]}"'
    stroke_attr = f'stroke="{stroke}" stroke-width="{sw}"' if stroke != "none" else 'stroke="none"'
    lines.append(f'  <rect x="{x}" y="{y}" width="{w}" height="{h}" {fill_attr} {stroke_attr}/>')

    # Pattern overlay
    if style["pattern"]:
        po = style["pattern_opacity"]
        lines.append(f'  <rect x="{x}" y="{y}" width="{w}" height="{h}" fill="url(#{style["pattern"]})" opacity="{po}"/>')

    # Label
    if label and w > 40 and h > 20:
        fs = min(12, w // 8)
        cx = x + w // 2
        cy = y + h // 2
        lines.append(
            f'  <text x="{cx}" y="{cy}" text-anchor="middle" dominant-baseline="central" '
            f'fill="rgba(255,255,255,0.8)" font-size="{fs}" font-weight="500">{label}</text>'
        )

    return "\n".join(lines)


def _scale_bar(scale_px_per_m: float) -> str:
    bar_m = 2
    bar_px = bar_m * scale_px_per_m
    bx, by = 16, CANVAS_H - 20
    ex = bx + bar_px
    return (
        f'  <line x1="{bx}" y1="{by}" x2="{ex}" y2="{by}" stroke="rgba(100,90,70,0.7)" stroke-width="1.5"/>\n'
        f'  <line x1="{bx}" y1="{by-4}" x2="{bx}" y2="{by+4}" stroke="rgba(100,90,70,0.7)" stroke-width="1.5"/>\n'
        f'  <line x1="{ex}" y1="{by-4}" x2="{ex}" y2="{by+4}" stroke="rgba(100,90,70,0.7)" stroke-width="1.5"/>\n'
        f'  <text x="{bx + bar_px/2}" y="{by-7}" text-anchor="middle" '
        f'fill="rgba(100,90,70,0.8)" font-size="9">{bar_m}m</text>'
    )


def render_canvas_data(canvas_data_json: str, map_name: str) -> str:
    data = json.loads(canvas_data_json)
    zones: list[dict] = data.get("zones", [])
    scale: float = float(data.get("scale_px_per_m", 46))
    cw: int = int(data.get("canvas_w", CANVAS_W))
    ch: int = int(data.get("canvas_h", CANVAS_H))

    parts = [
        f'<!-- groei-map: {map_name} -->',
        f'<!-- scale: {scale}px/m -->',
        f'<!-- canvas: {cw}x{ch} -->',
        f'<svg width="100%" viewBox="0 0 {cw} {ch}" xmlns="http://www.w3.org/2000/svg">',
        DEFS,
    ]

    for zone in zones:
        ztype = zone.get("type", "soil")
        style = ZONE_STYLES.get(ztype, ZONE_STYLES["soil"])
        if zone.get("shape") == "rect":
            parts.append(_rect_zone(zone, style))

    parts.append(_scale_bar(scale))
    parts.append("</svg>")
    return "\n".join(parts)


def render_thumbnail(canvas_data_json: str) -> str:
    """Render a compact zone-block thumbnail SVG — no patterns, no scale bar."""
    data = json.loads(canvas_data_json)
    zones: list[dict] = data.get("zones", [])

    if not zones:
        return ""

    # Compute bounding box of all zone rects
    min_x = min(z["x"] for z in zones)
    min_y = min(z["y"] for z in zones)
    max_x = max(z["x"] + z["width"] for z in zones)
    max_y = max(z["y"] + z["height"] for z in zones)

    bw = max_x - min_x
    bh = max_y - min_y
    pad = max(bw, bh) * 0.10
    min_x -= pad
    min_y -= pad
    bw += pad * 2
    bh += pad * 2

    parts = [
        f'<svg viewBox="{min_x} {min_y} {bw} {bh}" xmlns="http://www.w3.org/2000/svg">',
    ]

    for zone in zones:
        ztype = zone.get("type", "soil")
        style = ZONE_STYLES.get(ztype, ZONE_STYLES["soil"])
        x, y, w, h = zone["x"], zone["y"], zone["width"], zone["height"]
        fill = style["fill"]
        opacity = style.get("opacity", 1)
        parts.append(
            f'  <rect x="{x}" y="{y}" width="{w}" height="{h}" '
            f'fill="{fill}" opacity="{opacity}" rx="2"/>'
        )

    parts.append("</svg>")
    return "\n".join(parts)
