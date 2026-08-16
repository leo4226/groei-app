"""Guess-the-plant quiz (solo mode, phase 1).

The existing garden game is a physical find-and-scan hunt; this is a
knowledge quiz over the household plant collection. The app picks a random
plant with a photo, the player free-texts a guess (fuzzy-matched against
NL/EN/Latin names), and on a miss gets a 4-option multiple-choice second
chance at half points. Stateless: no sessions, no tables, no persistence —
the client holds the round list and score.

POST /quiz/rounds    sample N plants (names NOT returned — no answer leak)
POST /quiz/guess     free-text guess → correct (100) or MC options
POST /quiz/mc        MC pick → correct (50) or wrong, always reveals

Design: docs/plans/2026-08-07-guess-plant-design.md
"""
import random
import unicodedata
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from auth import require_editor
from database import db_dep

router = APIRouter(prefix="/quiz", tags=["quiz"])

# MC options need a target + at least 3 distractors from other plants.
MIN_PHOTOS = 4
DEFAULT_COUNT = 10
MAX_COUNT = 50

FREE_TEXT_POINTS = 100
MC_POINTS = 50


# ── Name normalisation + fuzzy matching ──────────────────────────────────────

def _normalise(s: str) -> str:
    """Lowercase, strip diacritics, collapse whitespace."""
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return " ".join(s.lower().split())


def _levenshtein(a: str, b: str) -> int:
    """Classic DP edit distance (both strings small in practice)."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(
                prev[j] + 1,          # deletion
                cur[j - 1] + 1,       # insertion
                prev[j - 1] + (ca != cb),  # substitution
            ))
        prev = cur
    return prev[-1]


def _token_prefixes(guess: str, candidate: str) -> bool:
    """Every whitespace token of the guess is a prefix of some candidate token.

    'monstera' matches 'Monstera deliciosa'; 'monster delici' also does.
    """
    guess_tokens = guess.split()
    cand_tokens = candidate.split()
    if not guess_tokens:
        return False
    return all(
        any(tok.startswith(g) for tok in cand_tokens)
        for g in guess_tokens
    )


def _name_matches(guess: str, candidates: list[str]) -> bool:
    """Fuzzy match a guess against one plant's full set of names."""
    g = _normalise(guess)
    if not g:
        return False
    norm = [_normalise(c) for c in candidates if c]
    if any(g == c for c in norm):
        return True
    if any(g in c for c in norm):           # contains: 'deliciosa' in the full name
        return True
    if any(_token_prefixes(g, c) for c in norm):
        return True
    # Typo tolerance against whole names AND individual tokens ('ficuss' ~ 'ficus').
    for c in norm:
        if len(c) >= 4 and _levenshtein(g, c) <= 2:
            return True
        if any(len(tok) >= 4 and _levenshtein(g, tok) <= 2 for tok in c.split()):
            return True
    return False


# ── Pydantic models ──────────────────────────────────────────────────────────

class RoundsRequest(BaseModel):
    count: int = DEFAULT_COUNT


class GuessRequest(BaseModel):
    plant_id: int
    guess: str


class McRequest(BaseModel):
    plant_id: int
    picked_id: int


class PlantNames(BaseModel):
    plant_id: int
    name_nl: str
    name_en: Optional[str] = None


class Reveal(BaseModel):
    plant_id: int
    name_nl: str
    name_en: Optional[str] = None
    latin_name: Optional[str] = None
    photo_url: Optional[str] = None


# ── Shared query ─────────────────────────────────────────────────────────────

_PLANT_SELECT = """
    SELECT p.id, p.name, p.species, p.photo_path,
           s.common_name_nl, s.common_name_en, s.latin_name
    FROM plants p
    JOIN maps m ON m.id = p.map_id
    LEFT JOIN plant_species s ON s.id = p.species_id
    WHERE m.household_id = ? AND p.is_active = 1
          AND p.photo_path IS NOT NULL AND p.photo_path != ''
"""


def _row_to_names(row: dict) -> list[str]:
    return [row["name"], row["species"], row["common_name_nl"], row["common_name_en"], row["latin_name"]]


