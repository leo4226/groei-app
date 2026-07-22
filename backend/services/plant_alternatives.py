"""Same-function, right-size alternatives for large garden plants.

For a plant that's too big for the garden (recommendation.size_fit ==
'large_for_space'), we offer a shortlist of smaller plants serving the same
ecological function — so "best plant" can mean "best that fits". The mapping
is a committed, curated snapshot (data/plant_alternatives.json), loaded once
into memory and looked up by scientific name; no DB column or backfill needed.
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

_SNAPSHOT = Path(__file__).parent.parent / "data" / "plant_alternatives.json"
_CACHE: dict[str, dict] | None = None


def _sci_key(name: str) -> str:
    s = unicodedata.normalize("NFKD", name or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return " ".join(re.findall(r"[a-z]+", s)[:2])


def _load() -> dict[str, dict]:
    """Lazy-load the snapshot, keyed by sci_key. Guarded: a missing/broken file
    just means no alternatives are ever offered (the feature degrades to off)."""
    global _CACHE
    if _CACHE is None:
        try:
            raw = json.loads(_SNAPSHOT.read_text(encoding="utf-8")).get("alternatives", {})
            _CACHE = {_sci_key(k): v for k, v in raw.items()}
        except Exception:
            _CACHE = {}
    return _CACHE


def alternatives_raw(latin_name: str | None) -> dict | None:
    """The raw bilingual entry for a big plant (function_nl/en + picks with
    note_nl/en), or None. The frontend localizes; the backend stays neutral."""
    if not latin_name:
        return None
    return _load().get(_sci_key(latin_name))


def alternatives_for(latin_name: str | None, lang: str = "nl") -> dict | None:
    """Return {function, picks:[{dutch_name, latin_name, note}]} for a big plant,
    localized to `lang`, or None when we have no curated alternatives for it."""
    if not latin_name:
        return None
    entry = _load().get(_sci_key(latin_name))
    if not entry:
        return None
    en = lang == "en"
    return {
        "function": entry.get("function_en" if en else "function_nl", ""),
        "picks": [
            {
                "dutch_name": p["dutch_name"],
                "latin_name": p["latin_name"],
                "note": p.get("note_en" if en else "note_nl", ""),
            }
            for p in entry.get("picks", [])
        ],
    }
