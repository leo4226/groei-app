"""Forgiving plant-name and photo matching for the garden game.

The game grades a guest who is *standing in front of a plant with a phone*,
which is a much softer target than the main identify flow. PlantNet and BioCLIP
routinely come back one rank off (genus right, species wrong) or decorated with
an author citation, and telling a guest they are wrong while they are pointing
at the correct plant is the fastest way to kill a party. So matching here is
deliberately more generous than `routers/plant_id.py`:

- author citations, cultivar quotes and infraspecific ranks are stripped
- a genus-level hit counts as correct
- every stored photo of the target plant is a valid visual reference, not just
  its profile shot

False accepts are the cheaper error: the worst case is a guest getting a drink
they hadn't quite earned.
"""

import base64
import binascii
import re

import numpy as np

#: 512 float32 — the BioCLIP embedding width, shared with services/user_refs.py.
EMBEDDING_BYTES = 2048
EMBEDDING_DIM = 512

#: Rank markers that introduce an infraspecific epithet we don't care about.
_RANK_MARKERS = frozenset({
    "subsp", "ssp", "subspecies", "var", "variety", "varietas",
    "f", "form", "forma", "cv", "cultivar", "sect", "subg", "ser", "group",
})

#: Anything parenthesised is an author citation or a synonym note.
_PARENS = re.compile(r"\([^)]*\)")
#: 'Frances Williams' / "Frances Williams" — cultivar epithets.
_QUOTED = re.compile(r"['\"‘’“”][^'\"‘’“”]*['\"‘’“”]")
#: Hybrid markers, which appear as ×, x or X depending on the source.
_HYBRID = re.compile(r"(?:^|\s)[x×✕](?=\s|[A-Z])", re.IGNORECASE)


def normalise_common(name: str) -> str:
    """Loose normalisation for common names — case, accents-as-typed, spacing."""
    if not name:
        return ""
    cleaned = re.sub(r"[^\w\s-]", " ", name.lower())
    return re.sub(r"\s+", " ", cleaned).strip()


def normalise_latin(name: str) -> str:
    """Reduce a scientific name to a bare 'genus epithet' (or just 'genus').

    'Hosta sieboldiana (Lodd.) Engl.'      -> 'hosta sieboldiana'
    "Hosta 'Frances Williams'"             -> 'hosta'
    'Rosa x damascena Mill.'               -> 'rosa damascena'
    'Salvia officinalis subsp. lavandulifolia' -> 'salvia officinalis'
    """
    if not name:
        return ""
    text = _PARENS.sub(" ", name)
    text = _QUOTED.sub(" ", text)
    text = _HYBRID.sub(" ", text)
    text = re.sub(r"[^\w\s.-]", " ", text)

    tokens: list[str] = []
    for raw in text.split():
        token = raw.strip(".").lower()
        if not token or not token.replace("-", "").isalpha():
            continue
        # A rank marker means everything after it is infraspecific detail.
        if token in _RANK_MARKERS:
            break
        # Author citations are capitalised mid-name; by the time we have a
        # genus + epithet, anything further is authorship, not taxonomy.
        tokens.append(token)
        if len(tokens) == 2:
            break
    return " ".join(tokens)


def genus_of(name: str) -> str:
    """First token of the normalised scientific name, or '' if there isn't one."""
    normalised = normalise_latin(name)
    return normalised.split(" ")[0] if normalised else ""


def name_matches(
    scanned: str,
    target_latin: str,
    target_genus: str,
    common_names: list[str],
) -> str | None:
    """Grade one candidate name against the round's target.

    Returns the match kind — 'exact', 'genus' or 'common' — or None. The kind is
    surfaced to the host screen so a suspicious run of genus-only hits is
    visible rather than silent.
    """
    if not scanned:
        return None

    scanned_latin = normalise_latin(scanned)
    target_latin_n = normalise_latin(target_latin)

    if scanned_latin and target_latin_n and scanned_latin == target_latin_n:
        return "exact"

    # Common names first among the softer checks: an identifier returning
    # "Hartlelie" for a Hosta is a stronger signal than a bare genus hit.
    scanned_common = normalise_common(scanned)
    if scanned_common:
        for candidate in common_names:
            if candidate and normalise_common(candidate) == scanned_common:
                return "common"

    # Genus-level rescue — the single most common near-miss in the field.
    scanned_genus = scanned_latin.split(" ")[0] if scanned_latin else ""
    target_g = (target_genus or genus_of(target_latin)).lower()
    if scanned_genus and target_g and scanned_genus == target_g:
        return "genus"

    return None


def best_name_match(
    candidates: list[str],
    target_latin: str,
    target_genus: str,
    common_names: list[str],
) -> str | None:
    """Strongest match kind across all candidate names, or None."""
    ranking = {"exact": 3, "common": 2, "genus": 1}
    best: str | None = None
    for candidate in candidates:
        kind = name_matches(candidate, target_latin, target_genus, common_names)
        if kind and (best is None or ranking[kind] > ranking[best]):
            best = kind
    return best


# ── Embedding similarity ─────────────────────────────────────────────────────

def as_vector(embedding: bytes | None) -> np.ndarray | None:
    """Raw float32 bytes -> unit-normalised vector, or None if malformed."""
    if not embedding or len(embedding) != EMBEDDING_BYTES:
        return None
    vector = np.frombuffer(embedding, dtype=np.float32)
    norm = float(np.linalg.norm(vector))
    return vector / norm if norm else None


def decode_b64_vector(encoded: str | None) -> np.ndarray | None:
    """Base64 float32 bytes -> unit-normalised vector, or None if malformed."""
    if not encoded:
        return None
    try:
        return as_vector(base64.b64decode(encoded))
    except (binascii.Error, ValueError):
        return None


def encode_vector(embedding: bytes) -> str:
    return base64.b64encode(embedding).decode()


def best_similarity(scan: np.ndarray | None, references: list[np.ndarray]) -> float:
    """Highest cosine similarity between the scan and any reference photo.

    Max rather than mean on purpose: a plant photographed from the other side,
    or in flower vs. out of it, only needs to resemble *one* stored photo.
    """
    if scan is None or not references:
        return 0.0
    return float(max(float(np.dot(scan, ref)) for ref in references))
