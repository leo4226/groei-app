"""Fail if any .svg in public/icons is missing from manifest.json (and vice versa)."""
import json
import os
import sys

ICONS = os.path.join(os.path.dirname(__file__), "..", "public", "icons")


def main() -> int:
    with open(os.path.join(ICONS, "manifest.json"), encoding="utf-8") as f:
        data = json.load(f)
    entries = data["plants"] if isinstance(data, dict) else data
    manifest_files = {e["file"] for e in entries}
    disk = {f for f in os.listdir(ICONS) if f.lower().endswith(".svg")}
    missing = sorted(disk - manifest_files)
    orphan = sorted(manifest_files - disk)
    if missing or orphan:
        print(f"SVGs on disk not in manifest: {missing}")
        print(f"manifest entries with no SVG file: {orphan}")
        return 1
    print(f"OK — {len(disk)} svgs, {len(entries)} manifest entries, in sync")
    return 0


if __name__ == "__main__":
    sys.exit(main())
