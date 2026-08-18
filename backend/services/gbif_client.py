"""GBIF REST helpers shared by catalog tooling (#941).

These used to live in ``scripts/import_gbif_species.py``. The BioCLIP catalog
sync (#866) needs the same species-search call to validate latin names before
they enter the identification catalog, and importing from a one-shot ETL
script was the wrong direction — so the HTTP layer lives here, and the script
re-imports it. One implementation of the API constants, the politeness
throttle, and the match rule for both callers.

Only the species-search surface is shared. Media / vernacular / import-batch
helpers stay in the script where their one-shot workflow uses them.
"""
import asyncio
import logging
import re

import httpx

logger = logging.getLogger(__name__)

GBIF_API = "https://api.gbif.org/v1"
GBIF_SPECIES_SEARCH = f"{GBIF_API}/species/search"

# Rate limiting: 8 req/s to be safe.
_MIN_INTERVAL = 0.125

# GBIF nubKey for Tracheophyta (vascular plants) — excludes archaea, algae, fungi.
TRACHEOPHYTA_KEY = 7707728


async def fetch_json(
    client: httpx.AsyncClient, url: str, params: dict | None = None
) -> dict:
    """GET with the politeness throttle; raises on transport or HTTP errors."""
    await asyncio.sleep(_MIN_INTERVAL)
    resp = await client.get(url, params=params)
    resp.raise_for_status()
    return resp.json()


def normalize_latin_name(value) -> str:
    """Lowercased, whitespace-collapsed name with the × hybrid marker → 'x'.

    GBIF canonical names use U+00D7 ('Monstera × deliciosa'); catalog names
    sometimes write it as an ASCII 'x'. Treating both as equal keeps hybrids
    resolvable without loosening the match to substring containment.
    """
    text = re.sub(r"\s+", " ", str(value or "").strip())
    return text.lower().replace("×", "x")


async def resolve_latin_name(client: httpx.AsyncClient, latin_name: str) -> bool | None:
    """Resolve a latin name against the GBIF backbone.

    Returns:
      True  — GBIF returned an accepted vascular-plant taxon whose canonical
              name matches ``latin_name``.
      False — GBIF answered but no result matched (spurious/misspelled name).
      None  — GBIF unreachable or errored (transient) — caller should retry.
    """
    query = str(latin_name or "").strip()
    if not query:
        return False
    wanted = normalize_latin_name(query)
    try:
        payload = await fetch_json(client, GBIF_SPECIES_SEARCH, {
            "q": query,
            "limit": 5,
            "status": "ACCEPTED",
            "higherTaxonKey": TRACHEOPHYTA_KEY,
        })
    except Exception as exc:
        logger.warning("GBIF species search failed for %r: %s", latin_name, exc)
        return None
    for result in payload.get("results") or []:
        candidate = result.get("canonicalName") or result.get("scientificName") or ""
        if normalize_latin_name(candidate) == wanted:
            return True
    return False


async def fetch_species_by_genus(
    client: httpx.AsyncClient, genus: str, limit: int = 100
) -> list[dict]:
    """Fetch species for a genus via GBIF species/search.

    IMPORTANT: GBIF's species/search is a TEXT search engine — filter params
    (genus=, kingdom=, etc.) are silently IGNORED without a 'q' query string.
    We use q={genus} + post-filter by genus name for correctness.
    """
    results = []
    offset = 0
    while len(results) < limit:
        resp = await fetch_json(client, GBIF_SPECIES_SEARCH, {
            "q": genus,
            "limit": min(100, limit - len(results)),
            "offset": offset,
            "status": "ACCEPTED",
            "higherTaxonKey": TRACHEOPHYTA_KEY,
            "rank": "SPECIES",
        })
        # Post-filter: only keep results that match the requested genus
        valid = [r for r in resp.get("results", [])
                 if (r.get("genus") or "").lower() == genus.lower()]
        results.extend(valid)
        if not resp.get("endOfRecords", True):
            offset += 100
        else:
            break
    return results[:limit]
