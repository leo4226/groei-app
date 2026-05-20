#!/usr/bin/env python3
"""
Generate a Floreren plant icon SVG from just a Latin name + form.

Simplest usage (run from groei/):
  python frontend/scripts/generate-plant-icon.py "Lavandula angustifolia" bare
  python frontend/scripts/generate-plant-icon.py "Monstera deliciosa" potted

With all options:
  python frontend/scripts/generate-plant-icon.py --sci "Lavandula angustifolia" --name "Lavender" --cat herb --form potted

Auto-detects:
  - Common name from the genus (first word of Latin name)
  - Category from genus keywords
  - Updates manifest.json automatically
  - No LLM needed.

Run from groei/ directory so icons/ and manifest.json are reachable.
"""

import argparse
import json
import os
import re
import sys
from xml.sax.saxutils import escape

# ── Constants ──────────────────────────────────────────────────────────

CANVAS = 100
ICONS_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "icons"))
MANIFEST_PATH = os.path.join(ICONS_DIR, "manifest.json")

# Pot colors
POT_COLOR = "#B2664A"
POT_RIM_COLOR = "#C77B5D"
POT_INNER_COLOR = "#8E4A33"
SOIL_COLOR = "#4A3429"

# Leaf colors
DEFAULT_LEAF_DARK = "#2F5D3A"
DEFAULT_LEAF_MID = "#4A7C4E"
DEFAULT_LEAF_LIGHT = "#5C8A4E"
DEFAULT_STEM = "#3D5C3A"
DEFAULT_FLOWER_CENTER = "#F4C542"

# ── SVG builders ───────────────────────────────────────────────────────

def make_pot(cx=50, pot_width=42):
    """SVG elements for a standard terracotta pot."""
    half = pot_width / 2
    left = cx - half
    right = cx + half
    pot_bottom_w = pot_width - 6
    right_bottom = left + pot_bottom_w
    lines = [
        f'  <path d="M {left + 2} 78 L {left + 6} 98 Q {left + 6} 100 {left + 8} 100 L {right_bottom - 2} 100 Q {right_bottom} 100 {right_bottom} 98 L {right - 2} 78 Z" fill="{POT_COLOR}"/>',
        f'  <rect x="{left}" y="75" width="{pot_width}" height="5" rx="1.5" fill="{POT_RIM_COLOR}"/>',
        f'  <path d="M {left + 6} 98 Q {left + 6} 100 {left + 8} 100 L {right_bottom - 2} 100 Q {right_bottom} 100 {right_bottom} 98 L {right_bottom - 2} 96 L {left + 8} 96 Z" fill="{POT_INNER_COLOR}" opacity="0.5"/>',
        f'  <ellipse cx="{cx}" cy="{75 + 2.5}" rx="{pot_width / 2 - 2}" ry="1.8" fill="{SOIL_COLOR}"/>',
    ]
    return "\n".join(lines)


def make_ground_shadow(cx=50):
    """Ground shadow for bare plants (no pot)."""
    return f'  <ellipse cx="{cx}" cy="82" rx="22" ry="6" fill="#2F5D3A" opacity="0.4"/>'


def make_simple_stem(cx, top_y, bottom_y=75, stem_color=DEFAULT_STEM, width=1.4):
    """A single stem from bottom_y up to top_y."""
    return f'  <path d="M {cx} {bottom_y} Q {cx} {bottom_y - 10} {cx} {top_y}" stroke="{stem_color}" stroke-width="{width}" fill="none" stroke-linecap="round"/>'


