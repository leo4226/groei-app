"""Write one potted placeholder SVG per category into public/icons + manifest."""
import importlib.util, json, os, sys

# Load icon_generator directly by file path to avoid polluting sys.path with
# backend/routers (which contains warnings.py that shadows the stdlib module).
_gen_path = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "backend", "routers", "icon_generator.py")
)
_spec = importlib.util.spec_from_file_location("icon_generator", _gen_path)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
generate_icon_svg = _mod.generate_icon_svg

ICONS = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
CATS = ["houseplant", "flower", "succulent", "herb", "edible", "tree",
        "shrub", "grass", "fern", "bulb", "climber", "cactus", "unknown"]


def main() -> int:
    with open(os.path.join(ICONS, "manifest.json"), encoding="utf-8") as f:
        data = json.load(f)
    plants = data["plants"]
    have = {e["id"] for e in plants}
    for cat in CATS:
        icon_id = f"placeholder_{cat}"
        svg = generate_icon_svg(name=cat.title(), sci="", cat=cat, form="potted", icon_id=icon_id)
        with open(os.path.join(ICONS, f"{icon_id}.svg"), "w", encoding="utf-8") as f:
            f.write(svg)
        if icon_id not in have:
            plants.append({"id": icon_id, "name": f"{cat.title()} (placeholder)",
                           "sci": "", "cat": cat, "form": "potted", "family": "",
                           "file": f"{icon_id}.svg"})
    data["count"] = data["iconCount"] = len(plants)
    with open(os.path.join(ICONS, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"wrote {len(CATS)} placeholders; manifest now {len(plants)} entries")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
