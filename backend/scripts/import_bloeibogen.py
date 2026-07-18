"""Ingest Bloeibogen (Naturalis) bee + drachtplant data into committed snapshots.

[bloeibogen.nl](https://www.bloeibogen.nl/) is Naturalis Biodiversity Center's
bee-friendly-planting tool. It exposes a clean, open JSON API — we snapshot it so
the app never depends on it at runtime (same pattern as scripts/import_streken.py):

  - GET https://www.api.bloeibogen.nl/plants → 687 plants: scientificName,
    dutchName, isDrachtplant (bee-forage), isNative, floweringMonths (date
    ranges), CC-licensed image + copyright.
  - GET https://www.api.bloeibogen.nl/bees  → 148 bees: scientificName,
    dutchName, isRedList + redListCat, flightTimes (date ranges).

Output: backend/data/bloeibogen_plants.json + bloeibogen_bees.json.
Plants join cleanly to our plant_species by *scientific name* (unlike
streektuinen's Dutch-only names). Re-runnable / idempotent.

Data © Naturalis Biodiversity Center / Bloeibogen; used with attribution for a
private garden app, not republished wholesale. See issue #709 and
docs/plans/2026-07-18-streek-biodiversity.md.

Usage:
  python -m scripts.import_bloeibogen           # fetch + write snapshots
  python -m scripts.import_bloeibogen --check    # fail if snapshots are stale
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import httpx

BASE = "https://www.api.bloeibogen.nl"
DATA = Path(__file__).parent.parent / "data"
PLANTS_OUT = DATA / "bloeibogen_plants.json"
BEES_OUT = DATA / "bloeibogen_bees.json"

_LICENSE = (
    "Bee & plant data © Naturalis Biodiversity Center / Bloeibogen "
    "(bloeibogen.nl). Images are individually CC-licensed (see per-plant "
    "imageLicense/copyrightText). Used with attribution for a private garden app."
)


def _months_from_ranges(ranges: list[dict]) -> list[int]:
    """Bloeibogen encodes periods as {start,end} ISO dates in a dummy year 2000.
    Flatten to the set of covered month numbers (1..12), inclusive."""
    months: set[int] = set()
    for r in ranges or []:
        try:
            s = int((r.get("start") or "")[5:7])
            e = int((r.get("end") or "")[5:7])
        except (ValueError, TypeError):
            continue
        if not (1 <= s <= 12 and 1 <= e <= 12):
            continue
        m = s
        # inclusive walk s..e, wrapping across the year end if needed
        while True:
            months.add(m)
            if m == e:
                break
            m = m % 12 + 1
    return sorted(months)


def _get(client: httpx.Client, path: str) -> list[dict]:
    resp = client.get(f"{BASE}/{path}")
    resp.raise_for_status()
    payload = resp.json()
    if payload.get("status") != "success":
        raise RuntimeError(f"Unexpected response for /{path}: {payload.get('status')}")
    data = payload["data"]
    return data.get(path) or []


def build(client: httpx.Client) -> tuple[dict, dict]:
    raw_plants = _get(client, "plants")
    raw_bees = _get(client, "bees")

    plants = sorted(
        (
            {
                "scientific_name": p.get("scientificName"),
                "dutch_name": p.get("dutchName"),
                "is_drachtplant": bool(p.get("isDrachtplant")),
                "is_native": bool(p.get("isNative")),
                "flowering_months": _months_from_ranges(p.get("floweringMonths")),
                "image_license": p.get("imageLicense"),
                "copyright_text": p.get("copyrightText"),
            }
            for p in raw_plants
            if p.get("scientificName")
        ),
        key=lambda p: p["scientific_name"].lower(),
    )
    bees = sorted(
        (
            {
                "scientific_name": b.get("scientificName"),
                "dutch_name": b.get("dutchName"),
                "is_red_list": bool(b.get("isRedList")),
                "red_list_category": b.get("redListCat"),
                "flight_months": _months_from_ranges(b.get("flightTimes")),
            }
            for b in raw_bees
            if b.get("scientificName")
        ),
        key=lambda b: b["scientific_name"].lower(),
    )

    plants_doc = {"source": "bloeibogen.nl", "license_note": _LICENSE, "plants": plants}
    bees_doc = {"source": "bloeibogen.nl", "license_note": _LICENSE, "bees": bees}
    return plants_doc, bees_doc


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="fail (exit 1) if a committed snapshot differs from live")
    args = ap.parse_args()

    with httpx.Client(timeout=30, headers={"User-Agent": "floreren.app bloeibogen import"}) as client:
        plants_doc, bees_doc = build(client)

    outputs = [(PLANTS_OUT, plants_doc), (BEES_OUT, bees_doc)]
    if args.check:
        stale = False
        for path, doc in outputs:
            text = json.dumps(doc, ensure_ascii=False, indent=2) + "\n"
            if not path.exists() or path.read_text(encoding="utf-8") != text:
                print(f"{path.name} is STALE — re-run `python -m scripts.import_bloeibogen`")
                stale = True
        return 1 if stale else 0

    for path, doc in outputs:
        path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    dracht = sum(1 for p in plants_doc["plants"] if p["is_drachtplant"])
    redlist = sum(1 for b in bees_doc["bees"] if b["is_red_list"])
    print(f"Wrote {PLANTS_OUT.name} ({len(plants_doc['plants'])} plants, {dracht} drachtplanten) "
          f"and {BEES_OUT.name} ({len(bees_doc['bees'])} bees, {redlist} red-list).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