def make_broadleaf_plant(cx=50, pot_top=75, plant_height=50, leaf_count=5, leaf_color=DEFAULT_LEAF_MID, stem_color=DEFAULT_STEM):
    """Generate a generic broadleaf plant (default for most houseplants/flowers)."""
    stem_top = pot_top - plant_height
    cx_left = cx - 8
    cx_right = cx + 8

    middle_stem = make_simple_stem(cx, stem_top + 5, pot_top - 2, stem_color)
    stems = [middle_stem]
    stems.append(make_simple_stem(cx_left, stem_top + 15, pot_top - 4, stem_color, 1.0))
    stems.append(make_simple_stem(cx_right, stem_top + 15, pot_top - 4, stem_color, 1.0))

    s = ""
    s += f'  <g transform="translate({cx} {pot_top - 2})">\n'
    s += f'    <path d="M 0 0 Q -12 -8 -14 -20 Q -10 -28 -4 -24 Q 0 -18 0 -12 Q 0 -18 4 -24 Q 10 -28 14 -20 Q 12 -8 0 0 Z" fill="{leaf_color}"/>\n'
    s += f'    <path d="M -8 -14 L -4 -10 M 8 -14 L 4 -10 M -6 -20 L -2 -14 M 6 -20 L 2 -14" stroke="{DEFAULT_LEAF_DARK}" stroke-width="1.2" stroke-linecap="round"/>\n'
    s += f'  </g>\n'

    for x_offset, rot, lc in [(cx_left, -15, leaf_color), (cx_right, 15, DEFAULT_LEAF_LIGHT)]:
        s += f'  <g transform="translate({x_offset} {pot_top - 18}) rotate({rot})">\n'
        s += f'    <ellipse cx="0" cy="-12" rx="8" ry="14" fill="{lc}"/>\n'
        s += f'    <path d="M 0 0 L 0 -22" stroke="{DEFAULT_LEAF_DARK}" stroke-width="0.8" fill="none"/>\n'
        s += f'    <path d="M -6 -8 L -2 -6 M 6 -8 L 2 -6" stroke="{DEFAULT_LEAF_DARK}" stroke-width="0.6" stroke-linecap="round"/>\n'
        s += f'  </g>\n'

    return stems[0] + "\n" + stems[1] + "\n" + stems[2] + "\n" + s


def make_grass_plant(cx=50, pot_top=75, plant_height=50):
    """Generate grass-like blades with plume seed heads."""
    parts = []
    for angle in [-25, -15, -5, 5, 15, 25]:
        parts.append(
            f'  <g transform="translate({cx} {pot_top - 2}) rotate({angle})">'
            f'\n    <path d="M 0 0 Q 2 -{plant_height//2} 5 -{plant_height}" stroke="{DEFAULT_LEAF_MID}" stroke-width="1.3" fill="none" stroke-linecap="round"/>'
            f'\n    <path d="M 0 0 Q 2 -{plant_height//2} 5 -{plant_height}" stroke="#A5C68F" stroke-width="0.4" fill="none" stroke-linecap="round"/>'
            f'\n  </g>'
        )
    plume_y = pot_top - plant_height - 5
    for i, (px, _) in enumerate([(cx - 8, -20), (cx - 3, -8), (cx + 3, 8), (cx + 8, 20)]):
        parts.append(
            f'  <g transform="translate({px} {plume_y + i * 2})">'
            f'\n    <ellipse cx="0" cy="-3" rx="3" ry="6" fill="#A5C68F" opacity="0.85"/>'
            f'\n    <path d="M 0 2 L -2 -8 M 0 2 L 2 -8 M 0 2 L 0 -10 M 0 2 L -3 -6 M 0 2 L 3 -6" stroke="#FBF7EE" stroke-width="0.6" stroke-linecap="round"/>'
            f'\n  </g>'
        )
    return "\n".join(parts)


def make_succulent_plant(cx=50, pot_top=75, plant_height=40):
    """Generate a rosette succulent."""
    parts = [f'  <ellipse cx="{cx}" cy="{pot_top - 8}" rx="12" ry="8" fill="{DEFAULT_LEAF_LIGHT}"/>']
    specs = [
        (cx - 10, pot_top - 14, 7, 10, DEFAULT_LEAF_LIGHT),
        (cx + 10, pot_top - 14, 7, 10, DEFAULT_LEAF_MID),
        (cx - 6, pot_top - 22, 6, 8, DEFAULT_LEAF_MID),
        (cx + 6, pot_top - 22, 6, 8, DEFAULT_LEAF_LIGHT),
        (cx, pot_top - 26, 5, 7, DEFAULT_LEAF_DARK),
    ]
    for x_off, y_off, rx, ry, color in specs:
        rot = 0
        if x_off < cx:
            rot = -20 + (cx - x_off) * 2
        elif x_off > cx:
            rot = 20 - (x_off - cx) * 2
        parts.append(
            f'  <ellipse cx="{x_off}" cy="{y_off}" rx="{rx}" ry="{ry}" fill="{color}" '
            f'transform="rotate({rot} {x_off} {y_off})"/>'
        )
    return "\n".join(parts)


