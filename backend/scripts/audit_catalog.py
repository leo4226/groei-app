#!/usr/bin/env python3
"""Audit the plant_species catalog — is it a useful, NL/Europe-relevant set?

Read-only, no GPU. Answers the "can we trust the ~2k?" question with real numbers
before we spend GPU time image-anchoring it (see
docs/plans/2026-07-07-bioclip-catalog-expansion.md):

  - size, and NL-native vs non-native vs unknown-region (native_to_nl)
  - genus bloat: genera padded with global congeners (the sourcing was genus-driven,
    up to 100 species/genus from GBIF worldwide with no geographic filter)
  - localisation: how many have a Dutch / English common name
  - readiness: how many have reference images (needed for image-anchoring) and care data

Usage:
    python scripts/audit_catalog.py [--top-genera N] [--bloat-threshold N]

The DB layer is imported lazily inside main(), so summarize()/format_report() are
importable (and unit-tested) without a database connection.
"""
import argparse
import asyncio
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _has_text(value, latin_name=None) -> bool:
    """True if value is a non-empty name that isn't just the Latin name echoed back."""
    if value is None:
        return False
    text = str(value).strip()
    if not text:
        return False
    if latin_name and text.casefold() == str(latin_name).strip().casefold():
        return False
    return True


def _has_care(value) -> bool:
    if value is None:
        return False
    text = str(value).strip()
    return text not in ("", "{}", "null", "[]")


def summarize(rows: list[dict], top_genera: int = 20, bloat_threshold: int = 40) -> dict:
    """Aggregate plant_species rows into catalog-health metrics. Pure — no I/O."""
    total = len(rows)
    native = sum(1 for r in rows if r.get("native_to_nl") is True)
    non_native = sum(1 for r in rows if r.get("native_to_nl") is False)
    unknown_region = total - native - non_native
    invasive = sum(1 for r in rows if r.get("invasive_nl") is True)

    has_nl = sum(1 for r in rows if _has_text(r.get("common_name_nl"), r.get("latin_name")))
    has_en = sum(1 for r in rows if _has_text(r.get("common_name_en"), r.get("latin_name")))
    with_images = sum(1 for r in rows if (r.get("images_count") or 0) > 0)
    with_care = sum(1 for r in rows if _has_care(r.get("care_thresholds")))

    genus_counts = Counter((r.get("genus") or "?") for r in rows)
    bloated = {g: n for g, n in genus_counts.items() if n >= bloat_threshold}
    bloat_rows = sum(bloated.values())

    return {
        "total": total,
        "native_nl": native,
        "non_native": non_native,
        "unknown_region": unknown_region,
        "invasive_nl": invasive,
        "has_nl_name": has_nl,
        "has_en_name": has_en,
        "with_images": with_images,
        "with_care": with_care,
        "distinct_genera": len(genus_counts),
        "top_genera": genus_counts.most_common(top_genera),
        "bloated_genera": sorted(bloated.items(), key=lambda x: -x[1]),
        "bloat_rows": bloat_rows,
        "bloat_threshold": bloat_threshold,
    }


def _pct(n: int, total: int) -> str:
    return f"{100 * n / total:.0f}%" if total else "0%"


def format_report(s: dict) -> str:
    t = s["total"]
    lines = [
        "",
        "plant_species catalog audit",
        "=" * 40,
        f"Total species: {t}",
        f"Distinct genera: {s['distinct_genera']}",
        "",
        "Region relevance (native_to_nl):",
        f"  NL-native:       {s['native_nl']:>5}  ({_pct(s['native_nl'], t)})",
        f"  non-native:      {s['non_native']:>5}  ({_pct(s['non_native'], t)})",
        f"  unknown/unfilled:{s['unknown_region']:>5}  ({_pct(s['unknown_region'], t)})",
        f"  invasive in NL:  {s['invasive_nl']:>5}",
        "",
        "Localisation / readiness:",
        f"  has Dutch name:  {s['has_nl_name']:>5}  ({_pct(s['has_nl_name'], t)})",
        f"  has English name:{s['has_en_name']:>5}  ({_pct(s['has_en_name'], t)})",
        f"  has ref image:   {s['with_images']:>5}  ({_pct(s['with_images'], t)})   <- image-anchoring candidates",
        f"  has care data:   {s['with_care']:>5}  ({_pct(s['with_care'], t)})",
        "",
        f"Genus bloat (>= {s['bloat_threshold']} species/genus — likely global congeners):",
        f"  {len(s['bloated_genera'])} bloated genera holding {s['bloat_rows']} rows ({_pct(s['bloat_rows'], t)} of catalog)",
    ]
    for g, n in s["bloated_genera"][:15]:
        lines.append(f"    {g:<20} {n}")
    lines += ["", f"Top {len(s['top_genera'])} genera by count:"]
    for g, n in s["top_genera"]:
        lines.append(f"    {g:<20} {n}")
    lines += [
        "",
        "Read: a large unknown/unfilled region share means native_to_nl needs a",
        "backfill before it can drive a geographic prior; big bloated genera + a low",
        "NL-native share confirm the 'too broad globally, too narrow for NL wild flora'",
        "finding. High has-ref-image share means phase-1 image-anchoring is feasible now.",
    ]
    return "\n".join(lines)


async def main(top_genera: int, bloat_threshold: int):
    # Load backend/.env explicitly (independent of CWD) so DATABASE_URL is set.
    # Kept inside main() so the pure summarize()/format_report() stay importable
    # (and unit-testable) without python-dotenv installed.
    try:
        from dotenv import load_dotenv
        load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    except ImportError:
        pass
    from database import init_pool, close_pool, get_db  # lazy: keep module import-light
    await init_pool()
    try:
        async with get_db() as db:
            rows = await db.execute_fetchall(
                "SELECT genus, family, native_to_nl, invasive_nl, common_name_nl, "
                "common_name_en, latin_name, images_count, care_thresholds "
                "FROM plant_species"
            )
        rows = [dict(r) for r in rows]
    finally:
        await close_pool()
    print(format_report(summarize(rows, top_genera, bloat_threshold)))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--top-genera", type=int, default=20)
    p.add_argument("--bloat-threshold", type=int, default=40)
    args = p.parse_args()
    asyncio.run(main(args.top_genera, args.bloat_threshold))
