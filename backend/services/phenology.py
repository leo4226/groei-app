"""Shared phenology-JSON parsing (audit F2 consolidation).

The `phenology_json` column of `plant_species` is a JSON string that every
surface (map, plants, species, discoveries, share, spots, admin, care) has to
decode before it can read months/facts from it. Historically each surface
re-implemented the same parse with slightly different edge-case handling —
which is how latent variants of fixed bugs survived. This module is the single,
guarded variant: parse failures and non-object JSON become `None` instead of a
500 or a crash.
"""

import json


def parse_phenology(row) -> dict | None:
    """Parse a row's `phenology_json` into a dict, or `None`.

    Accepts either a mapping that contains a `phenology_json` key (a DB row or
    plant dict — the key is popped so the raw column never leaks into outputs)
    or the raw column value itself (JSON string; an already-parsed dict is
    passed through). A mapping without the key, an empty value, invalid JSON,
    or JSON that is not an object all yield `None`. Never raises.
    """
    if isinstance(row, dict):
        if "phenology_json" not in row:
            return None
        raw = row.pop("phenology_json")
    else:
        raw = row
    if not raw:
        return None
    if isinstance(raw, dict):
        return raw
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    return data if isinstance(data, dict) else None