def make_climber_plant(cx=50, pot_top=75, plant_height=55):
    """Generate a climbing/trailing plant with multiple stems."""
    parts = []
    for i, (x_off, rot) in enumerate([(cx - 6, -10), (cx + 6, 10), (cx - 12, -20), (cx + 12, 20)]):
        parts.append(
            f'  <g transform="translate({x_off} {pot_top - 2}) rotate({rot})">'
            f'\n    <path d="M 0 0 Q {i % 2 * 5 - 2} -{15 + i * 3} 0 -{plant_height - i * 5}" '
            f'stroke="{DEFAULT_STEM}" stroke-width="1.0" fill="none" stroke-linecap="round"/>'
            f'\n    <ellipse cx="2" cy="-{plant_height - i * 5 - 5}" rx="5" ry="3" fill="{DEFAULT_LEAF_MID}" '
            f'transform="rotate({30 + i * 10} 2 -{plant_height - i * 5 - 5})"/>'
            f'\n    <ellipse cx="-3" cy="-{plant_height - i * 5 - 2}" rx="4" ry="2.5" fill="{DEFAULT_LEAF_LIGHT}" '
            f'transform="rotate({-20 - i * 5} -3 -{plant_height - i * 5 - 2})"/>'
            f'\n  </g>'
        )
    return "\n".join(parts)


def make_tree_plant(cx=50, pot_top=75, plant_height=60):
    """Generate a small tree (trunk + round canopy)."""
    trunk_top = pot_top - plant_height + 15
    parts = [
        f'  <path d="M {cx - 3} {pot_top - 2} L {cx - 2} {trunk_top} M {cx + 3} {pot_top - 2} L {cx + 2} {trunk_top} M {cx} {pot_top - 2} L {cx} {trunk_top - 3}" '
        f'stroke="#6B4A35" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
        f'  <ellipse cx="{cx}" cy="{trunk_top - 10}" rx="16" ry="14" fill="{DEFAULT_LEAF_MID}"/>',
        f'  <ellipse cx="{cx + 6}" cy="{trunk_top - 16}" rx="10" ry="8" fill="{DEFAULT_LEAF_DARK}"/>',
        f'  <ellipse cx="{cx - 6}" cy="{trunk_top - 14}" rx="8" ry="10" fill="{DEFAULT_LEAF_LIGHT}"/>',
        f'  <ellipse cx="{cx}" cy="{trunk_top - 18}" rx="8" ry="7" fill="{DEFAULT_LEAF_MID}"/>',
    ]
    return "\n".join(parts)


# ── Plant generators by category ───────────────────────────────────────

PLANT_GENERATORS = {
    "houseplant": make_broadleaf_plant,
    "flower": make_broadleaf_plant,
    "succulent": make_succulent_plant,
    "cactus": make_succulent_plant,
    "herb": lambda cx, pt, h: make_broadleaf_plant(cx, pt, h, leaf_count=6, leaf_color=DEFAULT_LEAF_LIGHT),
    "edible": lambda cx, pt, h: make_broadleaf_plant(cx, pt, h, leaf_count=5, leaf_color="#5C8A4E"),
    "tree": make_tree_plant,
    "shrub": make_tree_plant,
    "grass": make_grass_plant,
    "fern": lambda cx, pt, h: make_grass_plant(cx, pt, int(h * 0.8)),
    "bulb": lambda cx, pt, h: make_broadleaf_plant(cx, pt, h, leaf_count=4, leaf_color=DEFAULT_LEAF_LIGHT),
    "climber": make_climber_plant,
    "vine": make_climber_plant,
    "unknown": make_broadleaf_plant,
}

# ── Category detection ─────────────────────────────────────────────────

COMMON_NAME_HINTS = {
    "herb": ["basil", "mint", "rosemary", "thyme", "sage", "oregano", "cilantro", "dill", "parsley", "chive", "lavender", "lemongrass", "tarragon"],
    "flower": ["rose", "tulip", "daisy", "sunflower", "orchid", "peony", "lily", "daffodil", "poppy", "petunia", "chrysanthemum", "hydrangea", "hibiscus"],
    "succulent": ["succulent", "cactus", "aloe", "echeveria", "sedum", "jade", "agave", "sempervivum", "crassula", "haworthia"],
    "tree": ["tree", "oak", "maple", "birch", "pine", "fir", "willow", "palm", "fig", "olive", "cherry", "apple", "pear", "plum", "citrus"],
    "grass": ["grass", "bamboo", "sedge", "rush", "miscanthus"],
    "fern": ["fern", "asparagus", "nephrolepis", "adiantum"],
    "climber": ["ivy", "jasmine", "philodendron", "pothos", "clematis", "wisteria", "vine", "ipomoea"],
    "bulb": ["tulip", "daffodil", "hyacinth", "crocus", "allium", "amaryllis"],
    "edible": ["tomato", "pepper", "strawberry", "raspberry", "blueberry", "cucumber", "bean", "pea", "lettuce", "kale", "chard"],
}

