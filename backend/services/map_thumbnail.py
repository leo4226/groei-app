"""A small read-only SVG of one map, for dashboard tiles (LAveren).

Zones are drawn as the editor colours them (`frontend/src/components/editor/
EditorDefs.tsx` ZONE_STYLES, without the textures) and each plant is a dot
coloured by its care status: overdue, due today, or fine. It has no text, so
it shows no plant or room names, and no underlay image (that stays a private
drawing aid, as on the share page).

It is built from the database row alone, with every number passed through
float(), so nothing from canvas_data reaches the SVG as raw markup.
"""
from __future__ import annotations

import json
import re
from typing import Any

# fill, opacity — mirrors ZONE_STYLES in EditorDefs.tsx.
ZONE_FILLS: dict[str, tuple[str, float]] = {
    "deck": ("#C8A96A", 1.0),
    "soil": ("#9B7A3A", 0.4),
    "gravel": ("#CCCCCC", 1.0),
    "lawn": ("#7A9E5A", 0.4),
    "wall": ("#262624", 1.0),
    "path": ("#D4C9A8", 0.6),
    "room": ("#E8E0D0", 0.5),
    "water": ("#3B8BD4", 0.4),
    "structure": ("#C8A060", 1.0),
    "fence": ("#A0825A", 0.35),
    "raised_bed": ("#7B6B2D", 0.55),
}
UNKNOWN_FILL = ("#8C8C88", 0.35)
# Drawn in this order so walls and fences sit on top of the ground.
_LAYER = {"lawn": 0, "soil": 1, "gravel": 1, "path": 2, "deck": 2, "water": 2,
          "raised_bed": 3, "room": 0, "structure": 4, "fence": 5, "wall": 6}

STATUS_COLOURS = {
    "overdue": "#C2410C",
    "due_today": "#D97706",
    "ok": "#3F7D20",
}
BACKGROUND = {"outdoor": "#E9EFE0", "indoor": "#F3EFE6"}

_VIEWBOX_RE = re.compile(r"^\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*$")


def _num(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if number == number and abs(number) < 1e7 else default  # NaN / absurd


def _fmt(value: float) -> str:
    return f"{value:.1f}".rstrip("0").rstrip(".")


def parse_viewbox(viewbox: Any, canvas: dict) -> tuple[float, float, float, float]:
    match = _VIEWBOX_RE.match(str(viewbox or ""))
    if match:
        x, y, w, h = (_num(part) for part in match.groups())
        if w > 0 and h > 0:
            return x, y, w, h
    w = _num(canvas.get("canvas_w"), 800.0) or 800.0
    h = _num(canvas.get("canvas_h"), 600.0) or 600.0
    return 0.0, 0.0, w, h


def parse_canvas(raw: Any) -> dict:
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def render_map_svg(
    *,
    viewbox: Any,
    canvas_data: Any,
    map_type: str | None,
    plants: list[dict],
) -> str:
    """`plants`: dicts with map_x, map_y and status ('overdue'|'due_today'|'ok')."""
    canvas = parse_canvas(canvas_data)
    vx, vy, vw, vh = parse_viewbox(viewbox, canvas)
    kind = "indoor" if map_type == "indoor" else "outdoor"

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{_fmt(vx)} {_fmt(vy)} {_fmt(vw)} {_fmt(vh)}" '
        f'preserveAspectRatio="xMidYMid meet">',
        f'<rect x="{_fmt(vx)}" y="{_fmt(vy)}" width="{_fmt(vw)}" height="{_fmt(vh)}" fill="{BACKGROUND[kind]}"/>',
    ]

    zones = [z for z in canvas.get("zones") or [] if isinstance(z, dict)]
    zones.sort(key=lambda z: _LAYER.get(str(z.get("type")), 1))
    for zone in zones:
        width, height = _num(zone.get("width")), _num(zone.get("height"))
        if width <= 0 or height <= 0:
            continue
        fill, opacity = ZONE_FILLS.get(str(zone.get("type")), UNKNOWN_FILL)
        parts.append(
            f'<rect x="{_fmt(_num(zone.get("x")))}" y="{_fmt(_num(zone.get("y")))}" '
            f'width="{_fmt(width)}" height="{_fmt(height)}" fill="{fill}" fill-opacity="{opacity}"/>'
        )

    radius = max(vw, vh) / 90
    stroke = radius / 3
    # Fine plants first, so an overdue dot is never hidden under a neighbour.
    order = {"ok": 0, "due_today": 1, "overdue": 2}
    for plant in sorted(plants, key=lambda p: order.get(p.get("status"), 0)):
        if plant.get("map_x") is None or plant.get("map_y") is None:
            continue
        colour = STATUS_COLOURS.get(plant.get("status"), STATUS_COLOURS["ok"])
        parts.append(
            f'<circle cx="{_fmt(_num(plant["map_x"]))}" cy="{_fmt(_num(plant["map_y"]))}" '
            f'r="{_fmt(radius)}" fill="{colour}" stroke="#FFFFFF" stroke-width="{_fmt(stroke)}"/>'
        )

    parts.append("</svg>")
    return "".join(parts)