def _row_to_reveal(row: dict) -> dict:
    return {
        "plant_id": row["id"],
        "name_nl": row["common_name_nl"] or row["name"],
        "name_en": row["common_name_en"],
        "latin_name": row["latin_name"],
        "photo_url": row["photo_path"],
    }


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/rounds", status_code=201)
async def create_rounds(
    body: RoundsRequest,
    db=Depends(db_dep),
    account=Depends(require_editor),
):
    rows = await db.execute_fetchall(
        _PLANT_SELECT + " ORDER BY p.id", (account["household_id"],)
    )
    pool = [dict(r) for r in rows]
    if len(pool) < MIN_PHOTOS:
        raise HTTPException(400, "Not enough plants with photos for a quiz")

    k = min(max(body.count, 1), MAX_COUNT, len(pool))
    # random.sample also shuffles, so round order never follows insertion order.
    chosen = random.sample(pool, k)
    return [
        {"round_id": r["id"], "photo_url": r["photo_path"]}
        for r in chosen
    ]


@router.post("/guess")
async def guess_plant(
    body: GuessRequest,
    db=Depends(db_dep),
    account=Depends(require_editor),
):
    rows = await db.execute_fetchall(
        _PLANT_SELECT + " AND p.id = ?", (account["household_id"], body.plant_id)
    )
    if not rows:
        raise HTTPException(404, "Plant not found")
    target = dict(rows[0])

    if _name_matches(body.guess, _row_to_names(target)):
        return {
            "is_correct": True,
            "points": FREE_TEXT_POINTS,
            "options": None,
            "reveal": _row_to_reveal(target),
        }

    # Miss → hand back 4 MC options (target + 3 household distractors).
    # Seeded on the plant id so every client would see the same choices
    # (phase 2 party mode renders identical screens without a round table).
    all_rows = await db.execute_fetchall(
        _PLANT_SELECT + " AND p.id != ? ORDER BY p.id",
        (account["household_id"], body.plant_id),
    )
    distractors = [dict(r) for r in all_rows]
    # Prefer distractors with different names so a single-species household
    # doesn't show four near-identical options; fall back to any.
    target_norm = {_normalise(n) for n in _row_to_names(target) if n}
    different = [
        d for d in distractors
        if not any(_normalise(n) in target_norm for n in _row_to_names(d) if n)
    ]
    different = different or distractors

    rand = _mulberry32(body.plant_id)
    sample = random.sample(different, min(3, len(different)))
    # Re-seed with the shuffled sample to keep it deterministic given the pool.
    options = [_option_dict(target)] + [_option_dict(d) for d in sample]
    options.sort(key=lambda o: rand())

    return {
        "is_correct": False,
        "points": 0,
        "options": options,
        "reveal": None,
    }


@router.post("/mc")
async def mc_pick(
    body: McRequest,
    db=Depends(db_dep),
    account=Depends(require_editor),
):
    rows = await db.execute_fetchall(
        _PLANT_SELECT + " AND p.id = ?", (account["household_id"], body.plant_id)
    )
    if not rows:
        raise HTTPException(404, "Plant not found")
    target = dict(rows[0])

    is_correct = body.picked_id == body.plant_id
    return {
        "is_correct": is_correct,
        "points": MC_POINTS if is_correct else 0,
        "reveal": _row_to_reveal(target),
    }


# ── Small helpers ────────────────────────────────────────────────────────────

def _option_dict(row: dict) -> dict:
    return {
        "plant_id": row["id"],
        "name_nl": row["common_name_nl"] or row["name"],
        "name_en": row["common_name_en"],
    }


def _mulberry32(seed: int):
    """Deterministic PRNG shared with GameQuizRound.tsx (mulberry32)."""
    a = seed & 0xFFFFFFFF

    def rand() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = a
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t = (t + ((t ^ (t >> 7)) * (t | 61))) & 0xFFFFFFFF
        t = t ^ (t >> 14)
        return (t & 0xFFFFFFFF) / 4294967296

    return rand