GENUS_HINTS = {
    "ocimum": "herb", "mentha": "herb", "salvia": "herb", "thymus": "herb",
    "origanum": "herb", "coriandrum": "herb", "anethum": "herb", "petroselinum": "herb",
    "allium": "herb", "lavandula": "herb", "melissa": "herb", "artemisia": "herb",
    "echeveria": "succulent", "crassula": "succulent", "sedum": "succulent",
    "haworthia": "succulent", "aeonium": "succulent", "aloe": "succulent",
    "mammillaria": "succulent", "opuntia": "succulent", "cereus": "succulent",
    "echinocactus": "succulent",
    "quercus": "tree", "acer": "tree", "betula": "tree", "pinus": "tree",
    "abies": "tree", "salix": "tree", "olea": "tree",
    "miscanthus": "grass", "bambusa": "grass", "phragmites": "grass",
    "cortaderia": "grass", "stipa": "grass", "festuca": "grass",
    "nephrolepis": "fern", "adiantum": "fern", "pteris": "fern",
    "hedera": "climber", "clematis": "climber", "wisteria": "climber",
    "ipomoea": "climber", "epipremnum": "climber", "philodendron": "climber", "scindapsus": "climber",
    "solanum": "edible", "capsicum": "edible", "fragaria": "edible",
    "rubus": "edible", "vaccinium": "edible", "cucumis": "edible",
    "lactuca": "edible", "beta": "edible", "brassica": "edible",
    "tulipa": "flower", "rosa": "flower", "helianthus": "flower",
    "pelargonium": "flower", "dianthus": "flower", "chrysanthemum": "flower",
    "monstera": "houseplant", "ficus": "houseplant", "epipremnum": "climber",
    "chlorophytum": "houseplant", "spathiphyllum": "houseplant",
}


def guess_category(name: str) -> str:
    """Try to guess a category from a common name or Latin genus."""
    name_lower = name.lower().strip()
    genus = name_lower.split()[0] if name_lower else ""

    # Check common name hints first (works for "Lavender", "Rose", etc.)
    for cat, keywords in COMMON_NAME_HINTS.items():
        for kw in keywords:
            if kw in name_lower:
                return cat

    # Check genus hints (e.g. "Lavandula" → herb, "Quercus" → tree)
    if genus in GENUS_HINTS:
        return GENUS_HINTS[genus]

    # Check family endings
    if name_lower.endswith("aceae"):
        if "ceae" in name_lower:
            pass  # too broad, keep going

    return "houseplant"


def derive_common_name(sci: str) -> str:
    """Derive a display name from the scientific name (use genus)."""
    genus = sci.strip().split()[0] if sci.strip() else ""
    if genus:
        # Capitalize first letter
        return genus[0].upper() + genus[1:]
    return "Unknown Plant"


# ── Main icon builder ──────────────────────────────────────────────────

