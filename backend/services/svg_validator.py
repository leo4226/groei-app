"""Validate + sanitize an icon SVG produced by the LLM.

Guarantees the SVG is well-formed XML, has the canonical 100x100 viewBox, and
contains only whitelisted drawing tags/attributes — no scripts, no external
references, no event handlers. Raises SvgValidationError on any violation.
"""
from __future__ import annotations

import re
from xml.etree import ElementTree as ET

try:
    from defusedxml.ElementTree import fromstring as _safe_fromstring
except ImportError:  # defusedxml is a declared dependency; fall back defensively
    _safe_fromstring = ET.fromstring

SVG_NS = "http://www.w3.org/2000/svg"

ALLOWED_TAGS = {
    "svg", "g", "path", "ellipse", "rect", "circle", "line", "polyline",
    "polygon", "title", "defs", "lineargradient", "radialgradient", "stop",
}
# Attributes that may carry a URL we must police.
URL_ATTRS = {"href", "{http://www.w3.org/1999/xlink}href", "xlink:href"}


class SvgValidationError(ValueError):
    """Raised when an SVG is unsafe or off-spec."""


def _localname(tag: str) -> str:
    return tag.split("}", 1)[-1].lower()


def validate_icon_svg(svg: str) -> str:
    svg = (svg or "").strip()
    if not svg.startswith("<svg") and "<svg" in svg:
        svg = svg[svg.index("<svg"):]  # tolerate leading prose/code fences
    try:
        root = _safe_fromstring(svg)
    except Exception as exc:  # ParseError, EntitiesForbidden, etc.
        raise SvgValidationError(f"not well-formed XML: {exc}") from exc

    if _localname(root.tag) != "svg":
        raise SvgValidationError("root element is not <svg>")

    if (root.get("viewBox") or "").replace(",", " ").split() != ["0", "0", "100", "100"]:
        raise SvgValidationError("viewBox must be '0 0 100 100'")

    for el in root.iter():
        name = _localname(el.tag)
        if name not in ALLOWED_TAGS:
            raise SvgValidationError(f"disallowed tag <{name}>")
        for attr, value in el.attrib.items():
            local = attr.split("}", 1)[-1].lower() if "}" in attr else attr.lower()
            if local.startswith("on"):
                raise SvgValidationError(f"event handler attribute {attr}")
            if attr in URL_ATTRS or local == "href":
                if re.match(r"\s*(https?:|//|data:)", value, re.I):
                    raise SvgValidationError(f"external/data reference in {attr}")
    return svg