def generate_icon(
    name: str,
    sci: str = "",
    cat: str = "unknown",
    form: str = "potted",
    plant_height: int = 50,
    plant_svg: str | None = None,
    icon_id: str | None = None,
) -> str:
    """Generate a complete plant icon SVG string."""
    if icon_id is None:
        icon_id = name.lower().replace(" ", "_").replace("-", "_")
        icon_id = re.sub(r"[^a-z0-9_]", "", icon_id)

    cx = 50
    pot_top = 75 if form in ("potted", "fruit", "portrait") else 82

    svg_lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CANVAS} {CANVAS}" width="{CANVAS}" height="{CANVAS}" role="img" aria-label="{escape(name)}">',
        f'  <title>{escape(name)} — {escape(sci) if sci else ""}</title>',
        "",
    ]

    if form in ("potted", "portrait"):
        pot_w = min(46, max(36, 42 - (plant_height - 50) // 10))
        svg_lines.append(make_pot(cx, pot_w))
    elif form == "fruit":
        svg_lines.append(make_pot(cx, 34))
    else:
        svg_lines.append(make_ground_shadow(cx))

    svg_lines.append("")

    if plant_svg:
        svg_lines.append(plant_svg)
    elif cat in PLANT_GENERATORS:
        svg_lines.append(PLANT_GENERATORS[cat](cx, pot_top, plant_height))
    else:
        svg_lines.append(make_broadleaf_plant(cx, pot_top, plant_height))

    svg_lines.append("")
    svg_lines.append("</svg>")
    return "\n".join(svg_lines)


def update_manifest(icon_id: str, name: str, sci: str, cat: str, form: str, family: str = ""):
    """Add or update an entry in manifest.json."""
    if not os.path.exists(MANIFEST_PATH):
        print(f"  ⚠  {MANIFEST_PATH} not found. Skipping manifest update.")
        return

    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    plants = data.get("plants", data if isinstance(data, list) else [])
    entry = {
        "id": icon_id,
        "name": name,
        "sci": sci,
        "cat": cat,
        "form": form,
        "family": family,
        "file": f"{icon_id}.svg",
    }

    existing = [p for p in plants if p.get("id") == icon_id]
    if existing:
        existing[0].update(entry)
        action = "Updated"
    else:
        plants.append(entry)
        action = "Added"

    if isinstance(data, dict):
        data["plants"] = plants
        data["count"] = len(plants)
        data["iconCount"] = len(plants)
    else:
        data = plants

    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"  ✓ Manifest: {action} '{icon_id}'")


def main():
    parser = argparse.ArgumentParser(
        description="Generate a Floreren plant icon SVG from a Latin name + form",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python frontend/scripts/generate-plant-icon.py "Lavandula angustifolia" bare
  python frontend/scripts/generate-plant-icon.py "Monstera deliciosa" potted
  python frontend/scripts/generate-plant-icon.py --sci "Rosa" --height 60
  python frontend/scripts/generate-plant-icon.py "Aloe vera" --cat succulent --height 35
  python frontend/scripts/generate-plant-icon.py "Fragaria vesca" potted --dry-run
        """,
    )

    # Positional args for the simplest usage
    parser.add_argument("sci", nargs="?", default=None,
                        help="Scientific/Latin name (e.g. 'Lavandula angustifolia')")
    parser.add_argument("form", nargs="?", default=None,
                        choices=["potted", "bare", "fruit", "portrait"],
                        help="Form: potted (default), bare, fruit, portrait")

    # Named options
    parser.add_argument("--sci", dest="sci_named", default=None,
                        help="Scientific name (alternative to positional)")
    parser.add_argument("--name", default=None,
                        help="Common plant name (auto-derived from genus if omitted)")
    parser.add_argument("--cat", default=None,
                        help="Category: houseplant, flower, succulent, herb, edible, tree, shrub, grass, fern, bulb, climber, vine")
    parser.add_argument("--form", dest="form_named", default=None,
                        choices=["potted", "bare", "fruit", "portrait"],
                        help="Form variant (alternative to positional)")
    parser.add_argument("--family", default="",
                        help="Plant family (e.g. 'Lamiaceae')")
    parser.add_argument("--height", type=int, default=50,
                        help="Plant height in SVG units (10-70, default 50)")
    parser.add_argument("--plant-svg", default=None,
                        help="Custom SVG snippet (overrides auto-generation)")
    parser.add_argument("--output", default=None,
                        help="Output path (default: icons/<id>.svg)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print SVG to stdout, don't write")

    args = parser.parse_args()

    # Resolve sci from positional or named
    sci = args.sci_named or args.sci
    if not sci:
        parser.error("Provide a scientific name: e.g. 'Lavandula angustifolia'")

    # Resolve form
    form = args.form_named or args.form or "potted"

    # Resolve name
    name = args.name or derive_common_name(sci)

    # Validate height
    if args.height < 10 or args.height > 70:
        print("Error: height should be between 10 and 70")
        sys.exit(1)

    # Derive icon ID
    icon_id = name.lower().replace(" ", "_").replace("-", "_")
    icon_id = re.sub(r"[^a-z0-9_]", "", icon_id)
    if form != "potted":
        icon_id += f"_{form}"

    # Auto-detect category — check sci first, then derived name
    cat = args.cat
    if not cat:
        cat = guess_category(sci)
    if not cat or cat == "houseplant":
        cat = guess_category(name) or "houseplant"

    print(f"→ Generating '{name}' ({sci}) — {cat}, {form}")

    # Generate SVG
    svg = generate_icon(
        name=name,
        sci=sci,
        cat=cat,
        form=form,
        plant_height=args.height,
        plant_svg=args.plant_svg,
        icon_id=icon_id,
    )

    if args.dry_run:
        print("\n" + svg)
        return

    # Write SVG
    output_path = args.output or os.path.join(ICONS_DIR, f"{icon_id}.svg")
    os.makedirs(os.path.dirname(output_path) or ICONS_DIR, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(svg)
    print(f"  ✓ Written: icons/{icon_id}.svg")

    # Update manifest
    update_manifest(icon_id, name, sci, cat, form, args.family)

    print(f"\nDone! Open icons/{icon_id}.svg to preview, or check in the app at /icons")
    print(f"  Name:        {name}")
    print(f"  Scientific:  {sci}")
    print(f"  Category:    {cat}")
    print(f"  Form:        {form}")
    print(f"  File:        {icon_id}.svg")


if __name__ == "__main__":
    main()
